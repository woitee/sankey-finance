import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Transaction } from '../../types/transaction';
import type { ActiveRule } from '../../services/categorizer';
import { getAllSubcategoryValues, getAllCategoryValues } from '../../config/categories';
import { extractGroups, type TransactionGroup } from '../../transforms/groups';
import { ComboBox } from '../ComboBox';
import { formatCurrency } from '../../utils/currency';
import { describeMatcher, getRuleMatcher } from '../../rules/matcher';

export type CategoryFilter = {
  text?: string;
  type?: string;
  category?: string;
  subcategory?: string;
};

export type CategoryEditPayload = {
  txId: string;
  merchantName: string;
  subcategory: string;
  category?: string;
  type?: string;
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

type EditingState = { txId: string; column: 'type' | 'category' | 'subcategory' };
type SortColumn = 'amount' | 'type' | 'category' | 'subcategory';
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
  candidateRules = [],
  onRuleClick,
  onDelete,
  onRecategorizeWithAI,
  categorizing = false,
  onCreateRule,
}: {
  transactions: Transaction[];
  onCorrect: (payload: CategoryEditPayload) => void;
  initialFilter?: CategoryFilter;
  onGroup: (txIds: string[], label?: string) => void;
  onUngroup: (groupId: string) => void;
  onUpdateGroupLabel: (groupId: string, label: string) => void;
  activeRules?: ActiveRule[];
  candidateRules?: ActiveRule[];
  onRuleClick?: (ruleId: string) => void;
  onDelete?: (ids: string[]) => void;
  onRecategorizeWithAI?: (ids: string[]) => void;
  categorizing?: boolean;
  onCreateRule?: (tx: Transaction) => void;
}) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [text, setText] = useState(initialFilter.text ?? '');
  const [filterType, setFilterType] = useState(initialFilter.type ?? '');
  const [filterCategory, setFilterCategory] = useState(initialFilter.category ?? '');
  const [filterSubcategory, setFilterSubcategory] = useState(initialFilter.subcategory ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupLabelInput, setGroupLabelInput] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingGroupLabel, setEditingGroupLabel] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);

  const ruleMap = useMemo(
    () => new Map(activeRules.filter(r => r.id).map(r => [r.id!, r])),
    [activeRules],
  );

  const candidateRuleMap = useMemo(
    () => new Map(candidateRules.filter(r => r.id).map(r => [r.id!, r])),
    [candidateRules],
  );

  useEffect(() => {
    setText(initialFilter.text ?? '');
    setFilterType(initialFilter.type ?? '');
    setFilterCategory(initialFilter.category ?? '');
    setFilterSubcategory(initialFilter.subcategory ?? '');
  }, [initialFilter]);

  // Unique values for filter dropdowns
  const { typeValues, categoryValues, subcategoryValues } = useMemo(() => {
    const t1 = new Set<string>(), c = new Set<string>(), s = new Set<string>();
    for (const t of transactions) {
      if (t.type) t1.add(t.type);
      if (t.category) c.add(t.category);
      if (t.subcategory) s.add(t.subcategory);
    }
    return { typeValues: [...t1].sort(), categoryValues: [...c].sort(), subcategoryValues: [...s].sort() };
  }, [transactions]);

  const allCategoryOptions = useMemo(() => [...new Set([...getAllCategoryValues(), ...categoryValues])].sort(), [categoryValues]);
  const allSubcategoryOptions = useMemo(() => [...new Set([...getAllSubcategoryValues(), ...subcategoryValues])].sort(), [subcategoryValues]);

  const filteredCategoryValues = useMemo(() => {
    if (!filterType) return categoryValues;
    return [...new Set(transactions.filter(t => t.type === filterType && t.category).map(t => t.category!))].sort();
  }, [filterType, categoryValues, transactions]);

  const filteredSubcategoryValues = useMemo(() => {
    let pool = transactions;
    if (filterType) pool = pool.filter(t => t.type === filterType);
    if (filterCategory) pool = pool.filter(t => t.category === filterCategory);
    return [...new Set(pool.filter(t => t.subcategory).map(t => t.subcategory!))].sort();
  }, [filterType, filterCategory, transactions]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filterType && t.type !== filterType) return false;
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterSubcategory && t.subcategory !== filterSubcategory) return false;
      if (text) {
        const q = text.toLowerCase();
        if (!t.merchantName.toLowerCase().includes(q) && !t.details.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, text, filterType, filterCategory, filterSubcategory]);

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

  const hasAnyFilter = text || filterType || filterCategory || filterSubcategory;

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

  const handleCategoryEdit = (tx: Transaction, column: 'type' | 'category' | 'subcategory', value: string) => {
    setEditing(null);
    const newSubcategory = column === 'subcategory' ? value : (tx.subcategory || '');
    const newCategory = column === 'category' ? value : (tx.category || undefined);
    const newType = column === 'type' ? value : (tx.type || undefined);
    onCorrect({ txId: tx.id, merchantName: tx.merchantName || tx.details, subcategory: newSubcategory, category: newCategory, type: newType });
  };

  const renderTxRow = (tx: Transaction, isGroupMember: boolean, borderColor?: string) => {
    const isEditingType = editing?.txId === tx.id && editing.column === 'type';
    const isEditingCategory = editing?.txId === tx.id && editing.column === 'category';
    const isEditingSubcategory = editing?.txId === tx.id && editing.column === 'subcategory';

    return (
      <tr
        key={tx.id}
        style={{
          borderBottom: '1px solid #1e1e2e',
          background: selectedIds.has(tx.id) ? 'rgba(99, 102, 241, 0.1)' : !tx.subcategory ? 'rgba(245, 158, 11, 0.08)' : undefined,
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
        {/* Type */}
        <td style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => { if (!isEditingType) setEditing({ txId: tx.id, column: 'type' }); }}>
          {isEditingType ? (
            <select autoFocus value={tx.type || ''} onClick={e => e.stopPropagation()} onChange={e => handleCategoryEdit(tx, 'type', e.target.value)} onBlur={() => setTimeout(() => setEditing(null), 150)}
              style={{ background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #6366f1', borderRadius: 4, padding: '2px 4px', fontSize: 12 }}>
              <option value="">--</option><option value="MUST">MUST</option><option value="WANT">WANT</option><option value="MUST/WANT">MUST/WANT</option><option value="INCOME">INCOME</option><option value="NOISE">NOISE</option>
            </select>
          ) : tx.type ? (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: tx.type === 'NOISE' ? '#64748b1a' : tx.type === 'MUST' ? '#e874611a' : tx.type === 'WANT' ? '#6a9fdb1a' : tx.type === 'MUST/WANT' ? '#c49adf1a' : '#6dbf7b1a',
              color: tx.type === 'NOISE' ? '#64748b' : tx.type === 'MUST' ? '#e87461' : tx.type === 'WANT' ? '#6a9fdb' : tx.type === 'MUST/WANT' ? '#c49adf' : '#6dbf7b' }}>
              {tx.type}
            </span>
          ) : <span style={{ borderBottom: '1px dashed #6366f1', color: '#f59e0b', fontSize: 12 }}>set</span>}
        </td>
        {/* Category */}
        <td style={{ padding: '8px 12px', cursor: 'pointer', color: '#94a3b8', minWidth: 100 }} onClick={() => { if (!isEditingCategory) setEditing({ txId: tx.id, column: 'category' }); }}>
          {isEditingCategory ? (
            <div onClick={e => e.stopPropagation()}>
              <ComboBox value={tx.category || ''} options={allCategoryOptions} placeholder="Category..." onChange={val => handleCategoryEdit(tx, 'category', val)} onCancel={() => setEditing(null)} />
            </div>
          ) : <span style={{ borderBottom: '1px dashed #313244' }}>{tx.category || <span style={{ color: '#f59e0b', fontSize: 12 }}>set</span>}</span>}
        </td>
        {/* Subcategory */}
        <td style={{ padding: '8px 12px', cursor: 'pointer', color: '#cdd6f4', minWidth: 120 }} onClick={() => { if (!isEditingSubcategory) setEditing({ txId: tx.id, column: 'subcategory' }); }}>
          {isEditingSubcategory ? (
            <div onClick={e => e.stopPropagation()}>
              <ComboBox value={tx.subcategory || ''} options={allSubcategoryOptions} placeholder="Specific..." onChange={val => handleCategoryEdit(tx, 'subcategory', val)} onCancel={() => setEditing(null)} />
            </div>
          ) : <span style={{ borderBottom: '1px dashed #6366f1', color: tx.subcategory ? '#cdd6f4' : '#f59e0b' }}>{tx.subcategory || 'click to set'}</span>}
        </td>
        <td style={{ padding: '8px 12px', fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {tx.ruleId && ruleMap.has(tx.ruleId) ? (
              <span
                title={describeMatcher(getRuleMatcher(ruleMap.get(tx.ruleId)!))}
                onClick={() => onRuleClick?.(tx.ruleId!)}
                style={{ color: '#89b4fa', cursor: onRuleClick ? 'pointer' : 'default', textDecoration: onRuleClick ? 'underline' : 'none', textDecorationStyle: 'dotted' }}>
                rule: {ruleMap.get(tx.ruleId)!.pattern}
              </span>
            ) : tx.ruleId && candidateRuleMap.has(tx.ruleId) ? (
              <span
                title={describeMatcher(getRuleMatcher(candidateRuleMap.get(tx.ruleId)!))}
                onClick={() => onRuleClick?.(tx.ruleId!)}
                style={{ color: '#f59e0b', fontStyle: 'italic', cursor: onRuleClick ? 'pointer' : 'default', textDecoration: onRuleClick ? 'underline' : 'none', textDecorationStyle: 'dotted' }}>
                cand. rule: {candidateRuleMap.get(tx.ruleId)!.pattern}
              </span>
            ) : tx.ruleId ? (
              <span style={{ color: '#64748b', fontStyle: 'italic' }}>deleted rule</span>
            ) : (
              <span style={{ color: '#64748b' }}>
                {tx.categorizationSource ?? '—'}
              </span>
            )}
            {onCreateRule && (
              (!tx.ruleId && (tx.categorizationSource === 'manual' || tx.categorizationSource === 'llm')) ||
              (tx.ruleId && !ruleMap.has(tx.ruleId) && !candidateRuleMap.has(tx.ruleId))
            ) && (
              <button
                onClick={e => { e.stopPropagation(); onCreateRule(tx); }}
                title={`Create candidate rule: merchantName contains "${tx.merchantName || tx.details}"`}
                style={{ ...btnStyle, fontSize: 10, padding: '2px 6px', color: '#a6e3a1', borderColor: '#a6e3a133', flexShrink: 0 }}
              >
                + rule
              </button>
            )}
          </div>
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
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{group.primary.subcategory}</span>
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
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setFilterCategory(''); setFilterSubcategory(''); }} style={selectStyle}>
          <option value="">All Types</option>{typeValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setFilterSubcategory(''); }} style={selectStyle}>
          <option value="">All Categories</option>{filteredCategoryValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filterSubcategory} onChange={e => setFilterSubcategory(e.target.value)} style={selectStyle}>
          <option value="">All Subcategories</option>{filteredSubcategoryValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {hasAnyFilter && (
          <button onClick={() => { setText(''); setFilterType(''); setFilterCategory(''); setFilterSubcategory(''); }} style={btnStyle}>Clear</button>
        )}
        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} / {transactions.length}
        </span>
      </div>

      {/* Selection toolbar */}
      {selectedIds.size >= 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: '#6366f10d', border: '1px solid #6366f133', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.size} selected</span>

          {onRecategorizeWithAI && (
            <button
              disabled={categorizing}
              onClick={() => { onRecategorizeWithAI([...selectedIds]); setSelectedIds(new Set()); }}
              style={{ ...btnStyle, background: '#6366f1', color: '#fff', borderColor: '#6366f1', fontWeight: 600, opacity: categorizing ? 0.6 : 1 }}
            >
              {categorizing ? 'Categorizing…' : 'Recategorize with AI'}
            </button>
          )}

          {onDelete && (
            <button
              onClick={() => { onDelete([...selectedIds]); setSelectedIds(new Set()); }}
              style={{ ...btnStyle, color: '#e87461', borderColor: '#e8746133' }}
            >
              Delete
            </button>
          )}

          {selectedIds.size >= 2 && (
            <>
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
                style={{ ...btnStyle, fontWeight: 600 }}
              >
                Group
              </button>
            </>
          )}

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
              <th style={{ padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('type')}>
                Type {sort?.column === 'type' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('category')}>
                Category {sort?.column === 'category' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('subcategory')}>
                Subcategory {sort?.column === 'subcategory' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
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
