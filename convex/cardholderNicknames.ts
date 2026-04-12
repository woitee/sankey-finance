import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("cardholderNicknames").collect();
  },
});

export const upsert = mutation({
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

export const remove = mutation({
  args: { id: v.id("cardholderNicknames") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
