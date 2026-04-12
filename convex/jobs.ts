import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_type")
      .order("desc")
      .take(50);
  },
});

export const latestByType = query({
  args: { type: v.string() },
  handler: async (ctx, { type }) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_type", (q) => q.eq("type", type))
      .order("desc")
      .first();
  },
});

export const create = mutation({
  args: {
    type: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { type, metadata }) => {
    return await ctx.db.insert("jobs", {
      type,
      status: "pending",
      startedAt: null,
      completedAt: null,
      error: null,
      metadata,
    });
  },
});

export const markRunning = mutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
  },
});

export const markSuccess = mutation({
  args: { id: v.id("jobs"), metadata: v.optional(v.any()) },
  handler: async (ctx, { id, metadata }) => {
    await ctx.db.patch(id, {
      status: "success",
      completedAt: new Date().toISOString(),
      error: null,
      ...(metadata !== undefined ? { metadata } : {}),
    });
  },
});

export const markError = mutation({
  args: { id: v.id("jobs"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    await ctx.db.patch(id, {
      status: "error",
      completedAt: new Date().toISOString(),
      error,
    });
  },
});
