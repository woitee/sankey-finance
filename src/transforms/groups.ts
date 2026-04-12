import type { Transaction } from '../types/transaction';

export interface TransactionGroup {
  groupId: string;
  label: string | null;
  members: Transaction[];
  primary: Transaction;    // member with largest |amount|
  netAmount: number;       // sum of all members' amounts
}

/**
 * Extract all groups from a transaction list.
 */
export function extractGroups(transactions: Transaction[]): TransactionGroup[] {
  const groupMap = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.groupId) {
      const list = groupMap.get(tx.groupId) ?? [];
      list.push(tx);
      groupMap.set(tx.groupId, list);
    }
  }

  const groups: TransactionGroup[] = [];
  for (const [groupId, members] of groupMap) {
    // NOISE members stay visible in the group but don't count towards net amount
    const countable = members.filter(m => m.cat1 !== 'NOISE');
    const primary = (countable.length > 0 ? countable : members).reduce((a, b) =>
      Math.abs(a.amount) >= Math.abs(b.amount) ? a : b,
    );
    const netAmount = countable.reduce((sum, tx) => sum + tx.amount, 0);
    const label = members.find(m => m.groupLabel)?.groupLabel ?? null;
    groups.push({ groupId, label, members, primary, netAmount });
  }
  return groups;
}

/**
 * Resolve groups into effective transactions for summary/chart consumption.
 * Each group collapses into one synthetic transaction with net amount.
 * - Net negative → keeps primary's categories (still an expense)
 * - Net positive → becomes INCOME/reimbursement
 * - Net zero → removed (fully reimbursed)
 */
export function resolveGroups(transactions: Transaction[]): Transaction[] {
  const groupedIds = new Set<string>();
  const groups = extractGroups(transactions);
  const result: Transaction[] = [];

  for (const group of groups) {
    for (const m of group.members) groupedIds.add(m.id);

    // Skip fully reimbursed groups
    if (Math.round(group.netAmount * 100) === 0) continue;

    const p = group.primary;
    const effective: Transaction = {
      ...p,
      amount: group.netAmount,
      // If net flipped to positive, treat as income
      cat1: group.netAmount > 0 ? 'INCOME' : p.cat1,
      cat2: group.netAmount > 0 ? 'OtherIncome' : p.cat2,
      cat3: group.netAmount > 0 ? 'reimbursement' : p.cat3,
    };
    result.push(effective);
  }

  // Pass through ungrouped transactions
  for (const tx of transactions) {
    if (!groupedIds.has(tx.id)) {
      result.push(tx);
    }
  }

  return result;
}

/**
 * Generate a unique group ID.
 */
export function generateGroupId(): string {
  return crypto.randomUUID();
}
