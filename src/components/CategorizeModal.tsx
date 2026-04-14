import { useEffect, useRef, useState } from 'react';
import type { Transaction } from '../types/transaction';
import type { CorrectionsDB } from '../types/category';
import type { ActiveRule } from '../services/categorizer';
import { categorizeTransactions, matchesRule } from '../services/categorizer';
import { createLLMProvider } from '../services/llm';
import type { RuleSuggestion } from '../services/llm';
import { getAllCat3Values, resolveCategory } from '../config/categories';
import { findCorrection } from '../services/corrections';

// Inject keyframe animations once
const STYLE_ID = 'categorize-modal-styles';
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes cm-spin { to { transform: rotate(360deg); } }
    @keyframes cm-pulse {
      0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(s);
}

const BATCH_SIZE = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DryRunCounts {
  alreadyCategorized: number;
  byRule: number;
  toLLM: number;
  skipped: number;   // positive non-income transactions (not queued for LLM)
  batchCount: number;
}

interface BatchStatus {
  index: number;    // 1-based
  total: number;
  status: 'pending' | 'running' | 'done' | 'error';
  elapsed: number;  // ms; live when running, final when done
}

type Phase =
  | { kind: 'preview'; counts: DryRunCounts }
  | { kind: 'running'; batches: BatchStatus[] }
  | { kind: 'saving' }
  | { kind: 'done'; categorized: number; ruleCount: number }
  | { kind: 'error'; message: string };

export interface CategorizeResult {
  transactions: Transaction[];
  ruleSuggestions: RuleSuggestion[];
}

interface Props {
  title?: string;
  transactions: Transaction[];   // already reset if recategorizing
  correctionsDB: CorrectionsDB;
  activeRules: ActiveRule[];
  onDone: (result: CategorizeResult) => Promise<number>; // returns count of newly created candidates
  onClose: () => void;
  onViewCandidates?: () => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};

const card: React.CSSProperties = {
  background: '#1e1e2e', borderRadius: 14, padding: '32px 36px',
  width: 520, maxWidth: '90vw', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  border: '1px solid #313244',
};

