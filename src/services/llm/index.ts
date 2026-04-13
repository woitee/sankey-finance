import { AISDKProvider } from './ai-sdk-provider';

export type { LLMProvider, CategorizationRequest, CategorizationResponse, RuleSuggestion } from './types';
export { AISDKProvider };

export function createLLMProvider() {
  return new AISDKProvider();
}
