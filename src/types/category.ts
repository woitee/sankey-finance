export type Cat1 = 'MUST' | 'WANT' | 'MUST_WANT' | 'INCOME' | 'TRANSFER';

export type Cat2 = string;

export type CategoryHierarchy = Record<string, { cat2: string; cat1: string }>;
