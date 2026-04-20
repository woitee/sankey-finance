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
  const mustWantMap = new Map<string, number>();

  const addNode = (name: string, color?: string) => {
    if (!nodes.has(name)) {
      nodes.set(name, { name, itemStyle: color ? { color } : undefined });
    }
  };

  const addLink = (source: string, target: string, value: number, mustWant = 0) => {
    if (value <= 0) return;
    const key = `${source}\0${target}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + value);
    if (mustWant > 0) mustWantMap.set(key, (mustWantMap.get(key) ?? 0) + mustWant);
  };

  const incomeTransactions = transactions.filter(t => t.amount > 0);
  const expenseTransactions = transactions.filter(t => t.amount < 0 && t.cat1 && t.cat1 !== 'INCOME' && t.cat2);

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
  // Track how much of each (splitC1→c2) and (c2→c3) link came from MUST/WANT transactions
  const mustWantCat2: Record<string, Record<string, number>> = {};
  const mustWantCat3: Record<string, Record<string, number>> = {};

  for (const t of expenseTransactions) {
    const abs = Math.abs(t.amount);
    const c1 = t.cat1!;
    const c2 = t.cat2!;
    const c3 = t.cat3!;
    const isMustWant = c1 === 'MUST/WANT';

    const splits: Array<[string, number]> = isMustWant
      ? [['MUST', abs / 2], ['WANT', abs / 2]]
      : [[c1, abs]];

    for (const [splitC1, splitAbs] of splits) {
      cat1Totals[splitC1] = (cat1Totals[splitC1] ?? 0) + splitAbs;

      if (!cat2Groups[splitC1]) cat2Groups[splitC1] = {};
      cat2Groups[splitC1][c2] = (cat2Groups[splitC1][c2] ?? 0) + splitAbs;

      if (isMustWant) {
        if (!mustWantCat2[splitC1]) mustWantCat2[splitC1] = {};
        mustWantCat2[splitC1][c2] = (mustWantCat2[splitC1][c2] ?? 0) + splitAbs;
      }

      if (showCat3 && c3) {
        const cat2Key = `${splitC1}\0${c2}`;
        if (!cat3Groups[cat2Key]) cat3Groups[cat2Key] = {};
        cat3Groups[cat2Key][c3] = (cat3Groups[cat2Key][c3] ?? 0) + splitAbs;

        if (isMustWant) {
          if (!mustWantCat3[cat2Key]) mustWantCat3[cat2Key] = {};
          mustWantCat3[cat2Key][c3] = (mustWantCat3[cat2Key][c3] ?? 0) + splitAbs;
        }
      }
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
      addLink(c1, c2, total, mustWantCat2[c1]?.[c2] ?? 0);
    }
  }

  // cat2 → cat3 (after all cat1/cat2 nodes are registered, so we can detect cycles)
  if (showCat3) {
    const upstreamNodes = new Set(nodes.keys());
    for (const [c1, cat2Map] of Object.entries(cat2Groups)) {
      for (const [c2] of Object.entries(cat2Map)) {
        const cat2Key = `${c1}\0${c2}`;
        const c3Map = cat3Groups[cat2Key];
        if (c3Map) {
          for (const [c3, c3Total] of Object.entries(c3Map)) {
            if (upstreamNodes.has(c3)) continue; // would create a cycle
            addNode(c3);
            // Sum mustWant from both MUST and WANT sides for the same c2→c3 link
            const mwFromMust = mustWantCat3[`MUST\0${c2}`]?.[c3] ?? 0;
            const mwFromWant = mustWantCat3[`WANT\0${c2}`]?.[c3] ?? 0;
            addLink(c2, c3, c3Total, mwFromMust + mwFromWant);
          }
        }
      }
    }
  }

  const links: SankeyLink[] = [];
  for (const [key, value] of linkMap.entries()) {
    const [source, target] = key.split('\0');
    const mw = mustWantMap.get(key);
    links.push({ source, target, value: Math.round(value), ...(mw ? { mustWant: Math.round(mw) } : {}) });
  }

  return {
    nodes: Array.from(nodes.values()),
    links,
  };
}
