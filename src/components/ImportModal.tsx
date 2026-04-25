import { useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { detectParser, PARSERS } from '../parsers/registry';
import { LlmParser } from '../parsers/llmParser';
import type { BankParser, ParsedStatement } from '../parsers/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOriginalId(accountNumber: string, period: string, index: number): string {
  return `${accountNumber || 'import'}-${period || 'unknown'}-${String(index).padStart(4, '0')}`;
}

const llmParser = new LlmParser();

// ── State machine ─────────────────────────────────────────────────────────────

type Phase =
  | { kind: 'idle' }
  | { kind: 'detecting' }
  | { kind: 'detected';   file: File; parser: BankParser }
  | { kind: 'undetected'; file: File }
  | { kind: 'parsing';    parserName: string }
  | { kind: 'preview';    statement: ParsedStatement; file: File; parserName: string }
  | { kind: 'importing' }
  | { kind: 'done';       inserted: number; skipped: number }
  | { kind: 'error';      message: string };

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

// ── Component ─────────────────────────────────────────────────────────────────

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [llmApproved, setLlmApproved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createImport = useMutation(api.imports.create);
  const upsertStatement = useMutation(api.statements.upsert);
  const batchUpsert = useMutation(api.transactions.batchUpsert);
  const ensureAccount = useMutation(api.accounts.ensureExists);
  const applyRulesToImport = useAction(api.rules.applyRulesToImport);

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setPhase({ kind: 'detecting' });
    try {
      const parser = await detectParser(file);
      if (parser) {
        setPhase({ kind: 'detected', file, parser });
      } else {
        setPhase({ kind: 'undetected', file });
      }
    } catch (e: any) {
      setPhase({ kind: 'error', message: String(e?.message ?? e) });
    }
  }

  async function runParse(file: File, parser: BankParser) {
    setPhase({ kind: 'parsing', parserName: parser.name });
    try {
      const statement = await parser.parse(file);
      setPhase({ kind: 'preview', statement, file, parserName: parser.name });
    } catch (e: any) {
      setPhase({ kind: 'error', message: String(e?.message ?? e) });
    }
  }

  async function runImport(statement: ParsedStatement, sourceFile: File, parserName: string) {
    setPhase({ kind: 'importing' });
    try {
      // Create import record first
      const importId = await createImport({
        filename: sourceFile.name,
        parserName,
        period: statement.period,
        accountNumber: statement.accountNumber,
        transactionCount: statement.transactions.length,
      });

      // Ensure account exists
      if (statement.accountNumber) {
        await ensureAccount({ accountNumber: statement.accountNumber });
      }
      // Upsert statement record
      await upsertStatement({
        period: statement.period,
        accountNumber: statement.accountNumber,
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        totalIncome: statement.totalIncome,
        totalDebits: statement.totalDebits,
      });
      // Batch-upsert transactions in chunks of 100
      const txs = statement.transactions.map((tx, i) => ({
        originalId: makeOriginalId(statement.accountNumber, statement.period, i),
        period: statement.period,
        bankAccountNumber: statement.accountNumber || undefined,
        datePosted: tx.datePosted,
        dateExecuted: tx.dateExecuted,
        type: tx.type,
        cardholderName: tx.cardholderName,
        accountIdentifier: tx.accountIdentifier,
        merchantName: tx.merchantName,
        details: tx.details,
        amount: tx.amount,
        fees: tx.fees,
        importId,
      }));

      let inserted = 0, skipped = 0;
      const CHUNK = 100;
      for (let i = 0; i < txs.length; i += CHUNK) {
        const result = await batchUpsert({ transactions: txs.slice(i, i + CHUNK) });
        inserted += result.inserted;
        skipped += result.skipped;
      }

      await applyRulesToImport({ importId });
      setPhase({ kind: 'done', inserted, skipped });
    } catch (e: any) {
      setPhase({ kind: 'error', message: String(e?.message ?? e) });
    }
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Import Statement</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* IDLE: drop zone */}
        {phase.kind === 'idle' && (
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #45475a', borderRadius: 12, padding: '48px 32px',
              textAlign: 'center', cursor: 'pointer', color: '#64748b',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#45475a')}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
            <div style={{ fontSize: 15, color: '#cdd6f4', marginBottom: 6 }}>Drop a bank statement here</div>
            <div style={{ fontSize: 13 }}>or click to browse</div>
            <div style={{ fontSize: 11, marginTop: 12, color: '#45475a' }}>
              <div>Supported banks:</div>
              <ul style={{ margin: '6px 0 4px', paddingLeft: 18, textAlign: 'left', display: 'inline-block' }}>
                {PARSERS.map(parser => (
                  <li key={parser.name}>{parser.name}</li>
                ))}
              </ul>
              <div>AI fallback available</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {/* DETECTING */}
        {phase.kind === 'detecting' && (
          <StatusLine icon="⏳" text="Detecting format…" />
        )}

        {/* DETECTED */}
        {phase.kind === 'detected' && (
          <div>
            <StatusLine icon="✓" text={`${phase.file.name}`} color="#a6e3a1" />
            <div style={{ fontSize: 13, color: '#a6e3a1', marginTop: 4, marginBottom: 24 }}>
              {phase.parser.name} detected
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn('#6366f1', '#fff')} onClick={() => runParse(phase.file, phase.parser)}>
                Parse File
              </button>
              <button style={btn('transparent', '#64748b')} onClick={() => setPhase({ kind: 'idle' })}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* UNDETECTED */}
        {phase.kind === 'undetected' && (
          <div>
            <StatusLine icon="?" text={`${phase.file.name}`} color="#f9e2af" />
            <div style={{ fontSize: 13, color: '#f9e2af', marginBottom: 16 }}>
              Format not recognized by any built-in parser.
            </div>
            <div style={{
              background: '#13131f', borderRadius: 8, padding: '14px 16px',
              marginBottom: 20, fontSize: 13, color: '#64748b', border: '1px solid #313244',
            }}>
              <strong style={{ color: '#cdd6f4' }}>Try with AI</strong>
              <p style={{ margin: '6px 0 0' }}>
                Claude will read the text content of your file to extract transactions.
                Your statement data will be sent to the Anthropic API.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', color: '#94a3b8' }}>
                <input type="checkbox" checked={llmApproved} onChange={e => setLlmApproved(e.target.checked)} />
                I understand my statement will be sent to Claude
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={btn('#6366f1', '#fff', !llmApproved)}
                disabled={!llmApproved}
                onClick={() => llmApproved && runParse(phase.file, llmParser)}
              >
                Parse with AI
              </button>
              <button style={btn('transparent', '#64748b')} onClick={() => setPhase({ kind: 'idle' })}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* PARSING */}
        {phase.kind === 'parsing' && (
          <StatusLine icon="⚙️" text={`Parsing with ${phase.parserName}…`} />
        )}

        {/* PREVIEW */}
        {phase.kind === 'preview' && (() => {
          const { statement, file, parserName } = phase;
          return (
            <div>
              <StatusLine icon="✓" text={file.name} color="#a6e3a1" />
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>Parsed by {parserName}</div>
              <div style={{
                background: '#13131f', borderRadius: 8, padding: '16px 18px',
                border: '1px solid #313244', marginBottom: 20, display: 'grid',
                gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13,
              }}>
                <InfoRow label="Period" value={statement.period || '—'} />
                <InfoRow label="Account" value={statement.accountNumber || '—'} />
                <InfoRow label="Opening balance" value={fmt(statement.openingBalance)} />
                <InfoRow label="Closing balance" value={fmt(statement.closingBalance)} />
                <InfoRow label="Transactions" value={String(statement.transactions.length)} />
                <InfoRow label="Total income" value={fmt(statement.totalIncome)} />
              </div>
              {statement.transactions.length === 0 ? (
                <div style={{ color: '#f38ba8', fontSize: 13, marginBottom: 20 }}>
                  No transactions were parsed. The file may not be in the expected format.
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={btn('#6366f1', '#fff', statement.transactions.length === 0)}
                  disabled={statement.transactions.length === 0}
                  onClick={() => runImport(statement, file, parserName)}
                >
                  Import {statement.transactions.length} transactions
                </button>
                <button style={btn('transparent', '#64748b')} onClick={() => setPhase({ kind: 'idle' })}>
                  Start over
                </button>
              </div>
            </div>
          );
        })()}

        {/* IMPORTING */}
        {phase.kind === 'importing' && (
          <StatusLine icon="⏳" text="Importing transactions…" />
        )}

        {/* DONE */}
        {phase.kind === 'done' && (
          <div>
            <StatusLine icon="✓" text={`${phase.inserted} transactions imported`} color="#a6e3a1" />
            {phase.skipped > 0 && (
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 20 }}>
                {phase.skipped} already existed and were skipped.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button style={btn('#6366f1', '#fff')} onClick={() => setPhase({ kind: 'idle' })}>
                Import another
              </button>
              <button style={btn('transparent', '#64748b')} onClick={onClose}>
                Close
              </button>
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
              <button style={btn('#313244', '#cdd6f4')} onClick={() => setPhase({ kind: 'idle' })}>
                Try again
              </button>
              <button style={btn('transparent', '#64748b')} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: '#cdd6f4', fontWeight: 600 }}>{value}</span>
    </>
  );
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
