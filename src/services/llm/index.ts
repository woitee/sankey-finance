import { HttpProvider } from './http-provider';

export type { LLMProvider, CategorizationRequest, CategorizationResponse, RuleSuggestion } from './types';
export { HttpProvider };

export function createLLMProvider() {
  return new HttpProvider();
}
