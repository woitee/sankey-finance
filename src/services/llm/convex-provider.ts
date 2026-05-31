import type { ConvexReactClient } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { LLMProvider, CategorizationRequest, CategorizationResult } from './types';

export class ConvexProvider implements LLMProvider {
  name = 'convex';

  constructor(private client: ConvexReactClient) {}

  async categorize(requests: CategorizationRequest[], validCat3Values: string[]): Promise<CategorizationResult> {
    return await this.client.action(api.llm.categorize, { requests, validCat3Values });
  }
}
