export interface CategorizationRequest {
  merchantName: string;
  details: string;
  amount: number;
  transactionType: string;
}

export interface CategorizationResponse {
  cat3: string;
  confidence: number;
}

export interface RuleSuggestion {
  pattern: string;
  field: 'merchantName' | 'details';
  matchType: 'contains' | 'exact' | 'startsWith';
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
