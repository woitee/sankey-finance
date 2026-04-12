import type { Transaction } from '../types/transaction';
import type { CorrectionsDB } from '../types/category';
import { resolveCategory, getAllCat3Values } from '../config/categories';
import { findCorrection } from './corrections';
import { createLLMProvider } from './llm';
import type { CategorizationRequest } from './llm';

export async function categorizeTransactions(
  transactions: Transaction[],
  correctionsDB: CorrectionsDB,
  options: { useLLM?: boolean } = {},
): Promise<Transaction[]> {
  const { useLLM = true } = options;
  const result = [...transactions];
  const needsLLM: { index: number; request: CategorizationRequest }[] = [];

  // Step 1: Apply corrections and auto-categorize income
  for (let i = 0; i < result.length; i++) {
    const tx = { ...result[i] };
    result[i] = tx;

    // Skip already categorized
    if (tx.cat3) continue;

    // Auto-categorize income transactions
    if (tx.amount > 0) {
      if (tx.type === 'prichozi_uhrada' || tx.type === 'odmena_unity' || tx.type === 'vraceni_penez') {
        // Check if it looks like salary (large regular amount)
        const cat3 = tx.type === 'vraceni_penez' ? 'refund'
          : tx.type === 'odmena_unity' ? 'cashback'
          : tx.amount > 50000 ? 'salary'
          : 'transfer_in';
        applyCategories(tx, cat3, 'correction');
        continue;
      }
    }

    // Check corrections DB
    const correction = findCorrection(tx.merchantName, tx.details, correctionsDB.corrections);
    if (correction) {
      applyCategories(tx, correction.cat3, 'correction', correction.cat2, correction.cat1);
      continue;
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

  // Step 2: LLM batch categorization
  if (needsLLM.length > 0 && useLLM) {
    try {
      const provider = createLLMProvider();
      const validCat3 = getAllCat3Values();
      const responses = await provider.categorize(
        needsLLM.map(n => n.request),
        validCat3,
      );

      for (let j = 0; j < needsLLM.length; j++) {
        const { index } = needsLLM[j];
        const response = responses[j];
        const tx = { ...result[index] };
        result[index] = tx;
        applyCategories(tx, response.cat3, 'llm');
      }
    } catch (err) {
      console.error('LLM categorization failed:', err);
      // Leave uncategorized transactions as-is
    }
  }

  return result;
}

function applyCategories(
  tx: Transaction,
  cat3: string,
  source: 'correction' | 'llm' | 'manual',
  cat2Override?: string,
  cat1Override?: string,
) {
  tx.cat3 = cat3;
  const resolved = resolveCategory(cat3);
  tx.cat2 = cat2Override ?? resolved?.cat2 ?? 'Other';
  tx.cat1 = cat1Override ?? resolved?.cat1 ?? 'WANT';
  tx.categorizationSource = source;
}
