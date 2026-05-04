import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Wraps the pgcrypto-backed RPCs (store_plaid_item / get_plaid_access_token)
 * with the encryption passphrase. Plaintext access tokens never live in JS for
 * longer than the call that uses them.
 */

function getPassphrase(): string {
  const passphrase = process.env.ENCRYPTION_PASSPHRASE;
  if (!passphrase || passphrase.length < 16) {
    throw new Error(
      "ENCRYPTION_PASSPHRASE missing or too short (>=16 chars required)",
    );
  }
  return passphrase;
}

export type StoredPlaidItem = {
  id: string;
  user_id: string;
  plaid_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: string;
  created_at: string;
};

export async function storePlaidItem(params: {
  userId: string;
  accessToken: string;
  itemId: string;
  institutionName: string;
  institutionId: string;
}): Promise<StoredPlaidItem> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_plaid_item", {
    p_user_id: params.userId,
    p_access_token: params.accessToken,
    p_item_id: params.itemId,
    p_institution_name: params.institutionName,
    p_institution_id: params.institutionId,
    p_passphrase: getPassphrase(),
  });

  if (error || !data) {
    throw new Error(
      `store_plaid_item failed: ${error?.message ?? "no data returned"}`,
    );
  }

  // The RPC returns the inserted row; cast to our trimmed view.
  const row = data as unknown as StoredPlaidItem;
  return {
    id: row.id,
    user_id: row.user_id,
    plaid_item_id: row.plaid_item_id,
    institution_id: row.institution_id,
    institution_name: row.institution_name,
    status: row.status,
    created_at: row.created_at,
  };
}

export async function getDecryptedAccessToken(
  plaidItemUuid: string,
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_plaid_access_token", {
    p_item_id: plaidItemUuid,
    p_passphrase: getPassphrase(),
  });

  if (error || !data) {
    throw new Error(
      `get_plaid_access_token failed: ${error?.message ?? "missing"}`,
    );
  }

  return data as unknown as string;
}
