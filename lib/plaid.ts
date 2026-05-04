import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  type CountryCode,
  type Products,
} from "plaid";

let cached: PlaidApi | null = null;

/**
 * Plaid Node SDK client. Singleton per process. Server-only.
 */
export function getPlaidClient(): PlaidApi {
  if (cached) return cached;

  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const basePath = PlaidEnvironments[env];

  if (!basePath) {
    throw new Error(`Unknown PLAID_ENV: ${env}`);
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
        "Plaid-Version": "2020-09-14",
      },
    },
  });

  cached = new PlaidApi(configuration);
  return cached;
}

/**
 * Products we request when initializing Plaid Link.
 * Transactions covers ledgers; we'll add Liabilities and Investments later.
 */
export const PLAID_PRODUCTS: Products[] = ["transactions" as Products];

export const PLAID_COUNTRY_CODES: CountryCode[] = ["US" as CountryCode];

/**
 * Display name shown to the user inside Plaid Link.
 */
export const PLAID_CLIENT_NAME = "Finance — a quiet ledger";
