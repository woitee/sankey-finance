import type { Transaction } from '../types/transaction';
import { resolveCategory, getAllCat3Values } from '../config/categories';
import { createLLMProvider } from './llm';
import type { CategorizationRequest, RuleSuggestion } from './llm';

export interface ActiveRule {
  id?: string;
  pattern: string;
  field: 'merchantName' | 'details';
  matchType: 'contains' | 'exact' | 'startsWith';
  cat3: string;
  cat2: string | null;
  cat1: string | null;
}

export interface CategorizationResult {
  transactions: Transaction[];
  ruleSuggestions: RuleSuggestion[];
}

export function matchesRule(tx: Transaction, rule: ActiveRule): boolean {
  const value = rule.field === 'merchantName' ? tx.merchantName : tx.details;
  const p = rule.pattern.toLowerCase();
  const v = (value ?? '').toLowerCase();
  if (rule.matchType === 'exact') return v === p;
  if (rule.matchType === 'startsWith') return v.startsWith(p);
  return v.includes(p);
}

export async function categorizeTransactions(
  transactions: Transaction[],
  options: { useLLM?: boolean; activeRules?: ActiveRule[] } = {},
): Promise<CategorizationResult> {
  const { useLLM = true, activeRules = [] } = options;
  const result = [...transactions];
  const needsLLM: { index: number; request: CategorizationRequest }[] = [];

  for (let i = 0; i < result.length; i++) {
    const tx = { ...result[i] };
    result[i] = tx;

    if (tx.cat3) continue;

    // Active rules
    const matchedRule = activeRules.find(r => matchesRule(tx, r));
    if (matchedRule) {
      applyCategories(tx, matchedRule.cat3, 'rule', matchedRule.cat2 ?? undefined, matchedRule.cat1 ?? undefined);
      tx.ruleId = matchedRule.id ?? null;
      continue;
    }

    // Auto-categorize income
    if (tx.amount > 0) {
      if (tx.type === 'prichozi_uhrada' || tx.type === 'odmena_unity' || tx.type === 'vraceni_penez') {
        const cat3 = tx.type === 'vraceni_penez' ? 'refund'
          : tx.type === 'odmena_unity' ? 'cashback'
          : tx.amount > 50000 ? 'salary'
          : 'transfer_in';
        applyCategories(tx, cat3, 'rule');
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
          transactionType: tx.type,
        },
      });
    }
  }

  // LLM batch categorization
  let ruleSuggestions: RuleSuggestion[] = [];

  if (needsLLM.length > 0 && useLLM) {
    try {
      const provider = createLLMProvider();
      const validCat3 = getAllCat3Values();
      const llmResult = await provider.categorize(
        needsLLM.map(n => n.request),
        validCat3,
      );

      for (let j = 0; j < needsLLM.length; j++) {
        const { index } = needsLLM[j];
        const response = llmResult.responses[j];
        const tx = { ...result[index] };
        result[index] = tx;
        applyCategories(tx, response.cat3, 'llm', response.cat2, response.cat1);
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
  cat3: string,
  source: 'rule' | 'llm' | 'manual',
  cat2Override?: string | null,
  cat1Override?: string | null,
) {
  tx.cat3 = cat3;
  if (source === 'llm') {
    tx.cat2 = cat2Override ?? 'Other';
    tx.cat1 = cat1Override ?? 'WANT';
  } else {
    const resolved = resolveCategory(cat3);
    tx.cat2 = cat2Override ?? resolved?.cat2 ?? 'Other';
    tx.cat1 = cat1Override ?? resolved?.cat1 ?? 'WANT';
  }
  // NOISE is manual-only — never assign it through automated flows
  if (source !== 'manual' && tx.cat1 === 'NOISE') tx.cat1 = 'WANT';
  tx.categorizationSource = source;
}
