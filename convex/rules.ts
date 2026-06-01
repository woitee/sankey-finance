import { v } from "convex/values";
import { authenticatedAction, authenticatedMutation, authenticatedQuery } from "./lib/auth";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  areMatchersEquivalent,
  findInvalidRegex,
  getPrimaryCondition,
  getRuleMatcher,
  matchesTransactionRule,
  serializeMatcher,
} from "../src/rules/matcher";
import type { RuleLike, RuleMatcher } from "../src/rules/matcher";

const matchTypeValidator = v.union(
  v.literal("contains"),
  v.literal("exact"),
  v.literal("startsWith"),
  v.literal("word"),
  v.literal("regex"),
);

function normalizeRulePayload<T extends {
  pattern: string;
  field: "merchantName" | "details";
  matchType: "contains" | "exact" | "startsWith" | "word" | "regex";
  caseSensitive?: boolean | undefined;
  matcher?: RuleMatcher | null;
}>(payload: T) {
  const matcher = getRuleMatcher(payload);
  const invalidRegex = findInvalidRegex(matcher);
  if (invalidRegex) throw new Error(invalidRegex);
  const primary = getPrimaryCondition(matcher);
  return {
    ...payload,
    pattern: primary.pattern,
    field: primary.field,
    matchType: primary.matchType,
    caseSensitive: primary.caseSensitive ?? false,
    matcher,
  };
}

async function ensureUniqueRuleMatcher(
  ctx: any,
  matcher: ReturnType<typeof getRuleMatcher>,
  excludeId?: Id<"rules">,
) {
  const existingRules = await ctx.db.query("rules").collect();
  const duplicate = existingRules.find((rule: any) =>
    rule.status !== "rejected"
      && rule._id !== excludeId
      && areMatchersEquivalent(getRuleMatcher(rule), matcher)
  );
  if (duplicate) throw new Error("A rule with the same filters already exists.");
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const listActive = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("rules")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();
  },
});

export const listCandidates = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("rules")
      .withIndex("by_status", q => q.eq("status", "candidate"))
      .collect();
  },
});

