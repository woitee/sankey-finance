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

export const listStoredStatements = query({
  args: {
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { from, to }) => {
    const imports = await ctx.db
      .query("imports")
      .withIndex("by_importedAt")
      .order("desc")
      .collect();

    const fromPeriod = from.slice(0, 7);
    const toPeriod = to.slice(0, 7);

    const withFiles = await Promise.all(
      imports
        .filter(item => item.period >= fromPeriod && item.period <= toPeriod)
        .filter(item => !!item.fileStorageId)
        .map(async item => {
          const fileUrl = item.fileStorageId
            ? await ctx.storage.getUrl(item.fileStorageId)
            : null;
          const transactions = await ctx.db
            .query("transactions")
            .withIndex("by_import", q => q.eq("importId", item._id))
            .collect();

          return {
            ...item,
            fileUrl,
            importedTransactionCount: transactions.length,
          };
        }),
    );

    return withFiles.filter(item => {
      const isPdf = item.fileContentType === "application/pdf"
        || item.filename.toLowerCase().endsWith(".pdf");
      return isPdf && !!item.fileUrl;
    });
  },
});

export const findDuplicate = query({
  args: {
    filename: v.string(),
    period: v.string(),
    accountNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("imports")
      .withIndex("by_statement_key", q =>
        q
          .eq("filename", args.filename)
          .eq("period", args.period)
          .eq("accountNumber", args.accountNumber),
      )
      .first();
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const deleteUploadedFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId);
  },
});

export const create = mutation({
  args: {
    filename: v.string(),
    parserName: v.string(),
    period: v.string(),
    accountNumber: v.string(),
    transactionCount: v.number(),
    fileStorageId: v.optional(v.id("_storage")),
    fileContentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("imports")
      .withIndex("by_statement_key", q =>
        q
          .eq("filename", args.filename)
          .eq("period", args.period)
          .eq("accountNumber", args.accountNumber),
      )
      .first();

    if (existing) {
      if (existing.fileStorageId && existing.fileStorageId !== args.fileStorageId) {
        await ctx.storage.delete(existing.fileStorageId);
      }
      await ctx.db.patch(existing._id, {
        ...args,
        importedAt: new Date().toISOString(),
      });
      return existing._id;
    }

    return await ctx.db.insert("imports", {
      ...args,
      importedAt: new Date().toISOString(),
    });
  },
});

export const refreshParsedMetadata = mutation({
  args: {
    id: v.id("imports"),
    parserName: v.string(),
    period: v.string(),
    accountNumber: v.string(),
    transactionCount: v.number(),
  },
  handler: async (ctx, { id, ...rest }) => {
    await ctx.db.patch(id, {
      ...rest,
      importedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("imports") },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get(id);
    if (existing?.fileStorageId) {
      await ctx.storage.delete(existing.fileStorageId);
    }
    await ctx.db.delete(id);
    // Transactions keep their importId (now a dangling reference) — they are
    // not deleted here. Callers can decide whether to cascade separately.
  },
});
