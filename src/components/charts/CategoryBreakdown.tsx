import { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { Transaction } from '../../types/transaction';

function formatCZK(value: number): string {
  return value.toLocaleString('cs-CZ') + ' CZK';
}

type Level = 'cat1' | 'cat2' | 'cat3';

const LEVEL_LABELS: Record<Level, string> = {
  cat1: 'Cat1',
  cat2: 'Cat2',
  cat3: 'Cat3',
};

export function CategoryBreakdown({ transactions }: { transactions: Transaction[] }) {
  const [level, setLevel] = useState<Level>('cat1');

  const expenses = useMemo(
    () => transactions.filter(t => t.amount < 0),
    [transactions],
  );

  const sorted = useMemo(() => {
    const byCategory: Record<string, number> = {};
    for (const tx of expenses) {
      const cat = tx[level];
      if (!cat) continue;
      byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(tx.amount);
    }

    // Always add Savings or Deficit for context
    const totalIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenses.reduce((s, t) => s + Math.abs(t.amount), 0);
    const balance = totalIncome - totalExpense;
    if (balance > 0) {
      byCategory['Savings'] = Math.round(balance);
    } else if (balance < 0) {
      byCategory['Deficit'] = Math.round(Math.abs(balance));
    }

    // For cat1, use fixed order: MUST → WANT → Savings/Deficit
    if (level === 'cat1') {
      const CAT1_ORDER = ['MUST', 'WANT', 'Savings', 'Deficit'];
      return CAT1_ORDER
        .filter(k => byCategory[k] != null)
        .map(k => [k, byCategory[k]] as [string, number]);
    }

    // For cat2/cat3, sort by value but keep Savings/Deficit at the end
    const entries = Object.entries(byCategory);
    const balanceEntry = entries.find(([k]) => k === 'Savings' || k === 'Deficit');
    const rest = entries.filter(([k]) => k !== 'Savings' && k !== 'Deficit').sort((a, b) => b[1] - a[1]);
    if (balanceEntry) rest.push(balanceEntry);
    return rest;
  }, [expenses, transactions, level]);

  const option = {
    tooltip: {
      trigger: 'item' as const,
      formatter: (params: any) => `${params.name}<br/><strong>${formatCZK(params.value)}</strong> (${params.percent}%)`,
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#11111b', borderWidth: 2 },
        label: {
          color: '#cdd6f4',
          formatter: '{b}: {d}%',
        },
        data: sorted.map(([name, value]) => ({ name, value: Math.round(value) })),
      },
    ],
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['cat1', 'cat2', 'cat3'] as Level[]).map(l => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              background: level === l ? '#6366f1' : '#1e1e2e',
              color: level === l ? '#fff' : '#94a3b8',
            }}
          >
            {LEVEL_LABELS[l]}
          </button>
        ))}
      </div>
      <ReactECharts
        option={option}
        style={{ height: 400, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
