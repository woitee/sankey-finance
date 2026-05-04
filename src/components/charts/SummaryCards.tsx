import type { StatementSummary } from '../../transforms/summary';
import { formatCurrency } from '../../utils/currency';

interface SummaryBalanceCard {
  label: string;
  value: number;
  color: string;
}

function SummaryCard({
  label,
  value,
  color,
  flex = '1 1 160px',
}: SummaryBalanceCard & { flex?: string }) {
  return (
    <div
      style={{
        flex,
        padding: '16px 20px',
        borderRadius: 12,
        background: '#1e1e2e',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700 }}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

export function SummaryCards({
  summary,
  balanceCards = [],
}: {
  summary: StatementSummary;
  balanceCards?: SummaryBalanceCard[];
}) {
  const cards = [
    { label: 'Income', value: summary.totalIncome, color: '#b0b8c8' },
    { label: 'Expenses', value: summary.totalOutcome, color: '#e87461' },
    {
      label: 'Savings',
      value: summary.savings,
      color: summary.savings >= 0 ? '#6dbf7b' : '#e87461',
    },
    { label: 'MUST', value: summary.mustTotal, color: '#e87461' },
    { label: 'WANT', value: summary.wantTotal, color: '#6a9fdb' },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      {balanceCards.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          {balanceCards.map(card => (
            <SummaryCard key={card.label} {...card} flex="1 1 50%" />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {cards.map(card => (
          <SummaryCard key={card.label} {...card} />
        ))}
        <div
          style={{
            flex: '1 1 160px',
            padding: '16px 20px',
            borderRadius: 12,
            background: '#1e1e2e',
            borderLeft: '4px solid #64748b',
          }}
        >
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>
            Transactions
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700 }}>
            {summary.transactionCount}
            {summary.uncategorizedCount > 0 && (
              <span style={{ fontSize: 13, color: '#f59e0b', marginLeft: 8 }}>
                ({summary.uncategorizedCount} uncategorized)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
