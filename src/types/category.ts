export type Cat1 = 'MUST' | 'WANT' | 'MUST/WANT' | 'INCOME' | 'TRANSFER';

export type Cat2 = string;

export type CategoryHierarchy = Record<string, { category: string; type: string }>;
