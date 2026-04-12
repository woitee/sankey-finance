import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_accountNumber")
      .collect();
  },
});

/** Create account if it doesn't exist yet. Returns the accountNumber. */
export const ensureExists = mutation({
  args: {
    accountNumber: v.string(),
    institution: v.optional(v.string()),
  },
  handler: async (ctx, { accountNumber, institution }) => {
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_accountNumber", (q) => q.eq("accountNumber", accountNumber))
      .first();
    if (existing) return accountNumber;
    await ctx.db.insert("accounts", {
      accountNumber,
      name: accountNumber,   // default name = the raw account number
      institution,
      createdAt: new Date().toISOString(),
    });
    return accountNumber;
  },
});

export const rename = mutation({
  args: {
    accountNumber: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { accountNumber, name }) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_accountNumber", (q) => q.eq("accountNumber", accountNumber))
      .first();
    if (!account) throw new Error(`Account ${accountNumber} not found`);
    await ctx.db.patch(account._id, { name });
  },
});
