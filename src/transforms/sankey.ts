import type { Transaction } from '../types/transaction';
import type { SankeyData, SankeyNode, SankeyLink } from '../types/chart';

const CAT1_COLORS: Record<string, string> = {
  MUST: '#e87461',
  WANT: '#6a9fdb',
  Savings: '#6dbf7b',
  Deficit: '#f59e0b',
  Income: '#b0b8c8',
};

const CAT2_COLORS: Record<string, string> = {
  Living: '#cf7a6e',
  Food: '#d4976a',
  Health: '#c47a8a',
  Transport: '#9a82b5',
  Subscriptions: '#8589c4',
  Entertainment: '#6a9fdb',
  Clothes: '#5ea8a8',
  Child: '#b88ec4',
  Pet: '#8fb86a',
  Gifts: '#cca94e',
  Personal: '#8494a7',
  Other: '#7a8899',
};

export function buildSankeyData(
  transactions: Transaction[],
  options: { showCat3?: boolean } = {},
): SankeyData {
  const { showCat3 = false } = options;
  const nodes = new Map<string, SankeyNode>();
  const linkMap = new Map<string, number>();

  const addNode = (name: string, color?: string) => {
    if (!nodes.has(name)) {
      nodes.set(name, { name, itemStyle: color ? { color } : undefined });
    }
  };

  const addLink = (source: string, target: string, value: number) => {
    if (value <= 0) return;
    const key = `${source}\0${target}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + value);
  };

  const incomeTransactions = transactions.filter(t => t.amount > 0);
  const expenseTransactions = transactions.filter(t => t.amount < 0 && t.cat1 && t.cat1 !== 'INCOME');

  const totalIncome = incomeTransactions.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expenseTransactions.reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = totalIncome - totalExpense;

  addNode('Income', CAT1_COLORS.Income);
  addNode('MUST', CAT1_COLORS.MUST);
  addNode('WANT', CAT1_COLORS.WANT);

  if (balance > 0) {
    addNode('Savings', CAT1_COLORS.Savings);
    addLink('Income', 'Savings', balance);
  }

  if (balance < 0) {
    addNode('Deficit', CAT1_COLORS.Deficit);
  }

  // Aggregate by cat1 → cat2 → cat3
  const cat1Totals: Record<string, number> = {};
  const cat2Groups: Record<string, Record<string, number>> = {};
  const cat3Groups: Record<string, Record<string, number>> = {};

  for (const t of expenseTransactions) {
    const abs = Math.abs(t.amount);
    const c1 = t.cat1!;
    const c2 = t.cat2!;
    const c3 = t.cat3!;

    cat1Totals[c1] = (cat1Totals[c1] ?? 0) + abs;

    if (!cat2Groups[c1]) cat2Groups[c1] = {};
    cat2Groups[c1][c2] = (cat2Groups[c1][c2] ?? 0) + abs;

    if (showCat3) {
      const cat2Key = `${c1}\0${c2}`;
      if (!cat3Groups[cat2Key]) cat3Groups[cat2Key] = {};
      cat3Groups[cat2Key][c3] = (cat3Groups[cat2Key][c3] ?? 0) + abs;
    }
  }

  // Income → MUST / WANT (and Deficit covers the shortfall if overspending)
  const deficit = Math.abs(Math.min(0, balance));
  for (const [c1, total] of Object.entries(cat1Totals)) {
    if (deficit > 0 && totalExpense > 0) {
      // Split each cat1 proportionally between Income and Deficit
      const incomeShare = Math.round(total * (totalIncome / totalExpense));
      const deficitShare = total - incomeShare;
      addLink('Income', c1, incomeShare);
      addLink('Deficit', c1, deficitShare);
    } else {
      addLink('Income', c1, total);
    }
  }

  // MUST/WANT → cat2
  for (const [c1, cat2Map] of Object.entries(cat2Groups)) {
    for (const [c2, total] of Object.entries(cat2Map)) {
      addNode(c2, CAT2_COLORS[c2]);
      addLink(c1, c2, total);

      // cat2 → cat3
      if (showCat3) {
        const cat2Key = `${c1}\0${c2}`;
        const c3Map = cat3Groups[cat2Key];
        if (c3Map) {
          for (const [c3, c3Total] of Object.entries(c3Map)) {
            addNode(c3);
            addLink(c2, c3, c3Total);
          }
        }
      }
    }
  }

  const links: SankeyLink[] = [];
  for (const [key, value] of linkMap.entries()) {
    const [source, target] = key.split('\0');
    links.push({ source, target, value: Math.round(value) });
  }

  return {
    nodes: Array.from(nodes.values()),
    links,
  };
}
