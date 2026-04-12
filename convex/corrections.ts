import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("corrections").collect();
  },
});

// Add or replace a correction (match by normalized merchantPattern)
export const upsert = mutation({
  args: {
    merchantPattern: v.string(),
    cat3: v.string(),
    cat2: v.union(v.string(), v.null()),
    cat1: v.union(v.string(), v.null()),
    note: v.union(v.string(), v.null()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("corrections")
      .withIndex("by_merchantPattern", (q) =>
        q.eq("merchantPattern", args.merchantPattern)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return await ctx.db.insert("corrections", args);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("corrections") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// Bulk import (for migration)
export const bulkImport = mutation({
  args: {
    corrections: v.array(
      v.object({
        merchantPattern: v.string(),
        cat3: v.string(),
        cat2: v.union(v.string(), v.null()),
        cat1: v.union(v.string(), v.null()),
        note: v.union(v.string(), v.null()),
        createdAt: v.string(),
      })
    ),
  },
  handler: async (ctx, { corrections }) => {
    for (const entry of corrections) {
      const existing = await ctx.db
        .query("corrections")
        .withIndex("by_merchantPattern", (q) =>
          q.eq("merchantPattern", entry.merchantPattern)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, entry);
      } else {
        await ctx.db.insert("corrections", entry);
      }
    }
  },
});
