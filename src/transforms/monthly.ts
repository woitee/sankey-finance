import type { Transaction } from '../types/transaction';
import type { MonthlySummary } from '../types/chart';

export function computeMonthlySummary(
  transactions: Transaction[],
  period: string,
): MonthlySummary {
  let totalIncome = 0;
  let totalOutcome = 0;
  const byCategory: Record<string, number> = {};

  for (const tx of transactions) {
    if (tx.amount > 0) {
      totalIncome += tx.amount;
    } else {
      totalOutcome += Math.abs(tx.amount);
      const cat = tx.cat2 ?? 'Other';
      byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(tx.amount);
    }
  }

  return {
    period,
    totalIncome,
    totalOutcome,
    savings: totalIncome - totalOutcome,
    byCategory,
  };
}
