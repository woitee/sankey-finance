export type TransactionType =
  | 'platba_kartou'
  | 'prichozi_uhrada'
  | 'odchozi_uhrada'
  | 'trvaly_prikaz'
  | 'vraceni_penez'
  | 'odmena_unity'
  | 'other';

export interface Transaction {
  id: string;
  datePosted: string;
  dateExecuted: string;
  type: TransactionType;
  cardholderName: string;
  accountIdentifier: string;
  merchantName: string;
  details: string;
  amount: number;
  fees: number;
  cat3: string | null;
  cat2: string | null;
  cat1: string | null;
  categorizationSource: 'rule' | 'correction' | 'llm' | 'manual' | null;
  ruleId?: string | null;
  groupId: string | null;
  groupLabel: string | null;
}

export interface ParsedStatement {
  period: string;
  accountNumber: string;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalDebits: number;
  transactions: Transaction[];
}
