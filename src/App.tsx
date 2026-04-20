import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import type { Id } from '../convex/_generated/dataModel';
import { api } from '../convex/_generated/api';
import type { Transaction } from './types/transaction';
import { categorizeTransactions, matchesRule } from './services/categorizer';
import type { ActiveRule } from './services/categorizer';
import { buildSankeyData } from './transforms/sankey';
import { computeSummary } from './transforms/summary';
import { SankeyChart } from './components/charts/SankeyChart';
import { SummaryCards } from './components/charts/SummaryCards';
import { CategoryBreakdown } from './components/charts/CategoryBreakdown';
import { TransactionTable, type CategoryFilter, type CategoryEditPayload } from './components/transactions/TransactionTable';
import { DateRangePicker } from './components/DateRangePicker';
import { SettingsView } from './components/SettingsView';
import { ImportModal } from './components/ImportModal';
import { CategorizeModal } from './components/CategorizeModal';
import type { CategorizeResult } from './components/CategorizeModal';
import { resolveGroups, generateGroupId } from './transforms/groups';

type Tab = 'dashboard' | 'transactions' | 'settings';

// Convex document extended with the Convex _id for mutations
type TxDoc = Transaction & {
  _convexId: Id<'transactions'>;
  period: string;
  bankAccountNumber?: string;
};

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: formatLocalDate(from), to: formatLocalDate(now) };
}

