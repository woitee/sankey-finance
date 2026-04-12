import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Transaction, ParsedStatement } from './types/transaction';
import type { CorrectionsDB } from './types/category';
import { loadStatementList, loadStatement, saveStatement } from './services/dataLoader';
import { loadCorrections, saveCorrections, addCorrection } from './services/corrections';
import { categorizeTransactions } from './services/categorizer';
import { buildSankeyData } from './transforms/sankey';
import { computeSummary } from './transforms/summary';
import { SankeyChart } from './components/charts/SankeyChart';
import { SummaryCards } from './components/charts/SummaryCards';
import { CategoryBreakdown } from './components/charts/CategoryBreakdown';
import { TransactionTable, type CategoryFilter, type CorrectionPayload } from './components/transactions/TransactionTable';
import { MonthSelector } from './components/MonthSelector';
import { getAllCat2Values } from './config/categories';
import { resolveGroups, generateGroupId } from './transforms/groups';

type Tab = 'dashboard' | 'transactions';

export default function App() {
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [statement, setStatement] = useState<ParsedStatement | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [correctionsDB, setCorrectionsDB] = useState<CorrectionsDB>({
    version: 1,
    corrections: [],
  });
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [categorizing, setCategorizing] = useState(false);
  const [showCat3, setShowCat3] = useState(false);
  const [txFilter, setTxFilter] = useState<CategoryFilter>({});

  // Load available periods and corrections on mount
  useEffect(() => {
    Promise.all([loadStatementList(), loadCorrections()]).then(
      ([periodList, corrections]) => {
        setPeriods(periodList);
        setCorrectionsDB(corrections);
        if (periodList.length > 0) {
          setSelectedPeriod(periodList[periodList.length - 1]);
        }
        setLoading(false);
      },
    );
  }, []);

  // Load statement when period changes
  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);
    loadStatement(selectedPeriod).then(stmt => {
      setStatement(stmt);
      setTransactions(stmt.transactions);
      setLoading(false);
    });
  }, [selectedPeriod]);

  const persistTransactions = useCallback(async (txs: Transaction[]) => {
    setTransactions(txs);
    if (statement) {
      const updated = { ...statement, transactions: txs };
      setStatement(updated);
      await saveStatement(updated);
    }
  }, [statement]);

  const handleCategorize = useCallback(async () => {
    if (!transactions.length) return;
    setCategorizing(true);
    try {
      const categorized = await categorizeTransactions(transactions, correctionsDB);
      await persistTransactions(categorized);
    } catch (err) {
      console.error('Categorization failed:', err);
    }
    setCategorizing(false);
  }, [transactions, correctionsDB, persistTransactions]);

  // Auto-categorize with corrections only (no LLM) when statement loads
  useEffect(() => {
    if (!transactions.length || transactions[0].cat3) return;
    categorizeTransactions(transactions, correctionsDB, { useLLM: false }).then(
      setTransactions,
    );
  }, [statement]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCorrect = useCallback(
    async (payload: CorrectionPayload) => {
      const updatedDB = addCorrection(correctionsDB, payload.merchantName, {
        cat3: payload.cat3,
        cat2: payload.cat2,
        cat1: payload.cat1,
      });
      setCorrectionsDB(updatedDB);
      await saveCorrections(updatedDB);

      // Directly apply the edit to the specific transaction (fixes cat1/cat2
      // edits on already-categorized rows, which categorizeTransactions skips)
      const directlyUpdated = transactions.map(tx => {
        if (tx.id === payload.txId) {
          return {
            ...tx,
            cat3: payload.cat3 || tx.cat3,
            cat2: payload.cat2 ?? tx.cat2,
            cat1: payload.cat1 ?? tx.cat1,
            categorizationSource: 'correction' as const,
          };
        }
        return tx;
      });

      // Re-apply corrections to remaining uncategorized transactions
      const recategorized = await categorizeTransactions(directlyUpdated, updatedDB, {
        useLLM: false,
      });
      await persistTransactions(recategorized);
    },
    [correctionsDB, transactions, persistTransactions],
  );

  const effectiveTransactions = useMemo(
    () => resolveGroups(transactions).filter(t => t.cat1 !== 'NOISE'),
    [transactions],
  );
  const summary = computeSummary(effectiveTransactions);
  const sankeyData = buildSankeyData(effectiveTransactions, { showCat3 });

  const handleGroup = useCallback(async (txIds: string[], label?: string) => {
    const gid = generateGroupId();
    const updated = transactions.map(tx =>
      txIds.includes(tx.id)
        ? { ...tx, groupId: gid, groupLabel: label || null }
        : tx,
    );
    await persistTransactions(updated);
  }, [transactions, persistTransactions]);

  const handleUngroup = useCallback(async (groupId: string) => {
    const updated = transactions.map(tx =>
      tx.groupId === groupId
        ? { ...tx, groupId: null, groupLabel: null }
        : tx,
    );
    await persistTransactions(updated);
  }, [transactions, persistTransactions]);

  const handleUpdateGroupLabel = useCallback(async (groupId: string, label: string) => {
    const updated = transactions.map(tx =>
      tx.groupId === groupId
        ? { ...tx, groupLabel: label || null }
        : tx,
    );
    await persistTransactions(updated);
  }, [transactions, persistTransactions]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#cdd6f4' }}>
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#11111b',
        color: '#cdd6f4',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid #1e1e2e',
          background: '#181825',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Finance Tracker</h1>
          <MonthSelector
            periods={periods}
            selected={selectedPeriod}
            onChange={setSelectedPeriod}
          />
        </div>
        <nav style={{ display: 'flex', gap: 8 }}>
          {(['dashboard', 'transactions'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'transactions') setTxFilter({}); }}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                background: tab === t ? '#6366f1' : 'transparent',
                color: tab === t ? '#fff' : '#94a3b8',
              }}
            >
              {t === 'dashboard' ? 'Dashboard' : 'Transactions'}
            </button>
          ))}
          <button
            onClick={handleCategorize}
            disabled={categorizing}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #6366f1',
              cursor: categorizing ? 'wait' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              background: 'transparent',
              color: '#6366f1',
              marginLeft: 8,
            }}
          >
            {categorizing ? 'Categorizing...' : 'Categorize with AI'}
          </button>
        </nav>
      </header>

      {/* Content */}
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {tab === 'dashboard' && (
          <>
            <SummaryCards summary={summary} />
            <div
              style={{
                background: '#181825',
                borderRadius: 12,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Monthly Flow</h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showCat3}
                    onChange={e => setShowCat3(e.target.checked)}
                  />
                  Show detailed categories (cat3)
                </label>
              </div>
              {sankeyData.links.length > 0 ? (
                <SankeyChart data={sankeyData} height={550} onNodeClick={(name) => {
                  if (name === 'Income' || name === 'Savings' || name === 'Deficit') return;
                  const cat2Set = getAllCat2Values();
                  if (name === 'MUST' || name === 'WANT' || name === 'INCOME') {
                    setTxFilter({ cat1: name });
                  } else if (cat2Set.includes(name)) {
                    setTxFilter({ cat2: name });
                  } else {
                    setTxFilter({ cat3: name });
                  }
                  setTab('transactions');
                }} onLinkClick={(source, target) => {
                  if (target === 'Savings' || target === 'Deficit') return;
                  const cat1Set = ['MUST', 'WANT', 'INCOME'];
                  const cat2Set = getAllCat2Values();
                  const filter: CategoryFilter = {};

                  // Resolve source level (Income/Deficit are virtual sources, skip them)
                  if (source !== 'Income' && source !== 'Deficit') {
                    if (cat1Set.includes(source)) {
                      filter.cat1 = source;
                    } else if (cat2Set.includes(source)) {
                      filter.cat2 = source;
                    }
                  }

                  // Resolve target level
                  if (cat1Set.includes(target)) {
                    filter.cat1 = target;
                  } else if (cat2Set.includes(target)) {
                    filter.cat2 = target;
                  } else {
                    filter.cat3 = target;
                  }

                  setTxFilter(filter);
                  setTab('transactions');
                }} />
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
                  No categorized data yet. Click "Categorize with AI" or set categories manually.
                </div>
              )}
            </div>
            <div
              style={{
                background: '#181825',
                borderRadius: 12,
                padding: 24,
              }}
            >
              <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Spending by Category</h2>
              <CategoryBreakdown transactions={effectiveTransactions} />
            </div>
          </>
        )}
        {tab === 'transactions' && (
          <div
            style={{
              background: '#181825',
              borderRadius: 12,
              padding: 24,
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>
              Transactions — {selectedPeriod}
            </h2>
            <TransactionTable
              transactions={transactions}
              onCorrect={handleCorrect}
              initialFilter={txFilter}
              onGroup={handleGroup}
              onUngroup={handleUngroup}
              onUpdateGroupLabel={handleUpdateGroupLabel}
            />
          </div>
        )}
      </main>
    </div>
  );
}
