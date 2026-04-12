export type Cat1 = 'MUST' | 'WANT' | 'INCOME';

export type Cat2 = string;

export type CategoryHierarchy = Record<string, { cat2: string; cat1: string }>;

export interface CorrectionEntry {
  merchantPattern: string;
  cat3: string;
  cat2?: string;
  cat1?: string;
  note?: string;
  createdAt: string;
}

export interface CorrectionsDB {
  version: number;
  corrections: CorrectionEntry[];
}
