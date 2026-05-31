import type { RuleMatcher } from '../../rules/matcher';

export interface CategorizationRequest {
  merchantName: string;
  details: string;
  amount: number;
  transactionType: string;
}

export interface CategorizationResponse {
  type: string;
  category: string;
  subcategory: string;
  confidence: number;
}

export interface RuleSuggestion {
  pattern: string;
  field: 'merchantName' | 'details';
  matchType: 'contains' | 'exact' | 'startsWith' | 'word' | 'regex';
  caseSensitive?: boolean;
  matcher?: RuleMatcher | null;
  type: string;
  category: string;
  subcategory: string;
}

export interface CategorizationResult {
  responses: CategorizationResponse[];
  ruleSuggestions: RuleSuggestion[];
}

export interface LLMProvider {
  name: string;
  categorize(
    requests: CategorizationRequest[],
    validSubcategoryValues: string[],
  ): Promise<CategorizationResult>;
}
