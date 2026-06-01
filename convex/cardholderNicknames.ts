import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./lib/auth";

export const list = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("cardholderNicknames").collect();
  },
});

export const upsert = authenticatedMutation({
  args: { fullName: v.string(), nickname: v.string() },
  handler: async (ctx, { fullName, nickname }) => {
    const existing = await ctx.db
      .query("cardholderNicknames")
      .withIndex("by_fullName", (q) => q.eq("fullName", fullName))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { nickname });
    } else {
      await ctx.db.insert("cardholderNicknames", { fullName, nickname });
    }
  },
});

export const remove = authenticatedMutation({
  args: { id: v.id("cardholderNicknames") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
