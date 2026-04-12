import type { LLMProvider } from './types';
import { ClaudeProvider } from './claude';

export type { LLMProvider, CategorizationRequest, CategorizationResponse, RuleSuggestion } from './types';

export function createLLMProvider(providerName = 'claude'): LLMProvider {
  switch (providerName) {
    case 'claude':
      return new ClaudeProvider();
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
  }
}
