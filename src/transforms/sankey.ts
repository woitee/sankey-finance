import type { Transaction } from '../types/transaction';
import type { SankeyData, SankeyNode, SankeyLink } from '../types/chart';

const TYPE_COLORS: Record<string, string> = {
  MUST: '#e87461',
  WANT: '#6a9fdb',
  Savings: '#6dbf7b',
  Deficit: '#f59e0b',
  Income: '#b0b8c8',
};

const CATEGORY_COLORS: Record<string, string> = {
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
  const expenseTransactions = transactions.filter(t => t.amount < 0 && t.type && t.type !== 'INCOME' && t.category);

  const totalIncome = incomeTransactions.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expenseTransactions.reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = totalIncome - totalExpense;

  addNode('Income', TYPE_COLORS.Income);
  addNode('MUST', TYPE_COLORS.MUST);
  addNode('WANT', TYPE_COLORS.WANT);

  if (balance > 0) {
    addNode('Savings', TYPE_COLORS.Savings);
    addLink('Income', 'Savings', balance);
  }

  if (balance < 0) {
    addNode('Deficit', TYPE_COLORS.Deficit);
  }

  // Aggregate by type → category → subcategory
  const typeTotals: Record<string, number> = {};
  const categoryGroups: Record<string, Record<string, number>> = {};
  const subcategoryGroups: Record<string, Record<string, number>> = {};
  const mustWantCategory: Record<string, Record<string, number>> = {};
  const mustWantSubcategory: Record<string, Record<string, number>> = {};

  for (const t of expenseTransactions) {
    const abs = Math.abs(t.amount);
    const typ = t.type!;
    const cat = t.category!;
    const sub = t.subcategory!;
    const isMustWant = typ === 'MUST/WANT';

    const splits: Array<[string, number]> = isMustWant
      ? [['MUST', abs / 2], ['WANT', abs / 2]]
      : [[typ, abs]];

    for (const [splitType, splitAbs] of splits) {
      typeTotals[splitType] = (typeTotals[splitType] ?? 0) + splitAbs;

      if (!categoryGroups[splitType]) categoryGroups[splitType] = {};
      categoryGroups[splitType][cat] = (categoryGroups[splitType][cat] ?? 0) + splitAbs;

      if (isMustWant) {
        if (!mustWantCategory[splitType]) mustWantCategory[splitType] = {};
        mustWantCategory[splitType][cat] = (mustWantCategory[splitType][cat] ?? 0) + splitAbs;
      }

      if (showCat3 && sub) {
        const catKey = `${splitType}\0${cat}`;
        if (!subcategoryGroups[catKey]) subcategoryGroups[catKey] = {};
        subcategoryGroups[catKey][sub] = (subcategoryGroups[catKey][sub] ?? 0) + splitAbs;

        if (isMustWant) {
          if (!mustWantSubcategory[catKey]) mustWantSubcategory[catKey] = {};
          mustWantSubcategory[catKey][sub] = (mustWantSubcategory[catKey][sub] ?? 0) + splitAbs;
        }
      }
    }
  }

  // Income → MUST / WANT (and Deficit covers the shortfall if overspending)
  const deficit = Math.abs(Math.min(0, balance));
  for (const [typ, total] of Object.entries(typeTotals)) {
    if (deficit > 0 && totalExpense > 0) {
      const incomeShare = Math.round(total * (totalIncome / totalExpense));
      const deficitShare = total - incomeShare;
      addLink('Income', typ, incomeShare);
      addLink('Deficit', typ, deficitShare);
    } else {
      addLink('Income', typ, total);
    }
  }

  // MUST/WANT → category
  for (const [typ, catMap] of Object.entries(categoryGroups)) {
    for (const [cat, total] of Object.entries(catMap)) {
      addNode(cat, CATEGORY_COLORS[cat]);
      addLink(typ, cat, total, mustWantCategory[typ]?.[cat] ?? 0);
    }
  }

  // category → subcategory
  if (showCat3) {
    const upstreamNodes = new Set(nodes.keys());
    for (const [typ, catMap] of Object.entries(categoryGroups)) {
      for (const [cat] of Object.entries(catMap)) {
        const catKey = `${typ}\0${cat}`;
        const subMap = subcategoryGroups[catKey];
        if (subMap) {
          for (const [sub, subTotal] of Object.entries(subMap)) {
            if (upstreamNodes.has(sub)) continue;
            addNode(sub);
            const mwFromMust = mustWantSubcategory[`MUST\0${cat}`]?.[sub] ?? 0;
            const mwFromWant = mustWantSubcategory[`WANT\0${cat}`]?.[sub] ?? 0;
            addLink(cat, sub, subTotal, mwFromMust + mwFromWant);
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