const btn = (bg: string, color: string, disabled?: boolean): React.CSSProperties => ({
  background: disabled ? '#313244' : bg, color: disabled ? '#64748b' : color,
  border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14,
  fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeDryRunCounts(
  transactions: Transaction[],
  correctionsDB: CorrectionsDB,
  activeRules: ActiveRule[],
): DryRunCounts {
  let alreadyCategorized = 0;
  let byRule = 0;
  let toLLM = 0;
  let skipped = 0;

  for (const tx of transactions) {
    if (tx.cat3) { alreadyCategorized++; continue; }

    // Active rules
    if (activeRules.some(r => matchesRule(tx, r))) { byRule++; continue; }

    // Auto-categorize income
    if (tx.amount > 0 && (tx.type === 'prichozi_uhrada' || tx.type === 'odmena_unity' || tx.type === 'vraceni_penez')) {
      byRule++; continue;
    }

    // Corrections DB
    if (findCorrection(tx.merchantName, tx.details, correctionsDB.corrections)) {
      byRule++; continue;
    }

    // Queue for LLM (only negative amounts)
    if (tx.amount < 0) { toLLM++; } else { skipped++; }
  }

  return { alreadyCategorized, byRule, toLLM, skipped, batchCount: Math.ceil(toLLM / BATCH_SIZE) };
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CategorizeModal({
  title = 'Categorize with AI',
  transactions,
  correctionsDB,
  activeRules,
  onDone,
  onClose,
  onViewCandidates,
}: Props) {
  const counts = computeDryRunCounts(transactions, correctionsDB, activeRules);
  const [phase, setPhase] = useState<Phase>({ kind: 'preview', counts });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchesRef = useRef<BatchStatus[]>([]);

  function clearTick() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  // Clean up on unmount
  useEffect(() => () => clearTick(), []);

  async function runCategorization() {
    const batchCount = counts.batchCount;
    const initial: BatchStatus[] = Array.from({ length: batchCount }, (_, i) => ({
      index: i + 1, total: batchCount, status: 'pending', elapsed: 0,
    }));
    batchesRef.current = initial;
    setPhase({ kind: 'running', batches: [...initial] });

    if (batchCount === 0) {
      // Nothing for LLM — just run rule/correction pass and return
      try {
        const result = await categorizeTransactions(transactions, correctionsDB, { useLLM: false, activeRules });
        setPhase({ kind: 'saving' });
        await onDone({ transactions: result.transactions, ruleSuggestions: [] });
        setPhase({ kind: 'done', categorized: counts.byRule, ruleCount: 0 });
      } catch (e: any) {
        setPhase({ kind: 'error', message: String(e?.message ?? e) });
      }
      return;
    }

    try {
      // Step 1: apply rules / corrections (no LLM)
      const withRules = await categorizeTransactions(transactions, correctionsDB, { useLLM: false, activeRules });
      const finalTxs = [...withRules.transactions];

      // Step 2: collect LLM queue (still uncategorized, negative amounts)
      const queue = finalTxs
        .map((tx, i) => ({ tx, i }))
        .filter(({ tx }) => !tx.cat3 && tx.amount < 0);

      const validCat3 = getAllCat3Values();
      const provider = createLLMProvider();
      const allRuleSuggestions: RuleSuggestion[] = [];

      // Step 3: process each batch with live timer
      for (let b = 0; b < batchCount; b++) {
        const batchSlice = queue.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        const requests = batchSlice.map(({ tx }) => ({
          merchantName: tx.merchantName,
          details: tx.details,
          amount: tx.amount,
          transactionType: tx.type,
        }));

        const batchStart = Date.now();

        // Mark batch as running and start tick
        batchesRef.current = batchesRef.current.map((bs, i) =>
          i === b ? { ...bs, status: 'running', elapsed: 0 } : bs,
        );
        setPhase({ kind: 'running', batches: [...batchesRef.current] });

        intervalRef.current = setInterval(() => {
          batchesRef.current = batchesRef.current.map((bs, i) =>
            i === b ? { ...bs, elapsed: Date.now() - batchStart } : bs,
          );
          setPhase({ kind: 'running', batches: [...batchesRef.current] });
        }, 100);

        let batchResult;
        try {
          batchResult = await provider.categorize(requests, validCat3);
        } catch {
          clearTick();
          batchesRef.current = batchesRef.current.map((bs, i) =>
            i === b ? { ...bs, status: 'error', elapsed: Date.now() - batchStart } : bs,
          );
          setPhase({ kind: 'running', batches: [...batchesRef.current] });
          // Continue with fallback (uncategorized)
          batchResult = { responses: requests.map(() => ({ cat3: 'uncategorized', confidence: 0 })), ruleSuggestions: [] };
        }

        clearTick();
        const elapsed = Date.now() - batchStart;

        // Apply results
        batchSlice.forEach(({ i }, j) => {
          const cat3 = batchResult.responses[j].cat3;
          const resolved = resolveCategory(cat3);
          finalTxs[i] = {
            ...finalTxs[i],
            cat3,
            cat2: resolved?.cat2 ?? 'Other',
            cat1: resolved?.cat1 ?? 'WANT',
            categorizationSource: 'llm',
          };
        });

        allRuleSuggestions.push(...batchResult.ruleSuggestions);

        batchesRef.current = batchesRef.current.map((bs, i) =>
          i === b ? { ...bs, status: 'done', elapsed } : bs,
        );
        setPhase({ kind: 'running', batches: [...batchesRef.current] });
      }

      // Step 4: save
      setPhase({ kind: 'saving' });
      const candidatesCreated = await onDone({ transactions: finalTxs, ruleSuggestions: allRuleSuggestions });

      const llmCategorized = queue.length;
      setPhase({ kind: 'done', categorized: counts.byRule + llmCategorized, ruleCount: candidatesCreated });
    } catch (e: any) {
      clearTick();
      setPhase({ kind: 'error', message: String(e?.message ?? e) });
    }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && phase.kind !== 'running' && onClose()}>
      <div style={card}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
          {phase.kind !== 'running' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
          )}
        </div>

        {/* PREVIEW */}
        {phase.kind === 'preview' && (
          <div>
            <div style={{
              background: '#13131f', borderRadius: 8, padding: '16px 18px',
              border: '1px solid #313244', marginBottom: 20,
              display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px 24px', fontSize: 13,
            }}>
              <span style={{ color: '#64748b' }}>Already categorized</span>
              <span style={{ color: '#cdd6f4', fontWeight: 600, textAlign: 'right' }}>{counts.alreadyCategorized}</span>

              <span style={{ color: '#64748b' }}>Handled by rules / corrections</span>
              <span style={{ color: '#a6e3a1', fontWeight: 600, textAlign: 'right' }}>{counts.byRule}</span>

              <span style={{ color: '#64748b' }}>Sent to LLM</span>
              <span style={{ color: counts.toLLM > 0 ? '#89b4fa' : '#64748b', fontWeight: 600, textAlign: 'right' }}>{counts.toLLM}</span>

              {counts.toLLM > 0 && (
                <>
                  <span style={{ color: '#64748b', paddingLeft: 12 }}>↳ batches of {BATCH_SIZE}</span>
                  <span style={{ color: '#89b4fa', fontWeight: 600, textAlign: 'right' }}>{counts.batchCount}</span>
                </>
              )}

              {counts.skipped > 0 && (
                <>
                  <span style={{ color: '#64748b' }}>Skipped (positive, non-income)</span>
                  <span style={{ color: '#64748b', fontWeight: 600, textAlign: 'right' }}>{counts.skipped}</span>
                </>
              )}
            </div>

            {counts.toLLM === 0 && counts.byRule === 0 ? (
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                Nothing to categorize.
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={btn('#6366f1', '#fff', counts.toLLM === 0 && counts.byRule === 0)}
                disabled={counts.toLLM === 0 && counts.byRule === 0}
                onClick={runCategorization}
              >
                {counts.toLLM > 0 ? `Run — ${counts.batchCount} LLM batch${counts.batchCount !== 1 ? 'es' : ''}` : 'Apply rules'}
              </button>
              <button style={btn('transparent', '#64748b')} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {/* RUNNING */}
        {phase.kind === 'running' && (
          <div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Processing LLM batches…
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {phase.batches.map(bs => (
                <BatchRow key={bs.index} bs={bs} />
              ))}
            </div>
          </div>
        )}

        {/* SAVING */}
        {phase.kind === 'saving' && (
          <StatusLine icon="⏳" text="Saving results…" />
        )}

        {/* DONE */}
        {phase.kind === 'done' && (
          <div>
            <StatusLine icon="✓" text={`${phase.categorized} transaction${phase.categorized !== 1 ? 's' : ''} categorized`} color="#a6e3a1" />
            {phase.ruleCount > 0 && (
              <div style={{
                marginTop: 16, padding: '14px 16px', borderRadius: 8,
                background: '#1a1a2e', border: '1px solid #89b4fa44',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#89b4fa' }}>
                    {phase.ruleCount} rule suggestion{phase.ruleCount !== 1 ? 's' : ''} pending review
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Approve or reject them in Settings → Candidate Rules
                  </div>
                </div>
                {onViewCandidates && (
                  <button
                    onClick={onViewCandidates}
                    style={{ ...btn('#89b4fa22', '#89b4fa'), border: '1px solid #89b4fa44', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    View →
                  </button>
                )}
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <button style={btn('#313244', '#cdd6f4')} onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase.kind === 'error' && (
          <div>
            <StatusLine icon="✗" text="Something went wrong" color="#f38ba8" />
            <div style={{
              background: '#13131f', borderRadius: 8, padding: '12px 14px',
              fontSize: 12, color: '#f38ba8', fontFamily: 'monospace',
              marginTop: 8, marginBottom: 20, wordBreak: 'break-all',
            }}>
              {phase.message}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn('#313244', '#cdd6f4')} onClick={() => setPhase({ kind: 'preview', counts })}>
                Try again
              </button>
              <button style={btn('transparent', '#64748b')} onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BatchRow({ bs }: { bs: BatchStatus }) {
  const statusColor = bs.status === 'done' ? '#a6e3a1' : bs.status === 'error' ? '#f38ba8' : bs.status === 'running' ? '#89b4fa' : '#45475a';
  const icon = bs.status === 'done' ? '✓' : bs.status === 'error' ? '✗' : bs.status === 'running' ? '⟳' : '·';
  const label = `Batch ${bs.index} / ${bs.total}`;
  const timeStr = bs.status === 'pending' ? '' : fmtMs(bs.elapsed);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: '#13131f', borderRadius: 8, padding: '10px 14px',
      border: `1px solid ${bs.status === 'running' ? '#313244' : '#1e1e2e'}`,
    }}>
      <span style={{
        fontSize: 14, color: statusColor, width: 16, textAlign: 'center',
        display: 'inline-block',
        animation: bs.status === 'running' ? 'cm-spin 1s linear infinite' : undefined,
      }}>
        {icon}
      </span>
      <span style={{ fontSize: 13, color: bs.status === 'pending' ? '#45475a' : '#cdd6f4', flex: 1 }}>
        {label}
      </span>
      {timeStr && (
        <span style={{ fontSize: 12, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
          {timeStr}
        </span>
      )}
      {bs.status === 'running' && (
        <ProgressPulse />
      )}
    </div>
  );
}

function ProgressPulse() {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: '#89b4fa',
          animation: `cm-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

function StatusLine({ icon, text, color = '#cdd6f4' }: { icon: string; text: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color }}>{text}</span>
    </div>
  );
}