export default function App() {
  const defaults = getDefaultDateRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [showImport, setShowImport] = useState(false);
  const [categorizeModalTxs, setCategorizeModalTxs] = useState<TxDoc[] | null>(null);
  const [categorizeModalIsAll, setCategorizeModalIsAll] = useState(false);
  const [showCat3, setShowCat3] = useState(false);
  const [txFilter, setTxFilter] = useState<CategoryFilter>({});
  const [selectedAccount, setSelectedAccount] = useState<string>('all');

  // Track which date ranges have been auto-categorized to avoid re-running
  const autoCategorizedRef = useRef<Set<string>>(new Set());

  const [convexTimedOut, setConvexTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setConvexTimedOut(true), 8000);
    if (convexTxs !== undefined) clearTimeout(t);
    return () => clearTimeout(t);
  }, [convexTxs]);

  // ── Convex queries ──────────────────────────────────────────────────────────
  const convexTxs = useQuery(
    api.transactions.byDateRange,
    from && to ? { from, to } : 'skip',
  );
  const convexAccounts = useQuery(api.accounts.list);
  const convexActiveRules = useQuery(api.rules.listActive);
  const convexCandidateRules = useQuery(api.rules.listCandidates);
  const convexNicknames = useQuery(api.cardholderNicknames.list);

  // ── Convex mutations ────────────────────────────────────────────────────────
  const batchUpdateCategories = useMutation(api.transactions.batchUpdateCategories);
  const updateCategoriesMutation = useMutation(api.transactions.updateCategories);
  const updateGroupMutation = useMutation(api.transactions.updateGroup);
  const batchCreateCandidates = useMutation(api.rules.batchCreateCandidates);
  const batchDeleteMutation = useMutation(api.transactions.batchDelete);

  // ── Derived state ───────────────────────────────────────────────────────────
  const nicknameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of convexNicknames ?? []) map.set(n.fullName, n.nickname);
    return map;
  }, [convexNicknames]);

  const allTransactions: TxDoc[] = useMemo(
    () =>
      (convexTxs ?? []).map(doc => ({
        id: doc.originalId,
        _convexId: doc._id,
        period: doc.period,
        bankAccountNumber: doc.bankAccountNumber,
        datePosted: doc.datePosted,
        dateExecuted: doc.dateExecuted,
        type: doc.type as Transaction['type'],
        cardholderName: nicknameMap.get(doc.cardholderName) ?? doc.cardholderName,
        accountIdentifier: doc.accountIdentifier,
        merchantName: doc.merchantName,
        details: doc.details,
        amount: doc.amount,
        fees: doc.fees,
        cat3: doc.cat3,
        cat2: doc.cat2,
        cat1: doc.cat1,
        categorizationSource: doc.categorizationSource,
        ruleId: doc.ruleId,
        groupId: doc.groupId,
        groupLabel: doc.groupLabel,
      })),
    [convexTxs, nicknameMap],
  );

  // Filter by selected account
  const transactions: TxDoc[] = useMemo(
    () =>
      selectedAccount === 'all'
        ? allTransactions
        : allTransactions.filter(tx => tx.bankAccountNumber === selectedAccount),
    [allTransactions, selectedAccount],
  );

  const activeRules: ActiveRule[] = useMemo(
    () =>
      (convexActiveRules ?? []).map(r => ({
        id: r._id,
        pattern: r.pattern,
        field: r.field,
        matchType: r.matchType,
        cat3: r.cat3,
        cat2: r.cat2,
        cat1: r.cat1,
      })),
    [convexActiveRules],
  );

  const candidateRules: ActiveRule[] = useMemo(
    () =>
      (convexCandidateRules ?? []).map(r => ({
        id: r._id,
        pattern: r.pattern,
        field: r.field,
        matchType: r.matchType,
        cat3: r.cat3,
        cat2: r.cat2,
        cat1: r.cat1,
      })),
    [convexCandidateRules],
  );

  const txLoading = convexTxs === undefined;

  // ── Persist categorization changes back to Convex ───────────────────────────
  const persistCategorization = useCallback(
    async (newTxs: Transaction[]) => {
      const idMap = new Map(transactions.map(tx => [tx.id, tx._convexId]));
      const origMap = new Map(transactions.map(tx => [tx.id, tx]));

      const updates = newTxs
        .filter(tx => {
          const orig = origMap.get(tx.id);
          return (
            orig &&
            (orig.cat3 !== tx.cat3 ||
              orig.cat2 !== tx.cat2 ||
              orig.cat1 !== tx.cat1 ||
              orig.categorizationSource !== tx.categorizationSource ||
              (orig.ruleId ?? null) !== (tx.ruleId ?? null))
          );
        })
        .map(tx => ({
          id: idMap.get(tx.id)!,
          cat3: tx.cat3,
          cat2: tx.cat2,
          cat1: tx.cat1,
          categorizationSource: tx.categorizationSource,
          ...(tx.ruleId ? { ruleId: tx.ruleId as Id<'rules'> } : {}),
        }));

      if (updates.length > 0) {
        await batchUpdateCategories({ updates });
      }
    },
    [transactions, batchUpdateCategories],
  );

  // ── Auto-categorize (rules only) when date range loads ──────────────────────
  useEffect(() => {
    if (txLoading || transactions.length === 0) return;
    const rangeKey = `${from}::${to}`;
    if (autoCategorizedRef.current.has(rangeKey)) return;
    const hasUncategorized = transactions.some(tx => !tx.cat3);
    if (!hasUncategorized) {
      autoCategorizedRef.current.add(rangeKey);
      return;
    }
    autoCategorizedRef.current.add(rangeKey);
    categorizeTransactions(transactions, { useLLM: false, activeRules }).then(
      result => persistCategorization(result.transactions),
    );
  }, [txLoading, transactions, activeRules, from, to, persistCategorization]);

  // ── AI categorize (modal) ────────────────────────────────────────────────────
  const handleCategorizeModalDone = useCallback(
    async (result: CategorizeResult): Promise<number> => {
      let finalTxs = result.transactions;
      let candidatesCreated = 0;

      if (result.ruleSuggestions.length > 0) {
        const candidates = result.ruleSuggestions.map(r => ({
          pattern: r.pattern,
          field: r.field,
          matchType: r.matchType,
          cat3: r.cat3,
          cat2: r.cat2 ?? null,
          cat1: r.cat1 ?? null,
        }));

        const newRules = await batchCreateCandidates({ rules: candidates });
        candidatesCreated = newRules.length;

        if (newRules.length > 0) {
          finalTxs = finalTxs.map(tx => {
            if (tx.categorizationSource !== 'llm') return tx;
            const matched = newRules.find(r => matchesRule(tx, r as ActiveRule));
            if (!matched) return tx;
            return {
              ...tx,
              cat3: matched.cat3,
              cat2: matched.cat2,
              cat1: matched.cat1,
              categorizationSource: 'unverified_rule' as const,
              ruleId: matched._id as string,
            };
          });
        }
      }

      await persistCategorization(finalTxs);
      return candidatesCreated;
    },
    [persistCategorization, batchCreateCandidates],
  );

  // ── Delete selected ──────────────────────────────────────────────────────────
  const handleDeleteSelected = useCallback(
    async (ids: string[]) => {
      const convexIds = transactions
        .filter(tx => ids.includes(tx.id))
        .map(tx => tx._convexId);
      if (convexIds.length > 0) await batchDeleteMutation({ ids: convexIds });
    },
    [transactions, batchDeleteMutation],
  );

  // ── Recategorize selected with AI (opens modal with reset txs) ───────────────
  const handleRecategorizeSelected = useCallback(
    (ids: string[]) => {
      const selected = transactions.filter(tx => ids.includes(tx.id));
      if (!selected.length) return;
      const reset = selected.map(tx => ({
        ...tx, cat3: null, cat2: null, cat1: null, categorizationSource: null as any,
      }));
      setCategorizeModalIsAll(false);
      setCategorizeModalTxs(reset);
    },
    [transactions],
  );

  // onDone for the recategorize-selected modal (force-saves, bypasses diff check)
  const handleRecategorizeModalDone = useCallback(
    async (result: CategorizeResult): Promise<number> => {
      let candidatesCreated = 0;

      let finalTxs = result.transactions;

      if (result.ruleSuggestions.length > 0) {
        const candidates = result.ruleSuggestions.map(r => ({
          pattern: r.pattern,
          field: r.field,
          matchType: r.matchType,
          cat3: r.cat3,
          cat2: r.cat2 ?? null,
          cat1: r.cat1 ?? null,
        }));
        const newRules = await batchCreateCandidates({ rules: candidates });
        candidatesCreated = newRules.length;

        if (newRules.length > 0) {
          finalTxs = finalTxs.map(tx => {
            if (tx.categorizationSource !== 'llm') return tx;
            const matched = newRules.find(r => matchesRule(tx, r as ActiveRule));
            if (!matched) return tx;
            return {
              ...tx,
              cat3: matched.cat3,
              cat2: matched.cat2,
              cat1: matched.cat1,
              categorizationSource: 'unverified_rule' as const,
              ruleId: matched._id as string,
            };
          });
        }
      }

      const idMap = new Map(transactions.map(tx => [tx.id, tx._convexId]));
      const updates = finalTxs
        .filter(tx => idMap.has(tx.id))
        .map(tx => ({
          id: idMap.get(tx.id)!,
          cat3: tx.cat3,
          cat2: tx.cat2,
          cat1: tx.cat1,
          categorizationSource: tx.categorizationSource,
          ...(tx.ruleId ? { ruleId: tx.ruleId as Id<'rules'> } : {}),
        }));
      if (updates.length > 0) await batchUpdateCategories({ updates });
      return candidatesCreated;
    },
    [transactions, batchUpdateCategories, batchCreateCandidates],
  );

  // ── Manual category edit ─────────────────────────────────────────────────────
  const handleCorrect = useCallback(
    async (payload: CategoryEditPayload) => {
      const target = transactions.find(tx => tx.id === payload.txId);
      if (!target) return;
      await batchUpdateCategories({
        updates: [
          {
            id: target._convexId,
            cat3: payload.cat3 || target.cat3,
            cat2: payload.cat2 ?? target.cat2,
            cat1: payload.cat1 ?? target.cat1,
            categorizationSource: 'manual',
          },
        ],
      });
    },
    [transactions, batchUpdateCategories],
  );

  // ── Grouping ─────────────────────────────────────────────────────────────────
  const handleGroup = useCallback(
    async (txIds: string[], label?: string) => {
      const gid = generateGroupId();
      const targets = transactions.filter(tx => txIds.includes(tx.id));
      await Promise.all(
        targets.map(tx =>
          updateGroupMutation({ id: tx._convexId, groupId: gid, groupLabel: label || null }),
        ),
      );
    },
    [transactions, updateGroupMutation],
  );

  const handleUngroup = useCallback(
    async (groupId: string) => {
      const targets = transactions.filter(tx => tx.groupId === groupId);
      await Promise.all(
        targets.map(tx =>
          updateGroupMutation({ id: tx._convexId, groupId: null, groupLabel: null }),
        ),
      );
    },
    [transactions, updateGroupMutation],
  );

  const handleUpdateGroupLabel = useCallback(
    async (groupId: string, label: string) => {
      const targets = transactions.filter(tx => tx.groupId === groupId);
      await Promise.all(
        targets.map(tx =>
          updateGroupMutation({ id: tx._convexId, groupId, groupLabel: label || null }),
        ),
      );
    },
    [transactions, updateGroupMutation],
  );

  // ── Chart data ───────────────────────────────────────────────────────────────
  const effectiveTransactions = useMemo(
    () => resolveGroups(transactions).filter(t => {
      if (t.cat1 === 'NOISE') return false;
      // Transfers between own accounts cancel out when viewing all accounts
      if (t.cat1 === 'TRANSFER' && selectedAccount === 'all') return false;
      return true;
    }),
    [transactions, selectedAccount],
  );
  const summary = computeSummary(effectiveTransactions);
  const sankeyData = buildSankeyData(effectiveTransactions, { showCat3 });

  // ── Date range handler ───────────────────────────────────────────────────────
  const handleDateRange = useCallback((newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  }, []);

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
          {txLoading && !convexTimedOut && (
            <span style={{ fontSize: 12, color: '#64748b' }}>Loading…</span>
          )}
          {txLoading && convexTimedOut && (
            <span style={{ fontSize: 12, color: '#f38ba8' }} title={`VITE_CONVEX_URL: ${import.meta.env.VITE_CONVEX_URL ?? '(not set)'}`}>
              Convex connection failed — check console
            </span>
          )}
          <DateRangePicker from={from} to={to} onChange={handleDateRange} />
          {/* Account filter — only show when there are multiple accounts */}
          {(convexAccounts?.length ?? 0) > 1 && (
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              style={{
                background: '#1e1e2e',
                border: '1px solid #45475a',
                borderRadius: 6,
                color: '#cdd6f4',
                fontSize: 13,
                padding: '5px 8px',
                cursor: 'pointer',
                colorScheme: 'dark',
              }}
            >
              <option value="all">All Accounts</option>
              {convexAccounts?.map(a => (
                <option key={a.accountNumber} value={a.accountNumber}>{a.name}</option>
              ))}
            </select>
          )}
        </div>
        <nav style={{ display: 'flex', gap: 8 }}>
          {(['dashboard', 'transactions', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === 'transactions') setTxFilter({});
              }}
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
              {t === 'dashboard' ? 'Dashboard' : t === 'transactions' ? 'Transactions' : 'Settings'}
            </button>
          ))}
          <button
            onClick={() => setShowImport(true)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #45475a',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              background: 'transparent',
              color: '#94a3b8',
              marginLeft: 8,
            }}
          >
            Import
          </button>
          <button
            onClick={() => { if (transactions.length > 0) { setCategorizeModalIsAll(true); setCategorizeModalTxs(transactions); } }}
            disabled={transactions.length === 0}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #6366f1',
              cursor: transactions.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              background: 'transparent',
              color: '#6366f1',
              marginLeft: 8,
            }}
          >
            Categorize with AI
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18 }}>Flow</h2>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#94a3b8',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showCat3}
                    onChange={e => setShowCat3(e.target.checked)}
                  />
                  Show detailed categories (cat3)
                </label>
              </div>
              {sankeyData.links.length > 0 ? (
                <SankeyChart
                  data={sankeyData}
                  height={550}
                  onNodeClick={name => {
                    if (name === 'Income' || name === 'Savings' || name === 'Deficit') return;
                    const cat1Set = new Set(['MUST', 'WANT', 'INCOME']);
                    // Derive cat2 nodes from the actual sankey data: targets of MUST/WANT links
                    const cat2Set = new Set(
                      sankeyData.links
                        .filter(l => cat1Set.has(l.source))
                        .map(l => l.target),
                    );
                    if (cat1Set.has(name)) {
                      setTxFilter({ cat1: name });
                    } else if (cat2Set.has(name)) {
                      setTxFilter({ cat2: name });
                    } else {
                      setTxFilter({ cat3: name });
                    }
                    setTab('transactions');
                  }}
                  onLinkClick={(source, target) => {
                    if (target === 'Savings' || target === 'Deficit') return;
                    const cat1Set = new Set(['MUST', 'WANT', 'INCOME']);
                    // Derive cat2 nodes from the actual sankey data: targets of MUST/WANT links
                    const cat2Set = new Set(
                      sankeyData.links
                        .filter(l => cat1Set.has(l.source))
                        .map(l => l.target),
                    );
                    const filter: CategoryFilter = {};

                    if (source !== 'Income' && source !== 'Deficit') {
                      if (cat1Set.has(source)) filter.cat1 = source;
                      else if (cat2Set.has(source)) filter.cat2 = source;
                    }

                    if (cat1Set.has(target)) filter.cat1 = target;
                    else if (cat2Set.has(target)) filter.cat2 = target;
                    else filter.cat3 = target;

                    setTxFilter(filter);
                    setTab('transactions');
                  }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
                  {transactions.length === 0
                    ? 'No transactions in this date range.'
                    : 'No categorized data yet. Click "Categorize with AI" or set categories manually.'}
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
              Transactions — {from} to {to}
            </h2>
            <TransactionTable
              transactions={transactions}
              onCorrect={handleCorrect}
              initialFilter={txFilter}
              onGroup={handleGroup}
              onUngroup={handleUngroup}
              onUpdateGroupLabel={handleUpdateGroupLabel}
              activeRules={activeRules}
              candidateRules={candidateRules}
              onDelete={handleDeleteSelected}
              onRecategorizeWithAI={handleRecategorizeSelected}
              categorizing={categorizeModalTxs !== null}
              onRuleClick={ruleId => {
                setTab('settings');
                setTimeout(() => {
                  const el = document.getElementById(`rule-${ruleId}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.outline = '2px solid #89b4fa';
                    setTimeout(() => { el.style.outline = ''; }, 1500);
                  }
                }, 50);
              }}
              onCreateRule={async tx => {
                const created = await batchCreateCandidates({
                  rules: [{
                    pattern: tx.merchantName || tx.details,
                    field: 'merchantName',
                    matchType: 'contains',
                    cat3: tx.cat3 || '',
                    cat2: tx.cat2 ?? null,
                    cat1: tx.cat1 ?? null,
                  }],
                });
                const rule = created[0];
                if (rule) {
                  await updateCategoriesMutation({
                    id: (tx as TxDoc)._convexId,
                    cat3: tx.cat3 ?? null,
                    cat2: tx.cat2 ?? null,
                    cat1: tx.cat1 ?? null,
                    categorizationSource: 'unverified_rule',
                    ruleId: rule._id,
                  });
                }
              }}
            />
          </div>
        )}
        {tab === 'settings' && (
          <div style={{ background: '#181825', borderRadius: 12, padding: 24 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Settings</h2>
            <SettingsView />
          </div>
        )}
      </main>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}

      {categorizeModalTxs && (
        categorizeModalIsAll ? (
          <CategorizeModal
            title="Categorize with AI"
            transactions={categorizeModalTxs}
            activeRules={activeRules}
            onDone={handleCategorizeModalDone}
            onClose={() => setCategorizeModalTxs(null)}
            onViewCandidates={() => { setCategorizeModalTxs(null); setTab('settings'); }}
          />
        ) : (
          <CategorizeModal
            title={`Recategorize ${categorizeModalTxs.length} transaction${categorizeModalTxs.length !== 1 ? 's' : ''}`}
            transactions={categorizeModalTxs}
            activeRules={activeRules}
            onDone={handleRecategorizeModalDone}
            onClose={() => setCategorizeModalTxs(null)}
          />
        )
      )}
    </div>
  );
}
