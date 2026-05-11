import type { LLMProvider, CategorizationRequest, CategorizationResult } from './types';
import { authFetch } from '../../auth/fetch';

export class HttpProvider implements LLMProvider {
  name = 'server';

  async categorize(requests: CategorizationRequest[], validCat3Values: string[]): Promise<CategorizationResult> {
    const res = await authFetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests, validCat3Values }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`LLM API error (${res.status}): ${err.error ?? res.statusText}`);
    }
    return res.json();
  }
}