export const get = authenticatedQuery({
  args: { id: v.id("rules") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

// ── Mutations ─────────────────────────────────────────────────────────────────

export const create = authenticatedMutation({
  args: {
    pattern: v.string(),
    field: v.union(v.literal("merchantName"), v.literal("details")),
    matchType: matchTypeValidator,
    caseSensitive: v.optional(v.boolean()),
    matcher: v.optional(v.any()),
    subcategory: v.string(),
    category: v.union(v.string(), v.null()),
    type: v.union(v.string(), v.null()),
    source: v.union(v.literal("manual"), v.literal("ai")),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeRulePayload(args);
    await ensureUniqueRuleMatcher(ctx, normalized.matcher);
    return await ctx.db.insert("rules", {
      ...normalized,
      status: args.source === "manual" ? "active" : "candidate",
      createdAt: new Date().toISOString(),
    });
  },
});

/** Create multiple candidate rules from AI suggestions, skipping duplicates.
 *  Returns the newly created rule objects (with _id) so callers can apply them immediately. */
export const batchCreateCandidates = authenticatedMutation({
  args: {
    rules: v.array(v.object({
      pattern: v.string(),
      field: v.union(v.literal("merchantName"), v.literal("details")),
      matchType: matchTypeValidator,
      caseSensitive: v.optional(v.boolean()),
      matcher: v.optional(v.any()),
      subcategory: v.string(),
      category: v.union(v.string(), v.null()),
      type: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, { rules }) => {
    const created: Array<{
      _id: Id<"rules">;
      pattern: string;
      field: "merchantName" | "details";
      matchType: "contains" | "exact" | "startsWith" | "word" | "regex";
      caseSensitive?: boolean;
      matcher: unknown;
      subcategory: string;
      category: string | null;
      type: string | null;
    }> = [];

    const existingSignatures = new Set(
      (await ctx.db.query("rules").collect())
        .filter(rule => rule.status !== "rejected")
        .map(rule => serializeMatcher(getRuleMatcher(rule))),
    );
    const seenInBatch = new Set<string>();

    for (const rawRule of rules) {
      const rule = normalizeRulePayload(rawRule);
      const signature = serializeMatcher(rule.matcher);
      if (existingSignatures.has(signature) || seenInBatch.has(signature)) continue;

      const id = await ctx.db.insert("rules", {
        ...rule,
        status: "candidate",
        source: "ai",
        createdAt: new Date().toISOString(),
      });
      seenInBatch.add(signature);
      created.push({ _id: id, ...rule });
    }
    return created;
  },
});

export const approve = authenticatedMutation({
  args: { id: v.id("rules") },
  handler: async (ctx, { id }) => {
    const rule = await ctx.db.get(id);
    if (!rule) return;
    await ensureUniqueRuleMatcher(ctx, getRuleMatcher(rule), id);
    await ctx.db.patch(id, { status: "active", approvedAt: new Date().toISOString() });
  },
});

export const reject = authenticatedMutation({
  args: { id: v.id("rules") },
  handler: async (ctx, { id }) => {
    const rule = await ctx.db.get(id);
    if (!rule) return;

    await ctx.db.patch(id, { status: "rejected" });

    // If it was never approved (candidate), revert any transactions it categorized back to 'llm'
    if (rule.status === "candidate") {
      const txs = await ctx.db
        .query("transactions")
        .collect();
      for (const tx of txs) {
        if ((tx.ruleId as string | undefined) === (id as string)) {
          await ctx.db.patch(tx._id, {
            categorizationSource: "llm",
            ruleId: undefined,
          });
        }
      }
    }
  },
});

export const update = authenticatedMutation({
  args: {
    id: v.id("rules"),
    pattern: v.string(),
    field: v.union(v.literal("merchantName"), v.literal("details")),
    matchType: matchTypeValidator,
    caseSensitive: v.optional(v.boolean()),
    matcher: v.optional(v.any()),
    subcategory: v.string(),
    category: v.union(v.string(), v.null()),
    type: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const normalized = normalizeRulePayload(fields);
    await ensureUniqueRuleMatcher(ctx, normalized.matcher, id);
    await ctx.db.patch(id, normalized);
  },
});

export const remove = authenticatedMutation({
  args: { id: v.id("rules") },
  handler: async (ctx, { id }) => {
    const rule = await ctx.db.get(id);
    if (!rule) return;

    await ctx.db.delete(id);

    // If it was a candidate (never approved), revert transactions back to 'llm'.
    // If it was active, leave transactions in place — they'll show as "deleted rule" in the UI.
    if (rule.status === "candidate") {
      const txs = await ctx.db.query("transactions").collect();
      for (const tx of txs) {
        if ((tx.ruleId as string | undefined) === (id as string)) {
          await ctx.db.patch(tx._id, {
            categorizationSource: "llm",
            ruleId: undefined,
          });
        }
      }
    }
  },
});

// ── Apply action ──────────────────────────────────────────────────────────────

function matchesRule(
  tx: { merchantName: string; details: string },
  rule: {
    pattern?: string;
    field?: string;
    matchType?: string;
    caseSensitive?: boolean;
    matcher?: unknown;
  },
): boolean {
  return matchesTransactionRule(tx as any, rule as any);
}

/** Apply all active rules to transactions from a specific import. */
export const applyRulesToImport = authenticatedAction({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }): Promise<{ updated: number }> => {
    const rules = await ctx.runQuery(api.rules.listActive, {});
    if (rules.length === 0) return { updated: 0 };

    const txs = await ctx.runQuery(api.transactions.byImport, { importId });
    let updated = 0;

    for (const tx of txs) {
      if (tx.categorizationSource === "manual") continue;

      const matched = rules.find(r => matchesRule(tx, r));
      if (!matched) continue;

      if (tx.ruleId === matched._id && tx.categorizationSource === "rule" && tx.subcategory === matched.subcategory && tx.type === matched.type && tx.category === matched.category) continue;

      await ctx.runMutation(api.transactions.updateCategories, {
        id: tx._id,
        subcategory: matched.subcategory, category: matched.category, type: matched.type,
        categorizationSource: "rule",
        ruleId: matched._id,
      });
      updated++;
    }

    return { updated };
  },
});

/** Apply all active rules to all non-manually-categorized transactions. */
export const applyAllRules = authenticatedAction({
  args: {},
  handler: async (ctx): Promise<{ updated: number }> => {
    const rules = await ctx.runQuery(api.rules.listActive, {});
    if (rules.length === 0) return { updated: 0 };

    const txs = await ctx.runQuery(api.transactions.listAll, {});
    let updated = 0;

    for (const tx of txs) {
      if (tx.categorizationSource === "manual") continue;

      const matched = rules.find(r => matchesRule(tx, r));
      if (!matched) continue;

      if (tx.ruleId === matched._id && tx.categorizationSource === "rule" && tx.subcategory === matched.subcategory && tx.type === matched.type && tx.category === matched.category) continue;

      await ctx.runMutation(api.transactions.updateCategories, {
        id: tx._id,
        subcategory: matched.subcategory, category: matched.category, type: matched.type,
        categorizationSource: "rule",
        ruleId: matched._id,
      });
      updated++;
    }

    return { updated };
  },
});

/** Apply a rule to all non-manually-categorized transactions. Returns count updated. */
export const applyToTransactions = authenticatedAction({
  args: { id: v.id("rules") },
  handler: async (ctx, { id }): Promise<{ updated: number }> => {
    const rule = await ctx.runQuery(api.rules.get, { id });
    if (!rule || rule.status !== "active") return { updated: 0 };

    // Fetch all transactions (personal finance volumes are manageable)
    const txs = await ctx.runQuery(api.transactions.listAll, {});
    let updated = 0;

    for (const tx of txs) {
      // Don't override manual categorizations
      if (tx.categorizationSource === "manual") continue;
      if (!matchesRule(tx, rule)) continue;

      await ctx.runMutation(api.transactions.updateCategories, {
        id: tx._id,
        subcategory: rule.subcategory,
        category: rule.category,
        type: rule.type,
        categorizationSource: "rule",
        ruleId: id,
      });
      updated++;
    }

    return { updated };
  },
});
