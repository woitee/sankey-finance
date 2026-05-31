import type { ConvexReactClient } from 'convex/react';
import { ConvexProvider } from './convex-provider';

export type { LLMProvider, CategorizationRequest, CategorizationResponse, RuleSuggestion } from './types';

export function createLLMProvider(convexClient: ConvexReactClient) {
  return new ConvexProvider(convexClient);
}
