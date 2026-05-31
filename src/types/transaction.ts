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
  transactionType: TransactionType;
  cardholderName: string;
  accountIdentifier: string;
  merchantName: string;
  details: string;
  amount: number;
  fees: number;
  subcategory: string | null;
  category: string | null;
  type: string | null;
  categorizationSource: 'rule' | 'unverified_rule' | 'llm' | 'manual' | null;
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
