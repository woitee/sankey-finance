import { useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { getAllCat3Values, getAllCat2Values, getAllCat1Values, resolveCategory } from '../config/categories';
import {
  buildLegacyMatcher,
  describeMatcher,
  findInvalidRegex,
  getPrimaryCondition,
  getRuleMatcher,
  normalizeMatcher,
} from '../rules/matcher';
import type {
  RuleCondition,
  RuleField,
  RuleGroup,
  RuleGroupOperator,
  RuleMatchType,
  RuleMatcher,
} from '../rules/matcher';

// ── Shared helpers ────────────────────────────────────────────────────────────

function btnStyle(bg: string, color: string, border = 'none'): React.CSSProperties {
  return {
    background: bg, color, border, borderRadius: 6,
    fontSize: 12, padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

const inputStyle: React.CSSProperties = {
  background: '#313244', border: '1px solid #45475a', borderRadius: 6,
  color: '#cdd6f4', fontSize: 13, padding: '5px 8px',
};

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#13131f',
      border: '1px solid #1e1e2e',
      borderRadius: 10,
      padding: '20px 24px',
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {title}
      </h3>
      {subtitle && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4a5568' }}>{subtitle}</p>
      )}
    </div>
  );
}

// ── Accounts ──────────────────────────────────────────────────────────────────

