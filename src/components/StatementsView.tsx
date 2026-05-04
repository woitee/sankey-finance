import { useEffect, useMemo, useState } from 'react';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { detectParser, PARSERS } from '../parsers/registry';
import { LlmParser } from '../parsers/llmParser';

type ParsedStatement = {
  period: string;
  accountNumber: string;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalDebits: number;
  transactions: Array<{
    datePosted: string;
    dateExecuted: string;
    type: string;
    cardholderName: string;
    accountIdentifier: string;
    merchantName: string;
    details: string;
    amount: number;
    fees: number;
  }>;
};

type StoredStatement = {
  _id: Id<'imports'>;
  filename: string;
  parserName: string;
  importedAt: string;
  period: string;
  accountNumber: string;
  transactionCount: number;
  importedTransactionCount: number;
  fileContentType?: string;
  fileUrl: string | null;
  fileStorageId?: Id<'_storage'>;
};

type ReparsePlan = {
  statement: StoredStatement;
  parserName: string;
  parsed: ParsedStatement;
  transactions: Array<{
    originalId: string;
    period: string;
    bankAccountNumber?: string;
    datePosted: string;
    dateExecuted: string;
    type: string;
    cardholderName: string;
    accountIdentifier: string;
    merchantName: string;
    details: string;
    amount: number;
    fees: number;
  }>;
  conflictingOriginalIds: string[];
};

const llmParser = new LlmParser();

function makeOriginalId(accountNumber: string, period: string, index: number): string {
  return `${accountNumber || 'import'}-${period || 'unknown'}-${String(index).padStart(4, '0')}`;
}

