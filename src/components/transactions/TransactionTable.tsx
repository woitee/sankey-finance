import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Transaction } from '../../types/transaction';
import type { ActiveRule } from '../../services/categorizer';
import { getAllCat3Values, getAllCat2Values, resolveCategory } from '../../config/categories';
import { extractGroups, type TransactionGroup } from '../../transforms/groups';
import { ComboBox } from '../ComboBox';
import { formatCurrency } from '../../utils/currency';

export type CategoryFilter = {
  text?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
};

export type CorrectionPayload = {
  txId: string;
  merchantName: string;
  cat3: string;
  cat2?: string;
  cat1?: string;
};

const selectStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #313244',
  background: '#1e1e2e',
  color: '#cdd6f4',
  fontSize: 13,
  outline: 'none',
  minWidth: 0,
};

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #313244',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 12,
  cursor: 'pointer',
};

type EditingState = { txId: string; column: 'cat1' | 'cat2' | 'cat3' };
type SortColumn = 'amount' | 'cat1' | 'cat2' | 'cat3';
type SortDir = 'asc' | 'desc';
type SortState = { column: SortColumn; dir: SortDir } | null;

// Deterministic color from group ID
function groupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash * 31 + groupId.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 55%)`;
}

export function TransactionTable({
  transactions,
  onCorrect,
  initialFilter = {},
  onGroup,
  onUngroup,
  onUpdateGroupLabel,
  activeRules = [],
  onRuleClick,
}: {
  transactions: Transaction[];
  onCorrect: (payload: CorrectionPayload) => void;
  initialFilter?: CategoryFilter;
  onGroup: (txIds: string[], label?: string) => void;
  onUngroup: (groupId: string) => void;
  onUpdateGroupLabel: (groupId: string, label: string) => void;
  activeRules?: ActiveRule[];
  onRuleClick?: (ruleId: string) => void;
}) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [text, setText] = useState(initialFilter.text ?? '');
  const [filterCat1, setFilterCat1] = useState(initialFilter.cat1 ?? '');
  const [filterCat2, setFilterCat2] = useState(initialFilter.cat2 ?? '');
  const [filterCat3, setFilterCat3] = useState(initialFilter.cat3 ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupLabelInput, setGroupLabelInput] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingGroupLabel, setEditingGroupLabel] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);

  const ruleMap = useMemo(
    () => new Map(activeRules.filter(r => r.id).map(r => [r.id!, r])),
    [activeRules],
  );

  useEffect(() => {
    setText(initialFilter.text ?? '');
    setFilterCat1(initialFilter.cat1 ?? '');
    setFilterCat2(initialFilter.cat2 ?? '');
    setFilterCat3(initialFilter.cat3 ?? '');
  }, [initialFilter]);

  // Unique values for filter dropdowns
  const { cat1Values, cat2Values, cat3Values } = useMemo(() => {
    const c1 = new Set<string>(), c2 = new Set<string>(), c3 = new Set<string>();
    for (const t of transactions) {
      if (t.cat1) c1.add(t.cat1);
      if (t.cat2) c2.add(t.cat2);
      if (t.cat3) c3.add(t.cat3);
    }
    return { cat1Values: [...c1].sort(), cat2Values: [...c2].sort(), cat3Values: [...c3].sort() };
  }, [transactions]);

  const allCat2Options = useMemo(() => [...new Set([...getAllCat2Values(), ...cat2Values])].sort(), [cat2Values]);
  const allCat3Options = useMemo(() => [...new Set([...getAllCat3Values(), ...cat3Values])].sort(), [cat3Values]);

  const filteredCat2Values = useMemo(() => {
    if (!filterCat1) return cat2Values;
    return [...new Set(transactions.filter(t => t.cat1 === filterCat1 && t.cat2).map(t => t.cat2!))].sort();
  }, [filterCat1, cat2Values, transactions]);

  const filteredCat3Values = useMemo(() => {
    let pool = transactions;
    if (filterCat1) pool = pool.filter(t => t.cat1 === filterCat1);
    if (filterCat2) pool = pool.filter(t => t.cat2 === filterCat2);
    return [...new Set(pool.filter(t => t.cat3).map(t => t.cat3!))].sort();
  }, [filterCat1, filterCat2, transactions]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filterCat1 && t.cat1 !== filterCat1) return false;
      if (filterCat2 && t.cat2 !== filterCat2) return false;
      if (filterCat3 && t.cat3 !== filterCat3) return false;
      if (text) {
        const q = text.toLowerCase();
        if (!t.merchantName.toLowerCase().includes(q) && !t.details.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, text, filterCat1, filterCat2, filterCat3]);

  const toggleSort = useCallback((col: SortColumn) => {
    setSort(prev => {
      if (prev?.column !== col) return { column: col, dir: 'asc' };
      if (prev.dir === 'asc') return { column: col, dir: 'desc' };
      return null; // third click clears
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { column, dir } = sort;
    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (column === 'amount') {
        cmp = a.amount - b.amount;
      } else {
        const av = (a[column] || '').toLowerCase();
        const bv = (b[column] || '').toLowerCase();
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return dir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [filtered, sort]);

  const hasAnyFilter = text || filterCat1 || filterCat2 || filterCat3;

  // Build display rows: group headers + grouped rows + ungrouped rows
  const { displayRows, groups } = useMemo(() => {
    const groups = extractGroups(filtered);
    const groupedIds = new Set(groups.flatMap(g => g.members.map(m => m.id)));

    type Row =
      | { type: 'group-header'; group: TransactionGroup }
      | { type: 'tx'; tx: Transaction; isGroupMember: boolean; color?: string };

    const rows: Row[] = [];

    // Ungrouped first, sorted
    for (const tx of sorted) {
      if (!groupedIds.has(tx.id)) {
        rows.push({ type: 'tx', tx, isGroupMember: false });
      }
    }

    // Then groups (members keep their original order)
    for (const group of groups) {
      rows.push({ type: 'group-header', group });
      if (!collapsedGroups.has(group.groupId)) {
        for (const tx of group.members) {
          rows.push({ type: 'tx', tx, isGroupMember: true, color: groupColor(group.groupId) });
        }
      }
    }

    return { displayRows: rows, groups };
  }, [filtered, sorted, collapsedGroups]);

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectedNetAmount = useMemo(() => {
    return filtered.filter(t => selectedIds.has(t.id)).reduce((s, t) => s + t.amount, 0);
  }, [filtered, selectedIds]);

  const handleCategoryEdit = (tx: Transaction, column: 'cat1' | 'cat2' | 'cat3', value: string) => {
    setEditing(null);
    const newCat3 = column === 'cat3' ? value : (tx.cat3 || '');
    const newCat2 = column === 'cat2' ? value : (tx.cat2 || undefined);
    const newCat1 = column === 'cat1' ? value : (tx.cat1 || undefined);
    let finalCat2 = newCat2, finalCat1 = newCat1;
    if (column === 'cat3') {
      const resolved = resolveCategory(value);
      if (resolved) { finalCat2 = finalCat2 || resolved.cat2; finalCat1 = finalCat1 || resolved.cat1; }
    }
    onCorrect({ txId: tx.id, merchantName: tx.merchantName || tx.details, cat3: newCat3, cat2: finalCat2, cat1: finalCat1 });
  };

  const renderTxRow = (tx: Transaction, isGroupMember: boolean, borderColor?: string) => {
    const isEditingCat1 = editing?.txId === tx.id && editing.column === 'cat1';
    const isEditingCat2 = editing?.txId === tx.id && editing.column === 'cat2';
    const isEditingCat3 = editing?.txId === tx.id && editing.column === 'cat3';

    return (
      <tr
        key={tx.id}
        style={{
          borderBottom: '1px solid #1e1e2e',
          background: selectedIds.has(tx.id) ? 'rgba(99, 102, 241, 0.1)' : !tx.cat3 ? 'rgba(245, 158, 11, 0.08)' : undefined,
        }}
      >
        {/* Checkbox */}
        <td style={{ padding: '4px 8px', width: 32 }}>
          <input
            type="checkbox"
            checked={selectedIds.has(tx.id)}
            onChange={() => toggleSelection(tx.id)}
            style={{ cursor: 'pointer' }}
          />
        </td>
        <td style={{
          padding: '8px 12px', whiteSpace: 'nowrap', color: '#94a3b8',
          borderLeft: borderColor ? `3px solid ${borderColor}` : undefined,
          paddingLeft: isGroupMember ? 20 : 12,
        }}>
          {tx.datePosted}
        </td>
        <td style={{ padding: '8px 12px', color: '#cdd6f4', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.details}>
          {tx.merchantName || tx.details}
        </td>
        <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {tx.cardholderName}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tx.amount > 0 ? '#22c55e' : '#e2e8f0', whiteSpace: 'nowrap' }}>
          {formatCurrency(tx.amount)}
        </td>
        {/* Cat1 */}
        <td style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => { if (!isEditingCat1) setEditing({ txId: tx.id, column: 'cat1' }); }}>
          {isEditingCat1 ? (
            <select autoFocus value={tx.cat1 || ''} onClick={e => e.stopPropagation()} onChange={e => handleCategoryEdit(tx, 'cat1', e.target.value)} onBlur={() => setTimeout(() => setEditing(null), 150)}
              style={{ background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #6366f1', borderRadius: 4, padding: '2px 4px', fontSize: 12 }}>
              <option value="">--</option><option value="MUST">MUST</option><option value="WANT">WANT</option><option value="INCOME">INCOME</option><option value="NOISE">NOISE</option>
            </select>
          ) : tx.cat1 ? (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: tx.cat1 === 'NOISE' ? '#64748b1a' : tx.cat1 === 'MUST' ? '#e874611a' : tx.cat1 === 'WANT' ? '#6a9fdb1a' : '#6dbf7b1a',
              color: tx.cat1 === 'NOISE' ? '#64748b' : tx.cat1 === 'MUST' ? '#e87461' : tx.cat1 === 'WANT' ? '#6a9fdb' : '#6dbf7b' }}>
              {tx.cat1}
            </span>
          ) : <span style={{ borderBottom: '1px dashed #6366f1', color: '#f59e0b', fontSize: 12 }}>set</span>}
        </td>
        {/* Cat2 */}
        <td style={{ padding: '8px 12px', cursor: 'pointer', color: '#94a3b8', minWidth: 100 }} onClick={() => { if (!isEditingCat2) setEditing({ txId: tx.id, column: 'cat2' }); }}>
          {isEditingCat2 ? (
            <div onClick={e => e.stopPropagation()}>
              <ComboBox value={tx.cat2 || ''} options={allCat2Options} placeholder="Category..." onChange={val => handleCategoryEdit(tx, 'cat2', val)} onCancel={() => setEditing(null)} />
            </div>
          ) : <span style={{ borderBottom: '1px dashed #313244' }}>{tx.cat2 || <span style={{ color: '#f59e0b', fontSize: 12 }}>set</span>}</span>}
        </td>
        {/* Cat3 */}
        <td style={{ padding: '8px 12px', cursor: 'pointer', color: '#cdd6f4', minWidth: 120 }} onClick={() => { if (!isEditingCat3) setEditing({ txId: tx.id, column: 'cat3' }); }}>
          {isEditingCat3 ? (
            <div onClick={e => e.stopPropagation()}>
              <ComboBox value={tx.cat3 || ''} options={allCat3Options} placeholder="Specific..." onChange={val => handleCategoryEdit(tx, 'cat3', val)} onCancel={() => setEditing(null)} />
            </div>
          ) : <span style={{ borderBottom: '1px dashed #6366f1', color: tx.cat3 ? '#cdd6f4' : '#f59e0b' }}>{tx.cat3 || 'click to set'}</span>}
        </td>
        <td style={{ padding: '8px 12px', fontSize: 11 }}>
          {tx.ruleId && ruleMap.has(tx.ruleId) ? (
            <span
              title={`${ruleMap.get(tx.ruleId)!.field} ${ruleMap.get(tx.ruleId)!.matchType} "${ruleMap.get(tx.ruleId)!.pattern}"`}
              onClick={() => onRuleClick?.(tx.ruleId!)}
              style={{ color: '#89b4fa', cursor: onRuleClick ? 'pointer' : 'default', textDecoration: onRuleClick ? 'underline' : 'none', textDecorationStyle: 'dotted' }}>
              rule: {ruleMap.get(tx.ruleId)!.pattern}
            </span>
          ) : tx.ruleId ? (
            <span style={{ color: '#64748b', fontStyle: 'italic' }}>deleted rule</span>
          ) : (
            <span style={{ color: '#64748b' }}>
              {tx.categorizationSource === null ? '—'
                : tx.categorizationSource === 'correction' ? 'llm'
                : tx.categorizationSource}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const renderGroupHeader = (group: TransactionGroup) => {
    const isCollapsed = collapsedGroups.has(group.groupId);
    const color = groupColor(group.groupId);
    const isEditingLabel = editingGroupLabel === group.groupId;

    return (
      <tr key={`gh-${group.groupId}`} style={{ background: 'rgba(99, 102, 241, 0.06)', borderBottom: '1px solid #1e1e2e' }}>
        <td style={{ padding: '4px 8px', width: 32 }} />
        <td colSpan={4} style={{ padding: '8px 12px', borderLeft: `3px solid ${color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span onClick={() => toggleCollapse(group.groupId)} style={{ cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>
              {isCollapsed ? '▶' : '▼'}
            </span>
            {isEditingLabel ? (
              <input
                autoFocus
                type="text"
                defaultValue={group.label || ''}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onUpdateGroupLabel(group.groupId, (e.target as HTMLInputElement).value); setEditingGroupLabel(null); }
                  if (e.key === 'Escape') setEditingGroupLabel(null);
                }}
                onBlur={e => { onUpdateGroupLabel(group.groupId, e.target.value); setEditingGroupLabel(null); }}
                style={{ background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #6366f1', borderRadius: 4, padding: '2px 6px', fontSize: 12, width: 200 }}
              />
            ) : (
              <span onClick={() => setEditingGroupLabel(group.groupId)} style={{ cursor: 'pointer', fontWeight: 600, color: '#cdd6f4', borderBottom: '1px dashed #6366f1' }}>
                {group.label || 'Unnamed group'}
              </span>
            )}
            <span style={{ color: '#64748b', fontSize: 12 }}>
              {group.members.length} items
            </span>
          </div>
        </td>
        <td colSpan={2} style={{ padding: '8px 12px', textAlign: 'right' }}>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: group.netAmount > 0 ? '#22c55e' : group.netAmount < 0 ? '#e87461' : '#94a3b8' }}>
            Net: {formatCurrency(group.netAmount)}
          </span>
        </td>
        <td style={{ padding: '8px 12px' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{group.primary.cat3}</span>
        </td>
        <td style={{ padding: '8px 12px' }}>
          <button onClick={() => onUngroup(group.groupId)} style={{ ...btnStyle, fontSize: 11, padding: '3px 8px', color: '#e87461', borderColor: '#e8746133' }}>
            Ungroup
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search merchant..." value={text} onChange={e => setText(e.target.value)}
          style={{ ...selectStyle, flex: '1 1 200px', padding: '8px 14px' }} />
        <select value={filterCat1} onChange={e => { setFilterCat1(e.target.value); setFilterCat2(''); setFilterCat3(''); }} style={selectStyle}>
          <option value="">All Cat1</option>{cat1Values.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filterCat2} onChange={e => { setFilterCat2(e.target.value); setFilterCat3(''); }} style={selectStyle}>
          <option value="">All Cat2</option>{filteredCat2Values.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filterCat3} onChange={e => setFilterCat3(e.target.value)} style={selectStyle}>
          <option value="">All Cat3</option>{filteredCat3Values.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {hasAnyFilter && (
          <button onClick={() => { setText(''); setFilterCat1(''); setFilterCat2(''); setFilterCat3(''); }} style={btnStyle}>Clear</button>
        )}
        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} / {transactions.length}
        </span>
      </div>

      {/* Group toolbar */}
      {selectedIds.size >= 2 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: '#6366f10d', border: '1px solid #6366f133', borderRadius: 8, marginBottom: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <input
            type="text"
            placeholder="Group label (optional)..."
            value={groupLabelInput}
            onChange={e => setGroupLabelInput(e.target.value)}
            style={{ ...selectStyle, flex: '0 1 220px', fontSize: 12, padding: '6px 10px' }}
          />
          <button
            onClick={() => {
              onGroup([...selectedIds], groupLabelInput || undefined);
              setSelectedIds(new Set());
              setGroupLabelInput('');
            }}
            style={{ ...btnStyle, background: '#6366f1', color: '#fff', borderColor: '#6366f1', fontWeight: 600 }}
          >
            Group
          </button>
          <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 'auto' }}>
            Net: <strong style={{ color: selectedNetAmount > 0 ? '#22c55e' : selectedNetAmount < 0 ? '#e87461' : '#94a3b8' }}>{formatCurrency(selectedNetAmount)}</strong>
          </span>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #313244', color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px', width: 32 }}>
                <input type="checkbox"
                  checked={selectedIds.size > 0 && filtered.every(t => selectedIds.has(t.id))}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map(t => t.id)));
                    else setSelectedIds(new Set());
                  }}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '8px 12px' }}>Date</th>
              <th style={{ padding: '8px 12px' }}>Merchant</th>
              <th style={{ padding: '8px 12px' }}>Who</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('amount')}>
                Amount {sort?.column === 'amount' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cat1')}>
                Cat1 {sort?.column === 'cat1' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cat2')}>
                Cat2 {sort?.column === 'cat2' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cat3')}>
                Cat3 {sort?.column === 'cat3' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '8px 12px' }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(row => {
              if (row.type === 'group-header') return renderGroupHeader(row.group);
              return renderTxRow(row.tx, row.isGroupMember, row.color);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
