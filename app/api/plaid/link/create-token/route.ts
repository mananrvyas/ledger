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

  // In sandbox, pre-fill the phone number with a Plaid sandbox-valid value so
  // Plaid Layer skips the phone-entry step (OTP `123456` still required).
  // In production, leave it unset — Plaid Layer will ask the user for their
  // real number, or skip Layer entirely depending on their setup.
  const isSandbox = process.env.PLAID_ENV === "sandbox";

  const plaid = getPlaidClient();
  try {
    const linkResp = await plaid.linkTokenCreate({
      user: {
        client_user_id: user.id,
        ...(isSandbox ? { phone_number: "+14155550123" } : {}),
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
