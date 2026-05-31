import {
  makeMigration,
  startMigrationsSerially,
} from "convex-helpers/server/migrations";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const migration = makeMigration(internalMutation, {
  migrationTable: "migrations",
});

export const renameTransactionFields = migration({
  table: "transactions",
  migrateOne: async (ctx, doc) => {
    const d = doc as any;
    // Already migrated: has transactionType field
    if (d.transactionType !== undefined) return;
    await ctx.db.patch(doc._id, {
      transactionType: d.type ?? "other",
      type: d.cat1 ?? null,
      category: d.cat2 ?? null,
      subcategory: d.cat3 ?? null,
    } as any);
  },
});

export const renameRuleFields = migration({
  table: "rules",
  migrateOne: async (ctx, doc) => {
    const d = doc as any;
    // Already migrated: has subcategory field
    if (d.subcategory !== undefined) return;
    await ctx.db.patch(doc._id, {
      type: d.cat1 ?? null,
      category: d.cat2 ?? null,
      subcategory: d.cat3 ?? "",
    } as any);
  },
});

export default internalMutation(async (ctx) => {
  await startMigrationsSerially(ctx, [
    internal.migrations.renameTransactionFields,
    internal.migrations.renameRuleFields,
  ]);
});
