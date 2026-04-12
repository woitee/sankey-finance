import type { ParsedStatement, Transaction } from '../types/transaction';

export async function loadStatementList(): Promise<string[]> {
  const res = await fetch('/api/statements');
  return res.json();
}

function normalizeTransaction(raw: any): Transaction {
  return {
    ...raw,
    groupId: raw.groupId ?? null,
    groupLabel: raw.groupLabel ?? null,
  };
}

export async function loadStatement(period: string): Promise<ParsedStatement> {
  const res = await fetch(`/api/statement/${period}`);
  if (!res.ok) throw new Error(`Failed to load statement ${period}`);
  const data = await res.json();
  return {
    ...data,
    transactions: data.transactions.map(normalizeTransaction),
  };
}

export async function saveStatement(statement: ParsedStatement): Promise<void> {
  await fetch(`/api/statement/${statement.period}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(statement),
  });
}
