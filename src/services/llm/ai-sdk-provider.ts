import { generateObject } from 'ai';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import { createLanguageModel } from './model';
import type {
  LLMProvider,
  CategorizationRequest,
  CategorizationResult,
  RuleSuggestion,
} from './types';

const BATCH_SIZE = 20;

const responseSchema = z.object({
  categories: z.array(z.object({
    index: z.number().int(),
    cat3: z.string(),
  })),
  rules: z.array(z.object({
    pattern: z.string(),
    field: z.enum(['merchantName', 'details']),
    matchType: z.enum(['contains', 'exact', 'startsWith']),
    cat3: z.string(),
  })).default([]),
});

export class AISDKProvider implements LLMProvider {
  name: string;
  private model: LanguageModel;

  constructor() {
    const providerName: string = import.meta.env.VITE_LLM_PROVIDER || 'anthropic';
    const modelName: string | undefined = import.meta.env.VITE_LLM_MODEL || undefined;
    this.model = createLanguageModel(providerName, modelName);
    this.name = providerName;
  }

  async categorize(
    requests: CategorizationRequest[],
    validCat3Values: string[],
  ): Promise<CategorizationResult> {
    const allResponses = [];
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

    try {
      const { object } = await generateObject({
        model: this.model,
        schema: responseSchema,
        system: `You are a financial transaction categorizer. Assign cat3 categories and suggest reusable rules.
Rules should capture patterns that reliably identify future transactions (e.g. merchant name substring). Only suggest rules with high confidence. Omit rules for one-off transactions.`,
        messages: [
          {
            role: 'user',
            content: `Valid cat3 categories: ${JSON.stringify(validCat3Values)}

Transactions to categorize:
${transactionList}`,
          },
        ],
      });

      const responses = batch.map((_, i) => {
        const entry = object.categories.find(p => p.index === i + 1);
        const cat3 = entry?.cat3 ?? 'uncategorized';
        const isValid = validCat3Values.includes(cat3);
        return { cat3: isValid ? cat3 : 'uncategorized', confidence: isValid ? 0.8 : 0 };
      });

      const ruleSuggestions = object.rules
        .filter(r => r.pattern.trim() && validCat3Values.includes(r.cat3))
        .map(r => ({ ...r, pattern: r.pattern.trim() }));

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
