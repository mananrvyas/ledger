import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPlaidClient,
  PLAID_PRODUCTS,
  PLAID_COUNTRY_CODES,
  PLAID_CLIENT_NAME,
} from "@/lib/plaid";

function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_URL ??
    "";
  return url.startsWith("http") ? url : `https://${url}`;
}

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await _request.json().catch(() => ({}) as Record<string, unknown>);
  const accessToken =
    typeof body === "object" && body !== null && "access_token" in body
      ? (body.access_token as string | undefined)
      : undefined;

  // Plaid Layer pre-fills the user's number when we pass `phone_number`.
  // - Sandbox: only Plaid's magic test numbers work, so use +14155550123.
  // - Production: pre-fill the user's own profile number if they've set it.
  //   Falls back to "ask in Layer" if they haven't.
  // No more hardcoded sandbox number leaking into a friend's production link.
  const isSandbox = process.env.PLAID_ENV === "sandbox";
  let phoneNumber: string | undefined;
  if (isSandbox) {
    phoneNumber = "+14155550123";
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_number")
      .eq("user_id", user.id)
      .maybeSingle();
    phoneNumber = profile?.whatsapp_number ?? undefined;
  }

  const plaid = getPlaidClient();
  try {
    const linkResp = await plaid.linkTokenCreate({
      user: {
        client_user_id: user.id,
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      },
      client_name: PLAID_CLIENT_NAME,
      products: accessToken ? undefined : PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
      webhook: `${getAppUrl()}/api/plaid/webhook`,
      // For "update mode" (reconnect after ITEM_LOGIN_REQUIRED):
      access_token: accessToken,
      // Ask Plaid for the maximum history (24 months). Default is 90 days.
      // Each bank caps this independently — Chase typically gives 24 months,
      // smaller institutions sometimes only 12 or 6.
      transactions: {
        days_requested: 730,
      },
    });

    return Response.json({ link_token: linkResp.data.link_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plaid error";
    return Response.json({ error: message }, { status: 500 });
  }
}
