import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("imports")
      .withIndex("by_importedAt")
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    filename: v.string(),
    parserName: v.string(),
    period: v.string(),
    accountNumber: v.string(),
    transactionCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("imports", {
      ...args,
      importedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("imports") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    // Transactions keep their importId (now a dangling reference) — they are
    // not deleted here. Callers can decide whether to cascade separately.
  },
});
