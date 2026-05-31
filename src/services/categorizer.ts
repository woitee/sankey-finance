import type { ConvexReactClient } from 'convex/react';
import type { Transaction } from '../types/transaction';
import { resolveCategory, getAllSubcategoryValues } from '../config/categories';
import { createLLMProvider } from './llm';
import type { CategorizationRequest, RuleSuggestion } from './llm';
import { matchesTransactionRule } from '../rules/matcher';
import type { RuleLike, RuleMatcher } from '../rules/matcher';

export interface ActiveRule extends RuleLike {
  id?: string;
  pattern: string;
  field: 'merchantName' | 'details';
  matchType: 'contains' | 'exact' | 'startsWith' | 'word' | 'regex';
  caseSensitive?: boolean;
  matcher?: RuleMatcher | null;
  subcategory: string;
  category: string | null;
  type: string | null;
}

export interface CategorizationResult {
  transactions: Transaction[];
  ruleSuggestions: RuleSuggestion[];
}

export function matchesRule(tx: Transaction, rule: ActiveRule): boolean {
  return matchesTransactionRule(tx, rule);
}

export async function categorizeTransactions(
  transactions: Transaction[],
  options: { useLLM?: boolean; activeRules?: ActiveRule[]; convexClient?: ConvexReactClient } = {},
): Promise<CategorizationResult> {
  const { useLLM = true, activeRules = [], convexClient } = options;
  const result = [...transactions];
  const needsLLM: { index: number; request: CategorizationRequest }[] = [];

  for (let i = 0; i < result.length; i++) {
    const tx = { ...result[i] };
    result[i] = tx;

    if (tx.subcategory) continue;

    // Active rules
    const matchedRule = activeRules.find(r => matchesRule(tx, r));
    if (matchedRule) {
      applyCategories(tx, matchedRule.subcategory, 'rule', matchedRule.category ?? undefined, matchedRule.type ?? undefined);
      tx.ruleId = matchedRule.id ?? null;
      continue;
    }

    // Auto-categorize income
    if (tx.amount > 0) {
      if (tx.transactionType === 'prichozi_uhrada' || tx.transactionType === 'odmena_unity' || tx.transactionType === 'vraceni_penez') {
        const subcategory = tx.transactionType === 'vraceni_penez' ? 'refund'
          : tx.transactionType === 'odmena_unity' ? 'cashback'
          : tx.amount > 50000 ? 'salary'
          : 'transfer_in';
        applyCategories(tx, subcategory, 'rule');
        continue;
      }
    }

    // Queue for LLM
    if (useLLM && tx.amount < 0) {
      needsLLM.push({
        index: i,
        request: {
          merchantName: tx.merchantName,
          details: tx.details,
          amount: tx.amount,
          transactionType: tx.transactionType,
        },
      });
    }
  }

  // LLM batch categorization
  let ruleSuggestions: RuleSuggestion[] = [];

  if (needsLLM.length > 0 && useLLM) {
    try {
      if (!convexClient) throw new Error('convexClient is required for LLM categorization');
      const provider = createLLMProvider(convexClient);
      const validSubcategories = getAllSubcategoryValues();
      const llmResult = await provider.categorize(
        needsLLM.map(n => n.request),
        validSubcategories,
      );

      for (let j = 0; j < needsLLM.length; j++) {
        const { index } = needsLLM[j];
        const response = llmResult.responses[j];
        const tx = { ...result[index] };
        result[index] = tx;
        applyCategories(tx, response.subcategory, 'llm', response.category, response.type);
      }

      ruleSuggestions = llmResult.ruleSuggestions;
    } catch (err) {
      console.error('LLM categorization failed:', err);
    }
  }

  return { transactions: result, ruleSuggestions };
}

function applyCategories(
  tx: Transaction,
  subcategory: string,
  source: 'rule' | 'llm' | 'manual',
  categoryOverride?: string | null,
  typeOverride?: string | null,
) {
  tx.subcategory = subcategory;
  if (source === 'llm') {
    tx.category = categoryOverride ?? 'Other';
    tx.type = typeOverride ?? 'WANT';
  } else {
    const resolved = resolveCategory(subcategory);
    tx.category = categoryOverride ?? resolved?.category ?? 'Other';
    tx.type = typeOverride ?? resolved?.type ?? 'WANT';
  }
  // NOISE is manual-only — never assign it through automated flows
  if (source !== 'manual' && tx.type === 'NOISE') tx.type = 'WANT';
  tx.categorizationSource = source;
}