function AccountsList() {
  const accounts = useQuery(api.accounts.list);
  const rename = useMutation(api.accounts.rename);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (accounts === undefined) return <div style={{ color: '#64748b' }}>Loading…</div>;
  if (accounts.length === 0) return (
    <div style={{ color: '#4a5568', fontSize: 13 }}>
      No accounts yet — import a statement or connect an integration to add them automatically.
    </div>
  );

  const commitEdit = async (accountNumber: string) => {
    const trimmed = draft.trim();
    if (trimmed) await rename({ accountNumber, name: trimmed });
    setEditing(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {accounts.map(account => (
        <div key={account.accountNumber} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '10px 14px', borderRadius: 8, background: '#1e1e2e',
        }}>
          <div style={{ flex: 1 }}>
            {editing === account.accountNumber ? (
              <input
                autoFocus value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(account.accountNumber);
                  if (e.key === 'Escape') setEditing(null);
                }}
                onBlur={() => commitEdit(account.accountNumber)}
                style={{ ...inputStyle, border: '1px solid #6366f1', fontSize: 14, fontWeight: 600, width: '100%', maxWidth: 280 }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>{account.name}</span>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#4a5568', fontFamily: 'monospace' }}>{account.accountNumber}</span>
          {account.institution && (
            <span style={{ fontSize: 12, color: '#64748b', minWidth: 60 }}>{account.institution}</span>
          )}
          {editing !== account.accountNumber && (
            <button onClick={() => { setEditing(account.accountNumber); setDraft(account.name); }}
              style={btnStyle('transparent', '#94a3b8', '1px solid #45475a')}>
              Rename
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Integrations ──────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending_auth: '#f9e2af',
  active: '#a6e3a1',
  error: '#f38ba8',
};
const STATUS_LABEL: Record<string, string> = {
  pending_auth: 'Pending auth',
  active: 'Active',
  error: 'Error',
};

function IntegrationRow({ integration }: { integration: any }) {
  const removeIntegration = useMutation(api.integrations.remove);
  const syncIntegration = useAction(api.bankSync.syncIntegration);
  const [syncing, setSyncing] = useState(false);
  const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string;

  const handleConnect = () => {
    const url = `${convexSiteUrl}/api/auth/start?bank=${integration.bank}&integrationId=${integration._id}`;
    const popup = window.open(url, 'bank_auth', 'width=600,height=700,noopener');
    const onMessage = (e: MessageEvent) => {
      if (e.data === 'auth_complete') { popup?.close(); window.removeEventListener('message', onMessage); }
    };
    window.addEventListener('message', onMessage);
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await syncIntegration({ integrationId: integration._id }); }
    catch (err) { console.error('Sync failed:', err); }
    setSyncing(false);
  };

  return (
    <div style={{ padding: '12px 14px', borderRadius: 8, background: '#1e1e2e', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 2 }}>{integration.label}</div>
        <div style={{ fontSize: 12, color: '#4a5568' }}>
          {integration.bank}
          {integration.lastSyncedAt && <> · Last synced {new Date(integration.lastSyncedAt).toLocaleString()}</>}
          {integration.linkedAccountNumbers?.length > 0 && <> · {integration.linkedAccountNumbers.length} account(s)</>}
        </div>
        {integration.lastError && <div style={{ fontSize: 12, color: '#f38ba8', marginTop: 4 }}>{integration.lastError}</div>}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
        color: STATUS_COLOR[integration.status] ?? '#94a3b8',
        background: `${STATUS_COLOR[integration.status] ?? '#94a3b8'}22`,
      }}>
        {STATUS_LABEL[integration.status] ?? integration.status}
      </span>
      {integration.status === 'pending_auth' && <button onClick={handleConnect} style={btnStyle('#6366f1', '#fff')}>Connect</button>}
      {integration.status === 'active' && <button onClick={handleSync} disabled={syncing} style={btnStyle('#313244', '#94a3b8')}>{syncing ? 'Syncing…' : 'Sync now'}</button>}
      {integration.status === 'error' && <button onClick={handleConnect} style={btnStyle('#f38ba8', '#11111b')}>Reconnect</button>}
      <button onClick={() => removeIntegration({ id: integration._id })} style={btnStyle('transparent', '#f38ba8', '1px solid #f38ba838')}>Remove</button>
    </div>
  );
}

function IntegrationsList() {
  const integrations = useQuery(api.integrations.list);
  if (integrations === undefined) return <div style={{ color: '#64748b' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {integrations.map(i => <IntegrationRow key={i._id} integration={i} />)}
      {integrations.length === 0 && (
        <div style={{ color: '#4a5568', fontSize: 13 }}>
          No bank integrations configured yet. Add a bank provider to enable automatic syncing.
        </div>
      )}
    </div>
  );
}

// ── People (cardholder nicknames) ─────────────────────────────────────────────

function CardholderNicknames() {
  const nicknames = useQuery(api.cardholderNicknames.list);
  const cardholderNames = useQuery(api.transactions.uniqueCardholderNames);
  const upsert = useMutation(api.cardholderNicknames.upsert);
  const remove = useMutation(api.cardholderNicknames.remove);
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [editing, setEditing] = useState<Id<'cardholderNicknames'> | null>(null);
  const [editDraft, setEditDraft] = useState('');

  if (nicknames === undefined) return <div style={{ color: '#64748b' }}>Loading…</div>;

  const handleAdd = async () => {
    if (!fullName.trim() || !nickname.trim()) return;
    await upsert({ fullName: fullName.trim(), nickname: nickname.trim() });
    setFullName(''); setNickname(''); setAdding(false);
  };

  const commitEdit = async (id: Id<'cardholderNicknames'>, fn: string) => {
    if (editDraft.trim()) await upsert({ fullName: fn, nickname: editDraft.trim() });
    setEditing(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {nicknames.length === 0 && !adding && (
        <div style={{ color: '#4a5568', fontSize: 13 }}>No nicknames yet.</div>
      )}
      {nicknames.map(n => (
        <div key={n._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: '#1e1e2e' }}>
          <span style={{ flex: 1, fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>{n.fullName}</span>
          <span style={{ color: '#45475a', fontSize: 13 }}>→</span>
          {editing === n._id ? (
            <input autoFocus value={editDraft} onChange={e => setEditDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(n._id, n.fullName); if (e.key === 'Escape') setEditing(null); }}
              onBlur={() => commitEdit(n._id, n.fullName)}
              style={{ ...inputStyle, border: '1px solid #6366f1', width: 140 }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', minWidth: 80 }}>{n.nickname}</span>
          )}
          {editing !== n._id && (
            <button onClick={() => { setEditing(n._id); setEditDraft(n.nickname); }}
              style={btnStyle('transparent', '#94a3b8', '1px solid #45475a')}>Edit</button>
          )}
          <button onClick={() => remove({ id: n._id })}
            style={btnStyle('transparent', '#f38ba8', '1px solid #f38ba838')}>Remove</button>
        </div>
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="Full name (exact)" value={fullName} onChange={e => setFullName(e.target.value)}
            autoFocus list="cardholder-names-list" style={{ ...inputStyle, width: 260 }} />
          <datalist id="cardholder-names-list">
            {(cardholderNames ?? []).map(name => <option key={name} value={name} />)}
          </datalist>
          <span style={{ color: '#45475a' }}>→</span>
          <input placeholder="Nickname" value={nickname} onChange={e => setNickname(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
            style={{ ...inputStyle, width: 140 }} />
          <button onClick={handleAdd} style={btnStyle('#6366f1', '#fff')}>Add</button>
          <button onClick={() => setAdding(false)} style={btnStyle('transparent', '#64748b')}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ ...btnStyle('transparent', '#94a3b8', '1px solid #45475a'), marginTop: 4, alignSelf: 'flex-start' }}>
          + Add nickname
        </button>
      )}
    </div>
  );
}

// ── Rules ─────────────────────────────────────────────────────────────────────

const MATCH_LABELS: Record<string, string> = {
  contains: 'contains',
  exact: 'equals',
  startsWith: 'starts with',
  word: 'matches word',
  regex: 'matches regex',
};
const FIELD_LABELS: Record<string, string> = {
  merchantName: 'merchant',
  details: 'details',
};

const MATCH_OPTIONS: RuleMatchType[] = ['contains', 'exact', 'startsWith', 'word', 'regex'];
const FIELD_OPTIONS: RuleField[] = ['merchantName', 'details'];

function newCondition(): RuleCondition {
  return { kind: 'condition', field: 'merchantName', matchType: 'contains', pattern: '', caseSensitive: false };
}

function newGroup(operator: RuleGroupOperator = 'and'): RuleGroup {
  return { kind: 'group', operator, conditions: [newCondition()] };
}

function wrapMatcher(matcher: RuleMatcher, operator: RuleGroupOperator): RuleGroup {
  return { kind: 'group', operator, conditions: [matcher, newCondition()] };
}

function matcherHasBlankPattern(matcher: RuleMatcher): boolean {
  if (matcher.kind === 'condition') return !matcher.pattern.trim();
  return matcher.conditions.some(matcherHasBlankPattern);
}

function isLegacyCompatibleMatcher(matcher: RuleMatcher): boolean {
  return matcher.kind === 'condition'
    && !matcher.caseSensitive
    && (matcher.matchType === 'contains' || matcher.matchType === 'exact' || matcher.matchType === 'startsWith');
}

function isConvexLegacyValidatorError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '');
  return message.includes('ArgumentValidationError')
    && (message.includes('extra field `caseSensitive`') || message.includes('extra field `matcher`'));
}

function toLegacyRulePayload(values: RuleFormValues) {
  return {
    pattern: values.pattern,
    field: values.field,
    matchType: values.matchType,
    cat3: values.cat3,
    cat2: values.cat2 || null,
    cat1: values.cat1 || null,
  };
}

async function mutateRuleWithCompatibility(
  mutate: (payload: any) => Promise<any>,
  values: RuleFormValues,
  extras: Record<string, unknown> = {},
) {
  const fullPayload = { ...values, ...extras, cat2: values.cat2 || null, cat1: values.cat1 || null };
  if (isLegacyCompatibleMatcher(values.matcher)) {
    return await mutate({ ...toLegacyRulePayload(values), ...extras });
  }
  try {
    return await mutate(fullPayload);
  } catch (error) {
    if (!isConvexLegacyValidatorError(error)) throw error;
    throw new Error('Advanced rule filters need the Convex backend to be redeployed. Simple contains/exact/starts with rules still work.');
  }
}

function RuleDescription({ rule }: { rule: any }) {
  const cat2 = rule.cat2 ?? resolveCategory(rule.cat3)?.cat2;
  const cat1 = rule.cat1 ?? resolveCategory(rule.cat3)?.cat1;
  const matcher = getRuleMatcher(rule);
  return (
    <span style={{ fontSize: 13, color: '#94a3b8' }}>
      <span style={{ color: '#cdd6f4', fontWeight: 600 }}>{describeMatcher(matcher)}</span>
      <span style={{ color: '#45475a' }}> → </span>
      {cat1 && <span style={{ color: '#74c7ec', fontSize: 12 }}>{cat1} / </span>}
      {cat2 && <span style={{ color: '#89b4fa', fontSize: 12 }}>{cat2} / </span>}
      <span style={{ color: '#a6e3a1', fontWeight: 600 }}>{rule.cat3}</span>
    </span>
  );
}

const CAT1_VALUES = ['MUST', 'WANT', 'MUST/WANT', 'INCOME', 'NOISE', 'TRANSFER'];

interface RuleFormValues {
  matcher: RuleMatcher;
  pattern: string;
  field: RuleField;
  matchType: RuleMatchType;
  caseSensitive: boolean;
  cat3: string;
  cat2: string;
  cat1: string;
}

function MatcherEditor({
  matcher,
  onChange,
  onRemove,
  isRoot = false,
}: {
  matcher: RuleMatcher;
  onChange: (matcher: RuleMatcher) => void;
  onRemove?: () => void;
  isRoot?: boolean;
}) {
  const selectStyle: React.CSSProperties = { ...inputStyle, padding: '4px 6px', fontSize: 12 };

  if (matcher.kind === 'condition') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={matcher.field} onChange={e => onChange({ ...matcher, field: e.target.value as RuleField })} style={selectStyle}>
          {FIELD_OPTIONS.map(field => <option key={field} value={field}>{FIELD_LABELS[field]}</option>)}
        </select>
        <select value={matcher.matchType} onChange={e => onChange({ ...matcher, matchType: e.target.value as RuleMatchType })} style={selectStyle}>
          {MATCH_OPTIONS.map(matchType => <option key={matchType} value={matchType}>{MATCH_LABELS[matchType]}</option>)}
        </select>
        <select value={matcher.caseSensitive ? 'sensitive' : 'insensitive'} onChange={e => onChange({ ...matcher, caseSensitive: e.target.value === 'sensitive' })} style={selectStyle}>
          <option value="insensitive">ignore case</option>
          <option value="sensitive">match case</option>
        </select>
        <input
          placeholder={matcher.matchType === 'regex' ? 'regex pattern' : 'pattern'}
          value={matcher.pattern}
          onChange={e => onChange({ ...matcher, pattern: e.target.value })}
          autoFocus={isRoot}
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <button onClick={() => onChange(wrapMatcher(matcher, 'and'))} style={btnStyle('transparent', '#89b4fa', '1px solid #89b4fa33')}>Wrap AND</button>
        <button onClick={() => onChange(wrapMatcher(matcher, 'or'))} style={btnStyle('transparent', '#f9e2af', '1px solid #f9e2af33')}>Wrap OR</button>
        {!isRoot && onRemove && <button onClick={onRemove} style={btnStyle('transparent', '#f38ba8', '1px solid #f38ba838')}>Remove</button>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #313244', borderRadius: 8, padding: 10, background: '#11111b' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.08em' }}>GROUP</span>
        <select value={matcher.operator} onChange={e => onChange({ ...matcher, operator: e.target.value as RuleGroupOperator })} style={selectStyle}>
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
        <button onClick={() => onChange({ ...matcher, conditions: [...matcher.conditions, newCondition()] })} style={btnStyle('transparent', '#a6e3a1', '1px solid #a6e3a133')}>+ Condition</button>
        <button onClick={() => onChange({ ...matcher, conditions: [...matcher.conditions, newGroup('and')] })} style={btnStyle('transparent', '#89b4fa', '1px solid #89b4fa33')}>+ Group</button>
        {!isRoot && onRemove && <button onClick={onRemove} style={btnStyle('transparent', '#f38ba8', '1px solid #f38ba838')}>Remove</button>}
      </div>
      {matcher.conditions.map((child, index) => {
        const remaining = matcher.conditions.filter((_, i) => i !== index);
        return (
          <MatcherEditor
            key={index}
            matcher={child}
            onChange={next => onChange({ ...matcher, conditions: matcher.conditions.map((entry, i) => i === index ? next : entry) })}
            onRemove={() => onChange(normalizeMatcher({ ...matcher, conditions: remaining.length > 0 ? remaining : [newCondition()] }))}
          />
        );
      })}
      <div style={{ fontSize: 11, color: '#64748b' }}>Parentheses are represented by each nested group.</div>
    </div>
  );
}

function RuleForm({
  initial,
  onSave,
  onCancel,
  saveLabel = 'Save',
}: {
  initial?: Partial<RuleFormValues>;
  onSave: (values: RuleFormValues) => Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [matcher, setMatcher] = useState<RuleMatcher>(initial?.matcher ?? buildLegacyMatcher(initial ?? {}));
  const [cat3, setCat3] = useState(initial?.cat3 ?? '');
  const [cat2, setCat2] = useState(initial?.cat2 ?? '');
  const [cat1, setCat1] = useState(initial?.cat1 ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCat3Change = (val: string) => {
    setCat3(val);
  };

  const normalizedMatcher = normalizeMatcher(matcher);
  const invalidRegex = findInvalidRegex(normalizedMatcher);
  const canSave = !matcherHasBlankPattern(normalizedMatcher) && !invalidRegex && cat3.trim() && cat2.trim() && cat1.trim();

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    const primary = getPrimaryCondition(normalizedMatcher);
    try {
      await onSave({
        matcher: normalizedMatcher,
        pattern: primary.pattern,
        field: primary.field,
        matchType: primary.matchType,
        caseSensitive: primary.caseSensitive ?? false,
        cat3: cat3.trim(),
        cat2: cat2.trim(),
        cat1: cat1.trim(),
      });
    } catch (err: any) {
      setError(String(err?.message ?? err));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, padding: '4px 6px', fontSize: 12 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: '#13131f', borderRadius: 8, border: '1px solid #1e1e2e' }}>
      <MatcherEditor matcher={matcher} onChange={setMatcher} isRoot />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#45475a', fontSize: 13 }}>→</span>
        <select value={cat1} onChange={e => setCat1(e.target.value)} style={{ ...selectStyle, width: 90 }}>
          <option value="">cat1</option>
          {CAT1_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span style={{ color: '#45475a' }}>/</span>
        <input list="cat2-options" placeholder="cat2" value={cat2} onChange={e => setCat2(e.target.value)}
          style={{ ...inputStyle, width: 120 }} />
        <datalist id="cat2-options">
          {getAllCat2Values().map(v => <option key={v} value={v} />)}
        </datalist>
        <span style={{ color: '#45475a' }}>/</span>
        <input list="cat3-options" placeholder="cat3 (new or existing)" value={cat3}
          onChange={e => handleCat3Change(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
          style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
        <datalist id="cat3-options">
          {getAllCat3Values().map(v => <option key={v} value={v} />)}
        </datalist>
      </div>
      {invalidRegex && <div style={{ color: '#f38ba8', fontSize: 12 }}>{invalidRegex}</div>}
      {error && <div style={{ color: '#f38ba8', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={!canSave || saving}
          style={{ ...btnStyle('#6366f1', '#fff'), opacity: canSave && !saving ? 1 : 0.4 }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button onClick={onCancel} style={btnStyle('transparent', '#64748b')}>Cancel</button>
      </div>
    </div>
  );
}

function CandidateRules() {
  const candidates = useQuery(api.rules.listCandidates);
  const approve = useMutation(api.rules.approve);
  const reject = useMutation(api.rules.reject);
  const updateRule = useMutation(api.rules.update);
  const applyToTransactions = useAction(api.rules.applyToTransactions);
  const [applying, setApplying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (candidates === undefined) return <div style={{ color: '#64748b' }}>Loading…</div>;
  if (candidates.length === 0) return (
    <div style={{ color: '#4a5568', fontSize: 13 }}>
      No pending candidates. Run "Categorize with AI" to generate rule suggestions.
    </div>
  );

  const handleApprove = async (id: Id<'rules'>) => {
    setApplying(id);
    await approve({ id });
    await applyToTransactions({ id });
    setApplying(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {candidates.map(rule => editing === rule._id ? (
        <RuleForm
          key={rule._id}
          initial={{ pattern: rule.pattern, field: rule.field, matchType: rule.matchType, caseSensitive: rule.caseSensitive, matcher: rule.matcher, cat3: rule.cat3, cat2: rule.cat2 ?? '', cat1: rule.cat1 ?? '' }}
          saveLabel="Save"
          onSave={async vals => { await mutateRuleWithCompatibility(updateRule, vals, { id: rule._id }); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div key={rule._id} id={`rule-${rule._id}`} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 8, background: '#1e1e2e',
          border: '1px solid #f9e2af22',
        }}>
          <div style={{ flex: 1 }}><RuleDescription rule={rule} /></div>
          <button onClick={() => setEditing(rule._id)} style={btnStyle('transparent', '#94a3b8', '1px solid #45475a')}>Edit</button>
          <button onClick={() => handleApprove(rule._id)} disabled={applying === rule._id}
            style={btnStyle('#a6e3a122', '#a6e3a1', '1px solid #a6e3a133')}>
            {applying === rule._id ? 'Applying…' : 'Approve'}
          </button>
          <button onClick={() => reject({ id: rule._id })}
            style={btnStyle('transparent', '#f38ba8', '1px solid #f38ba838')}>Reject</button>
        </div>
      ))}
    </div>
  );
}

function ActiveRules() {
  const rules = useQuery(api.rules.listActive);
  const createRule = useMutation(api.rules.create);
  const removeRule = useMutation(api.rules.remove);
  const updateRule = useMutation(api.rules.update);
  const applyAllRules = useAction(api.rules.applyAllRules);
  const [adding, setAdding] = useState(false);
  const [addingToGroup, setAddingToGroup] = useState<{ cat1: string; cat2: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [rerunResult, setRerunResult] = useState<string | null>(null);

  if (rules === undefined) return <div style={{ color: '#64748b' }}>Loading…</div>;

  const handleRerunAll = async () => {
    setRerunning(true);
    setRerunResult(null);
    const { updated } = await applyAllRules({});
    setRerunResult(`${updated} transaction${updated === 1 ? '' : 's'} updated`);
    setRerunning(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Top action bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <button onClick={() => setAdding(true)}
          style={btnStyle('transparent', '#94a3b8', '1px solid #45475a')}>
          + Add rule
        </button>
        {(rules?.length ?? 0) > 0 && (
          <button onClick={handleRerunAll} disabled={rerunning}
            style={{ ...btnStyle('transparent', '#89b4fa', '1px solid #89b4fa44'), opacity: rerunning ? 0.5 : 1 }}>
            {rerunning ? 'Running…' : 'Rerun all rules'}
          </button>
        )}
        {rerunResult && <span style={{ fontSize: 12, color: '#a6e3a1' }}>{rerunResult}</span>}
      </div>

      {adding && (
        <RuleForm
          saveLabel="Add"
          onSave={async vals => {
            await mutateRuleWithCompatibility(createRule, vals, { source: 'manual' });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rules.length === 0 && !adding && (
        <div style={{ color: '#4a5568', fontSize: 13 }}>No active rules yet.</div>
      )}
      {(() => {
        // Group by cat1+cat2, preserving a stable order
        const CAT1_ORDER = ['MUST', 'WANT', 'MUST/WANT', 'INCOME', 'NOISE', 'TRANSFER'];
        const groups = new Map<string, typeof rules>();
        for (const rule of rules) {
          const key = `${rule.cat1 ?? '?'} / ${rule.cat2 ?? '?'}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(rule);
        }
        const sorted = [...groups.entries()].sort(([a], [b]) => {
          const [a1, a2] = a.split(' / ');
          const [b1, b2] = b.split(' / ');
          const o1 = CAT1_ORDER.indexOf(a1), o2 = CAT1_ORDER.indexOf(b1);
          if (o1 !== o2) return (o1 === -1 ? 99 : o1) - (o2 === -1 ? 99 : o2);
          return a2.localeCompare(b2);
        });

        return sorted.map(([groupKey, groupRules]) => {
          const [cat1Label, cat2Label] = groupKey.split(' / ');
          const isAddingHere = addingToGroup?.cat1 === cat1Label && addingToGroup?.cat2 === cat2Label;
          return (
            <div key={groupKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px 4px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#74c7ec', letterSpacing: '0.06em' }}>{cat1Label}</span>
                <span style={{ fontSize: 11, color: '#45475a' }}>/</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#89b4fa' }}>{cat2Label}</span>
                <div style={{ flex: 1, height: 1, background: '#1e1e2e' }} />
                <button
                  onClick={() => setAddingToGroup(isAddingHere ? null : { cat1: cat1Label, cat2: cat2Label })}
                  style={{ ...btnStyle('transparent', '#a6e3a1', '1px solid #a6e3a133'), padding: '2px 8px', fontSize: 13, lineHeight: 1 }}
                  title={`Add rule in ${cat1Label} / ${cat2Label}`}>
                  +
                </button>
              </div>
              {isAddingHere && (
                <RuleForm
                  initial={{ cat1: cat1Label, cat2: cat2Label }}
                  saveLabel="Add"
                  onSave={async vals => {
                    await mutateRuleWithCompatibility(createRule, vals, { source: 'manual' });
                    setAddingToGroup(null);
                  }}
                  onCancel={() => setAddingToGroup(null)}
                />
              )}
              {groupRules.map(rule => editing === rule._id ? (
                <RuleForm
                  key={rule._id}
                  initial={{ pattern: rule.pattern, field: rule.field, matchType: rule.matchType, caseSensitive: rule.caseSensitive, matcher: rule.matcher, cat3: rule.cat3, cat2: rule.cat2 ?? '', cat1: rule.cat1 ?? '' }}
                  saveLabel="Save"
                  onSave={async vals => { await mutateRuleWithCompatibility(updateRule, vals, { id: rule._id }); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={rule._id} id={`rule-${rule._id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 14px', borderRadius: 8, background: '#1e1e2e',
                }}>
                  <div style={{ flex: 1 }}>
                    <RuleDescription rule={rule} />
                    {rule.source === 'ai' && <span style={{ fontSize: 11, color: '#45475a', marginLeft: 8 }}>AI</span>}
                  </div>
                  <button onClick={() => setEditing(rule._id)} style={btnStyle('transparent', '#94a3b8', '1px solid #45475a')}>Edit</button>
                  <button onClick={() => removeRule({ id: rule._id })}
                    style={btnStyle('transparent', '#f38ba8', '1px solid #f38ba838')}>Remove</button>
                </div>
              ))}
            </div>
          );
        });
      })()}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function SettingsView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Accounts group ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#45475a', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 4px 4px' }}>
        Accounts
      </div>

      <SectionCard>
        <SectionHeader title="Bank Accounts" subtitle="Rename accounts to something friendlier than a raw account number." />
        <AccountsList />
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Integrations" subtitle="Automatically pull transactions from your bank on a daily schedule." />
        <IntegrationsList />
      </SectionCard>

      {/* ── People group ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#45475a', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 4px 4px' }}>
        People
      </div>

      <SectionCard>
        <SectionHeader title="Cardholder Nicknames" subtitle="Map full cardholder names from bank statements to short display names." />
        <CardholderNicknames />
      </SectionCard>

      {/* ── Rules group ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#45475a', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 4px 4px' }}>
        Categorization Rules
      </div>

      <SectionCard>
        <SectionHeader title="Candidate Rules" subtitle="AI-suggested rules awaiting your approval. Approving applies the rule to existing transactions." />
        <CandidateRules />
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Active Rules" subtitle="Applied before AI categorization. Rules can combine nested AND/OR groups, case modes, word matching, and regex." />
        <ActiveRules />
      </SectionCard>

    </div>
  );
}
