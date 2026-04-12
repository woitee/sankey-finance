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

export interface LLMProvider {
  name: string;
  categorize(
    requests: CategorizationRequest[],
    validCat3Values: string[],
  ): Promise<CategorizationResponse[]>;
}
