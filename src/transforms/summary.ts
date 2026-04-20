import type { Transaction } from '../types/transaction';

export interface StatementSummary {
  totalIncome: number;
  totalOutcome: number;
  savings: number;
  mustTotal: number;
  wantTotal: number;
  transactionCount: number;
  uncategorizedCount: number;
}

export function computeSummary(transactions: Transaction[]): StatementSummary {
  let totalIncome = 0;
  let totalOutcome = 0;
  let mustTotal = 0;
  let wantTotal = 0;
  let uncategorizedCount = 0;

  for (const tx of transactions) {
    if (tx.amount > 0) {
      totalIncome += tx.amount;
    } else {
      totalOutcome += Math.abs(tx.amount);
      if (tx.cat1 === 'MUST') mustTotal += Math.abs(tx.amount);
      else if (tx.cat1 === 'WANT') wantTotal += Math.abs(tx.amount);
      else if (tx.cat1 === 'MUST/WANT') { mustTotal += Math.abs(tx.amount) / 2; wantTotal += Math.abs(tx.amount) / 2; }
    }
    if (!tx.cat3) uncategorizedCount++;
  }

  return {
    totalIncome,
    totalOutcome,
    savings: totalIncome - totalOutcome,
    mustTotal,
    wantTotal,
    transactionCount: transactions.length,
    uncategorizedCount,
  };
}
