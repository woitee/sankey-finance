import type { Transaction } from '../types/transaction';

export type RuleField = 'merchantName' | 'details';
export type RuleMatchType = 'contains' | 'exact' | 'startsWith' | 'word' | 'regex';
export type RuleGroupOperator = 'and' | 'or';

export interface RuleCondition {
  kind: 'condition';
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  caseSensitive?: boolean;
}

export interface RuleGroup {
  kind: 'group';
  operator: RuleGroupOperator;
  conditions: RuleMatcher[];
}

export type RuleMatcher = RuleCondition | RuleGroup;

export interface RuleLike {
  pattern?: string;
  field?: RuleField;
  matchType?: RuleMatchType;
  caseSensitive?: boolean;
  matcher?: RuleMatcher | null;
}

export function buildLegacyMatcher(rule: Pick<RuleLike, 'pattern' | 'field' | 'matchType' | 'caseSensitive'>): RuleCondition {
  return {
    kind: 'condition',
    pattern: rule.pattern ?? '',
    field: rule.field ?? 'merchantName',
    matchType: rule.matchType ?? 'contains',
    caseSensitive: rule.caseSensitive ?? false,
  };
}

export function getRuleMatcher(rule: RuleLike): RuleMatcher {
  return normalizeMatcher(rule.matcher ?? buildLegacyMatcher(rule));
}

export function normalizeMatcher(matcher: RuleMatcher): RuleMatcher {
  if (matcher.kind === 'condition') {
    return {
      kind: 'condition',
      field: matcher.field,
      matchType: matcher.matchType,
      pattern: matcher.pattern.trim(),
      caseSensitive: matcher.caseSensitive ?? false,
    };
  }

  const normalizedChildren = matcher.conditions
    .map(normalizeMatcher)
    .flatMap(child => child.kind === 'group' && child.operator === matcher.operator ? child.conditions : [child])
    .sort((a, b) => serializeMatcher(a).localeCompare(serializeMatcher(b)));

  if (normalizedChildren.length === 1) return normalizedChildren[0];

  return {
    kind: 'group',
    operator: matcher.operator,
    conditions: normalizedChildren,
  };
}

export function serializeMatcher(matcher: RuleMatcher): string {
  const normalized = matcher.kind === 'condition' ? normalizeMatcher(matcher) : normalizeMatcher(matcher);
  if (normalized.kind === 'condition') {
    return JSON.stringify([
      normalized.kind,
      normalized.field,
      normalized.matchType,
      normalized.caseSensitive ?? false,
      normalized.pattern,
    ]);
  }

  return JSON.stringify([
    normalized.kind,
    normalized.operator,
    normalized.conditions.map(serializeMatcher),
  ]);
}

export function areMatchersEquivalent(left: RuleMatcher, right: RuleMatcher): boolean {
  return serializeMatcher(left) === serializeMatcher(right);
}

export function getPrimaryCondition(matcher: RuleMatcher): RuleCondition {
  const normalized = normalizeMatcher(matcher);
  if (normalized.kind === 'condition') return normalized;
  return getPrimaryCondition(normalized.conditions[0] ?? {
    kind: 'condition',
    field: 'merchantName',
    matchType: 'contains',
    pattern: '',
    caseSensitive: false,
  });
}

export function findInvalidRegex(matcher: RuleMatcher): string | null {
  const normalized = normalizeMatcher(matcher);
  if (normalized.kind === 'condition') {
    if (normalized.matchType !== 'regex') return null;
    try {
      new RegExp(normalized.pattern, normalized.caseSensitive ? 'u' : 'iu');
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid regular expression';
    }
  }

  for (const child of normalized.conditions) {
    const invalid = findInvalidRegex(child);
    if (invalid) return invalid;
  }
  return null;
}

export function matchesTransactionRule(tx: Pick<Transaction, 'merchantName' | 'details'>, rule: RuleLike): boolean {
  return matchesMatcher(tx, getRuleMatcher(rule));
}

export function matchesMatcher(tx: Pick<Transaction, 'merchantName' | 'details'>, matcher: RuleMatcher): boolean {
  if (matcher.kind === 'group') {
    if (matcher.conditions.length === 0) return false;
    return matcher.operator === 'and'
      ? matcher.conditions.every(child => matchesMatcher(tx, child))
      : matcher.conditions.some(child => matchesMatcher(tx, child));
  }

  const normalized = normalizeMatcher(matcher);
  return normalized.kind === 'condition' ? matchesCondition(tx, normalized) : false;
}

export function describeMatcher(matcher: RuleMatcher): string {
  const normalized = normalizeMatcher(matcher);
  if (normalized.kind === 'condition') {
    const caseLabel = normalized.caseSensitive ? 'case-sensitive' : 'case-insensitive';
    return `${normalized.field} ${normalized.matchType} ${JSON.stringify(normalized.pattern)} (${caseLabel})`;
  }

  return `(${normalized.conditions.map(describeMatcher).join(` ${normalized.operator.toUpperCase()} `)})`;
}

function matchesCondition(tx: Pick<Transaction, 'merchantName' | 'details'>, matcher: RuleCondition): boolean {
  const value = (matcher.field === 'merchantName' ? tx.merchantName : tx.details) ?? '';
  const pattern = matcher.pattern;
  const source = matcher.caseSensitive ? value : value.toLocaleLowerCase();
  const target = matcher.caseSensitive ? pattern : pattern.toLocaleLowerCase();

  if (matcher.matchType === 'exact') return source === target;
  if (matcher.matchType === 'startsWith') return source.startsWith(target);
  if (matcher.matchType === 'contains') return source.includes(target);
  if (matcher.matchType === 'word') {
    if (!pattern.trim()) return false;
    const flags = matcher.caseSensitive ? 'u' : 'iu';
    const escaped = escapeRegex(pattern.trim());
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, flags).test(value);
  }
  if (!pattern.trim()) return false;

  try {
    return new RegExp(pattern, matcher.caseSensitive ? 'u' : 'iu').test(value);
  } catch {
    return false;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
