import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./lib/auth";

export const list = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("statements")
      .withIndex("by_period")
      .collect();
  },
});

export const byPeriod = authenticatedQuery({
  args: { period: v.string() },
  handler: async (ctx, { period }) => {
    return await ctx.db
      .query("statements")
      .withIndex("by_period", (q) => q.eq("period", period))
      .first();
  },
});

export const upsert = authenticatedMutation({
  args: {
    period: v.string(),
    accountNumber: v.string(),
    openingBalance: v.number(),
    closingBalance: v.number(),
    totalIncome: v.number(),
    totalDebits: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("statements")
      .withIndex("by_period", (q) => q.eq("period", args.period))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return await ctx.db.insert("statements", args);
    }
  },
});
