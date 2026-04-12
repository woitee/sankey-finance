import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, CategorizationRequest, CategorizationResponse } from './types';

const BATCH_SIZE = 20;

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY,
      dangerouslyAllowBrowser: true,
    });
  }

  async categorize(
    requests: CategorizationRequest[],
    validCat3Values: string[],
  ): Promise<CategorizationResponse[]> {
    const results: CategorizationResponse[] = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const batchResults = await this.categorizeBatch(batch, validCat3Values);
      results.push(...batchResults);
    }

    return results;
  }

  private async categorizeBatch(
    batch: CategorizationRequest[],
    validCat3Values: string[],
  ): Promise<CategorizationResponse[]> {
    const transactionList = batch
      .map(
        (r, i) =>
          `${i + 1}. Merchant: "${r.merchantName}" | Details: "${r.details}" | Amount: ${r.amount} CZK | Type: ${r.transactionType}`,
      )
      .join('\n');

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are a financial transaction categorizer for Czech bank statements. Given transaction details, assign the most appropriate cat3 category from the provided list. Return ONLY a JSON array, no other text.`,
      messages: [
        {
          role: 'user',
          content: `Valid cat3 categories: ${JSON.stringify(validCat3Values)}

Transactions to categorize:
${transactionList}

Respond with a JSON array, one entry per transaction:
[{"index": 1, "cat3": "category_name"}, ...]`,
        },
      ],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return batch.map(() => ({ cat3: 'uncategorized', confidence: 0 }));

      const parsed: Array<{ index: number; cat3: string }> = JSON.parse(jsonMatch[0]);
      return batch.map((_, i) => {
        const entry = parsed.find(p => p.index === i + 1);
        const cat3 = entry?.cat3 || 'uncategorized';
        const isValid = validCat3Values.includes(cat3);
        return {
          cat3: isValid ? cat3 : 'uncategorized',
          confidence: isValid ? 0.8 : 0,
        };
      });
    } catch {
      return batch.map(() => ({ cat3: 'uncategorized', confidence: 0 }));
    }
  }
}
