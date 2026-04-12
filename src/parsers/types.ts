export interface ParsedTransaction {
  datePosted: string;        // ISO YYYY-MM-DD
  dateExecuted: string;      // ISO YYYY-MM-DD
  type: string;              // e.g. "platba_kartou"
  cardholderName: string;    // source (outgoing) or sender name/account (incoming)
  accountIdentifier: string; // masked card number or IBAN
  merchantName: string;
  details: string;
  amount: number;            // negative = debit, positive = credit
  fees: number;
}

export interface ParsedStatement {
  period: string;            // YYYY-MM
  accountNumber: string;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalDebits: number;
  transactions: ParsedTransaction[];
}

/** A parser that recognises and parses a specific bank's statement format. */
export interface BankParser {
  readonly name: string;
  /** Return true if this parser can handle the given file. Should be fast. */
  detect(file: File): Promise<boolean>;
  /** Parse the file into structured statement data. */
  parse(file: File): Promise<ParsedStatement>;
}
