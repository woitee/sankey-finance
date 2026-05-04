import type { RuleMatcher } from '../../rules/matcher';

export interface CategorizationRequest {
  merchantName: string;
  details: string;
  amount: number;
  transactionType: string;
}

export interface CategorizationResponse {
  cat1: string;
  cat2: string;
  cat3: string;
  confidence: number;
}

export interface RuleSuggestion {
  pattern: string;
  field: 'merchantName' | 'details';
  matchType: 'contains' | 'exact' | 'startsWith' | 'word' | 'regex';
  caseSensitive?: boolean;
  matcher?: RuleMatcher | null;
  cat1: string;
  cat2: string;
  cat3: string;
}

export interface CategorizationResult {
  responses: CategorizationResponse[];
  ruleSuggestions: RuleSuggestion[];
}

export interface LLMProvider {
  name: string;
  categorize(
    requests: CategorizationRequest[],
    validCat3Values: string[],
  ): Promise<CategorizationResult>;
}