function parserForStatement(parserName: string) {
  return PARSERS.find(parser => parser.name === parserName) ?? (parserName === llmParser.name ? llmParser : null);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function StatementsView({ from, to }: { from: string; to: string }) {
  const convex = useConvex();
  const storedStatements = useQuery(api.imports.listStoredStatements, { from, to }) as StoredStatement[] | undefined;
  const [selectedId, setSelectedId] = useState<Id<'imports'> | null>(null);
  const [reparseState, setReparseState] = useState<{ id: Id<'imports'>; message: string } | null>(null);
  const [reparsePlan, setReparsePlan] = useState<ReparsePlan | null>(null);

  const upsertStatement = useMutation(api.statements.upsert);
  const replaceByImport = useMutation(api.transactions.replaceByImport);
  const refreshParsedMetadata = useMutation(api.imports.refreshParsedMetadata);
  const applyRulesToImport = useAction(api.rules.applyRulesToImport);

  useEffect(() => {
    if (!storedStatements?.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !storedStatements.some(item => item._id === selectedId)) {
      setSelectedId(storedStatements[0]._id);
    }
  }, [selectedId, storedStatements]);

  const selected = useMemo(
    () => storedStatements?.find(item => item._id === selectedId) ?? null,
    [selectedId, storedStatements],
  );

  async function executeReparse(plan: ReparsePlan, conflictMode: 'overwrite' | 'skip') {
    try {
      await refreshParsedMetadata({
        id: plan.statement._id,
        parserName: plan.parserName,
        period: plan.parsed.period,
        accountNumber: plan.parsed.accountNumber,
        transactionCount: plan.parsed.transactions.length,
      });

      if (plan.parsed.accountNumber) {
        await upsertStatement({
          period: plan.parsed.period,
          accountNumber: plan.parsed.accountNumber,
          openingBalance: plan.parsed.openingBalance,
          closingBalance: plan.parsed.closingBalance,
          totalIncome: plan.parsed.totalIncome,
          totalDebits: plan.parsed.totalDebits,
        });
      }

      setReparseState({ id: plan.statement._id, message: 'Replacing transactions…' });
      const result = await replaceByImport({
        importId: plan.statement._id,
        conflictMode,
        transactions: plan.transactions,
      });

      setReparseState({ id: plan.statement._id, message: 'Reapplying rules…' });
      await applyRulesToImport({ importId: plan.statement._id });

      const suffix = result.skipped > 0
        ? ` ${result.skipped} conflicting transaction${result.skipped === 1 ? '' : 's'} skipped.`
        : result.overwritten > 0
          ? ` ${result.overwritten} conflicting transaction${result.overwritten === 1 ? '' : 's'} overwritten.`
          : '';

      setReparsePlan(null);
      setReparseState({ id: plan.statement._id, message: `Reparse complete.${suffix}` });
      window.setTimeout(() => {
        setReparseState(current => (current?.id === plan.statement._id ? null : current));
      }, 2500);
    } catch (error: any) {
      setReparseState({ id: plan.statement._id, message: String(error?.message ?? error) });
    }
  }

  async function handleReparse(statement: StoredStatement) {
    if (!statement.fileUrl) return;

    setReparsePlan(null);
    setReparseState({ id: statement._id, message: 'Downloading statement…' });
    try {
      const response = await fetch(statement.fileUrl);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);

      const blob = await response.blob();
      const file = new File([blob], statement.filename, {
        type: statement.fileContentType || blob.type || 'application/pdf',
      });

      setReparseState({ id: statement._id, message: 'Selecting parser…' });
      const parser = parserForStatement(statement.parserName) ?? await detectParser(file);
      if (!parser) {
        throw new Error(`No parser available for ${statement.filename}`);
      }

      setReparseState({ id: statement._id, message: `Parsing with ${parser.name}…` });
      const parsed = await parser.parse(file) as ParsedStatement;
      const transactions = parsed.transactions.map((tx, index) => ({
        originalId: makeOriginalId(parsed.accountNumber, parsed.period, index),
        period: parsed.period,
        bankAccountNumber: parsed.accountNumber || undefined,
        datePosted: tx.datePosted,
        dateExecuted: tx.dateExecuted,
        type: tx.type,
        cardholderName: tx.cardholderName,
        accountIdentifier: tx.accountIdentifier,
        merchantName: tx.merchantName,
        details: tx.details,
        amount: tx.amount,
        fees: tx.fees,
      }));

      const conflictCheck = await convex.query(api.transactions.inspectReparseConflicts, {
        importId: statement._id,
        originalIds: transactions.map(tx => tx.originalId),
      });

      const plan: ReparsePlan = {
        statement,
        parserName: parser.name,
        parsed,
        transactions,
        conflictingOriginalIds: conflictCheck.conflictingOriginalIds,
      };

      if (conflictCheck.conflictCount > 0) {
        setReparsePlan(plan);
        setReparseState({
          id: statement._id,
          message: `${conflictCheck.conflictCount} conflicting transaction${conflictCheck.conflictCount === 1 ? '' : 's'} found. Choose overwrite or skip.`,
        });
        return;
      }

      await executeReparse(plan, 'overwrite');
    } catch (error: any) {
      setReparsePlan(null);
      setReparseState({ id: statement._id, message: String(error?.message ?? error) });
    }
  }

  if (storedStatements === undefined) {
    return <div style={{ color: '#94a3b8' }}>Loading stored statements…</div>;
  }

  if (storedStatements.length === 0) {
    return (
      <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
        No stored PDF statements in the selected statement date range. Import a PDF statement and it will appear here for viewing.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <aside
        style={{
          flex: '0 0 320px',
          width: '100%',
          maxWidth: 360,
          background: '#11111b',
          border: '1px solid #313244',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #313244', color: '#cdd6f4', fontWeight: 700 }}>
          Stored PDFs
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {storedStatements.map(item => {
            const active = item._id === selectedId;
            return (
              <button
                key={item._id}
                onClick={() => setSelectedId(item._id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  background: active ? '#313244' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #1e1e2e',
                  color: '#cdd6f4',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>{item.filename}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.period} · {item.importedTransactionCount} imported transactions</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{formatTimestamp(item.importedAt)}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <section style={{ flex: '1 1 640px', minWidth: 0 }}>
        {selected && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{selected.filename}</h2>
                <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
                  <div>Imported: {formatTimestamp(selected.importedAt)}</div>
                  <div>Account: {selected.accountNumber || 'Unknown'}</div>
                  <div>Parser: {selected.parserName}</div>
                  <div>Transactions from statement: {selected.importedTransactionCount}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void handleReparse(selected)}
                  disabled={reparseState?.id === selected._id && reparseState.message !== 'Reparse complete.'}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: '#313244',
                    color: '#cdd6f4',
                    border: '1px solid #45475a',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Reparse file
                </button>
                {selected.fileUrl && (
                  <a
                    href={selected.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      alignSelf: 'flex-start',
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: '#6366f1',
                      color: '#fff',
                      textDecoration: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Open in new tab
                  </a>
                )}
              </div>
            </div>

            {reparseState?.id === selected._id && (
              <div style={{ marginBottom: 16, color: reparseState.message.includes('complete') ? '#a6e3a1' : reparseState.message.includes('failed') ? '#f38ba8' : '#94a3b8' }}>
                {reparseState.message}
              </div>
            )}

            {reparsePlan?.statement._id === selected._id && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #f9e2af',
                  background: '#2a1f14',
                  color: '#f9e2af',
                }}
              >
                <div style={{ marginBottom: 12, lineHeight: 1.5 }}>
                  {reparsePlan.conflictingOriginalIds.length} parsed transaction{reparsePlan.conflictingOriginalIds.length === 1 ? '' : 's'} already exist in other statements.
                  Overwrite will remove those conflicting transactions from the other statements. Skip will keep those other statements unchanged and exclude the conflicts from this reparse.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void executeReparse(reparsePlan, 'overwrite')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#f38ba8',
                      color: '#11111b',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Overwrite conflicts
                  </button>
                  <button
                    onClick={() => void executeReparse(reparsePlan, 'skip')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #f9e2af',
                      background: 'transparent',
                      color: '#f9e2af',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Skip conflicts
                  </button>
                  <button
                    onClick={() => setReparsePlan(null)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #45475a',
                      background: 'transparent',
                      color: '#cdd6f4',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {selected.fileUrl ? (
              <iframe
                title={selected.filename}
                src={selected.fileUrl}
                style={{
                  width: '100%',
                  minHeight: '75vh',
                  border: '1px solid #313244',
                  borderRadius: 12,
                  background: '#11111b',
                }}
              />
            ) : (
              <div style={{ color: '#f38ba8' }}>This PDF is no longer available in Convex storage.</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
