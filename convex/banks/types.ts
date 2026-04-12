/**
 * Common interface all bank providers must implement.
 * Add a new bank by creating a file in convex/banks/ and registering it in registry.ts.
 */

export interface NormalizedTransaction {
  /** Stable unique ID from the bank — used for upsert deduplication */
  externalId: string;
  datePosted: string;     // YYYY-MM-DD
  dateExecuted: string;   // YYYY-MM-DD
  type: string;
  merchantName: string;
  details: string;
  amount: number;         // positive = credit, negative = debit
  fees: number;
  cardholderName: string;
  accountIdentifier: string;  // card/sub-identifier if any
}

export interface NormalizedAccount {
  accountNumber: string;  // canonical identifier used as FK
  name: string;           // bank-provided name
  institution: string;
  currency: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: string;  // ISO string
}

export interface BankProvider {
  readonly bank: string;    // e.g. "fio", "revolut"

  /**
   * Build the URL to redirect the user to for authorization.
   * integrationId is passed as the OAuth state param so the callback
   * knows which integration row to update.
   */
  getAuthUrl(integrationId: string, callbackUrl: string): string;

  /** Exchange authorization code for tokens */
  exchangeCode(code: string, callbackUrl: string): Promise<TokenSet>;

  /** Refresh access token using refresh token */
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;

  /** List all accounts accessible with this token */
  listAccounts(accessToken: string): Promise<NormalizedAccount[]>;

  /** Fetch transactions for one account in a date range */
  fetchTransactions(
    accessToken: string,
    accountNumber: string,
    from: string,
    to: string,
  ): Promise<NormalizedTransaction[]>;
}
