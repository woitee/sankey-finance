import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  CategorizationRequest,
  CategorizationResponse,
  CategorizationResult,
  RuleSuggestion,
} from './types';

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
  ): Promise<CategorizationResult> {
    const allResponses: CategorizationResponse[] = [];
    const allRules: RuleSuggestion[] = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const result = await this.categorizeBatch(batch, validCat3Values);
      allResponses.push(...result.responses);
      allRules.push(...result.ruleSuggestions);
    }

    return { responses: allResponses, ruleSuggestions: deduplicateRules(allRules) };
  }

  private async categorizeBatch(
    batch: CategorizationRequest[],
    validCat3Values: string[],
  ): Promise<CategorizationResult> {
    const transactionList = batch
      .map(
        (r, i) =>
          `${i + 1}. Merchant: "${r.merchantName}" | Details: "${r.details}" | Amount: ${r.amount} | Type: ${r.transactionType}`,
      )
      .join('\n');

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `You are a financial transaction categorizer. Assign cat3 categories and suggest reusable rules.
Return ONLY a JSON object — no other text:
{
  "categories": [{"index": 1, "cat3": "category_name"}, ...],
  "rules": [{"pattern": "...", "field": "merchantName|details", "matchType": "contains|exact|startsWith", "cat3": "category_name"}]
}
Rules should capture patterns that would reliably identify future transactions (e.g. merchant name substring). Only suggest rules with high confidence. Omit rules for one-off transactions.`,
      messages: [
        {
          role: 'user',
          content: `Valid cat3 categories: ${JSON.stringify(validCat3Values)}

Transactions to categorize:
${transactionList}`,
        },
      ],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fallback(batch);

      const parsed = JSON.parse(jsonMatch[0]) as {
        categories?: Array<{ index: number; cat3: string }>;
        rules?: Array<{ pattern: string; field: string; matchType: string; cat3: string }>;
      };

      const responses: CategorizationResponse[] = batch.map((_, i) => {
        const entry = parsed.categories?.find(p => p.index === i + 1);
        const cat3 = entry?.cat3 || 'uncategorized';
        const isValid = validCat3Values.includes(cat3);
        return { cat3: isValid ? cat3 : 'uncategorized', confidence: isValid ? 0.8 : 0 };
      });

      const ruleSuggestions: RuleSuggestion[] = (parsed.rules ?? [])
        .filter(r =>
          r.pattern?.trim() &&
          (r.field === 'merchantName' || r.field === 'details') &&
          ['contains', 'exact', 'startsWith'].includes(r.matchType) &&
          validCat3Values.includes(r.cat3),
        )
        .map(r => ({
          pattern: r.pattern.trim(),
          field: r.field as 'merchantName' | 'details',
          matchType: r.matchType as 'contains' | 'exact' | 'startsWith',
          cat3: r.cat3,
        }));

      return { responses, ruleSuggestions };
    } catch {
      return fallback(batch);
    }
  }
}

function fallback(batch: CategorizationRequest[]): CategorizationResult {
  return {
    responses: batch.map(() => ({ cat3: 'uncategorized', confidence: 0 })),
    ruleSuggestions: [],
  };
}

function deduplicateRules(rules: RuleSuggestion[]): RuleSuggestion[] {
  const seen = new Set<string>();
  return rules.filter(r => {
    const key = `${r.field}:${r.matchType}:${r.pattern.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
