import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listAll = query({
  args: {},
  handler: async (ctx) => ctx.db.query("transactions").collect(),
});

export const byImport = query({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_import", q => q.eq("importId", importId))
      .collect();
  },
});

// Query transactions by date range
export const byDateRange = query({
  args: {
    from: v.string(),   // ISO date string "YYYY-MM-DD"
    to: v.string(),     // ISO date string "YYYY-MM-DD"
  },
  handler: async (ctx, { from, to }) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_datePosted", (q) =>
        q.gte("datePosted", from).lte("datePosted", to)
      )
      .collect();
  },
});

// Query all transactions for a specific period
export const byPeriod = query({
  args: { period: v.string() },
  handler: async (ctx, { period }) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_period", (q) => q.eq("period", period))
      .collect();
  },
});

// List distinct periods that have transactions
export const listPeriods = query({
  args: {},
  handler: async (ctx) => {
    const statements = await ctx.db.query("statements").collect();
    return statements
      .map((s) => s.period)
      .sort();
  },
});

// Distinct cardholder names for actual cardholders (masked card numbers like ****1234)
// Excludes transfer counterparties whose accountIdentifier is an IBAN/account number
export const uniqueCardholderNames = query({
  args: {},
  handler: async (ctx) => {
    const txs = await ctx.db.query("transactions").collect();
    const names = new Set(
      txs
        .filter((t) => t.accountIdentifier.includes("*"))
        .map((t) => t.cardholderName)
        .filter(Boolean)
    );
    return [...names].sort();
  },
});

// Upsert a single transaction (by originalId)
export const upsert = mutation({
  args: {
    originalId: v.string(),
    period: v.string(),
    datePosted: v.string(),
    dateExecuted: v.string(),
    type: v.string(),
    cardholderName: v.string(),
    accountIdentifier: v.string(),
    merchantName: v.string(),
    details: v.string(),
    amount: v.number(),
    fees: v.number(),
    cat3: v.union(v.string(), v.null()),
    cat2: v.union(v.string(), v.null()),
    cat1: v.union(v.string(), v.null()),
    categorizationSource: v.union(
      v.literal("rule"),
      v.literal("unverified_rule"),
      v.literal("llm"),
      v.literal("manual"),
      v.null()
    ),
    groupId: v.union(v.string(), v.null()),
    groupLabel: v.union(v.string(), v.null()),
    bankAccountNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_originalId", (q) => q.eq("originalId", args.originalId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return await ctx.db.insert("transactions", args);
    }
  },
});

// Update categorization fields for a transaction
export const updateCategories = mutation({
  args: {
    id: v.id("transactions"),
    cat3: v.union(v.string(), v.null()),
    cat2: v.union(v.string(), v.null()),
    cat1: v.union(v.string(), v.null()),
    categorizationSource: v.union(
      v.literal("rule"),
      v.literal("unverified_rule"),
      v.literal("llm"),
      v.literal("manual"),
      v.null()
    ),
    ruleId: v.optional(v.id("rules")),
  },
  handler: async (ctx, { id, cat3, cat2, cat1, categorizationSource, ruleId }) => {
    await ctx.db.patch(id, { cat3, cat2, cat1, categorizationSource, ruleId });
  },
});

// Update grouping for a transaction
export const updateGroup = mutation({
  args: {
    id: v.id("transactions"),
    groupId: v.union(v.string(), v.null()),
    groupLabel: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { id, groupId, groupLabel }) => {
    await ctx.db.patch(id, { groupId, groupLabel });
  },
});

// Batch-insert new transactions from a file import (skips existing by originalId)
export const batchUpsert = mutation({
  args: {
    transactions: v.array(v.object({
      originalId: v.string(),
      period: v.string(),
      bankAccountNumber: v.optional(v.string()),
      datePosted: v.string(),
      dateExecuted: v.string(),
      type: v.string(),
      cardholderName: v.string(),
      accountIdentifier: v.string(),
      merchantName: v.string(),
      details: v.string(),
      amount: v.number(),
      fees: v.number(),
      importId: v.optional(v.id("imports")),
    })),
  },
  handler: async (ctx, { transactions }) => {
    let inserted = 0;
    let skipped = 0;
    for (const tx of transactions) {
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_originalId", q => q.eq("originalId", tx.originalId))
        .first();
      if (!existing) {
        await ctx.db.insert("transactions", {
          ...tx,
          cat3: null, cat2: null, cat1: null,
          categorizationSource: null,
          groupId: null, groupLabel: null,
        });
        inserted++;
      } else {
        skipped++;
      }
    }
    return { inserted, skipped };
  },
});

// Batch update categorization (for LLM results)
export const batchUpdateCategories = mutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("transactions"),
        cat3: v.union(v.string(), v.null()),
        cat2: v.union(v.string(), v.null()),
        cat1: v.union(v.string(), v.null()),
        categorizationSource: v.union(
          v.literal("rule"),
          v.literal("unverified_rule"),
          v.literal("llm"),
          v.literal("manual"),
          v.null()
        ),
        ruleId: v.optional(v.id("rules")),
      })
    ),
  },
  handler: async (ctx, { updates }) => {
    for (const { id, cat3, cat2, cat1, categorizationSource, ruleId } of updates) {
      await ctx.db.patch(id, { cat3, cat2, cat1, categorizationSource, ruleId });
    }
  },
});


export const batchDelete = mutation({
  args: { ids: v.array(v.id("transactions")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) {
      await ctx.db.delete(id);
    }
  },
});

