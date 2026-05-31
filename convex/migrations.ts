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
    const { _id, _creationTime, type: bankType, cat1, cat2, cat3, ...rest } = d;
    await ctx.db.replace(_id, {
      ...rest,
      transactionType: bankType ?? "other",
      type: cat1 ?? null,
      category: cat2 ?? null,
      subcategory: cat3 ?? null,
    });
  },
});

export const renameRuleFields = migration({
  table: "rules",
  migrateOne: async (ctx, doc) => {
    const d = doc as any;
    // Already migrated: has subcategory field
    if (d.subcategory !== undefined) return;
    const { _id, _creationTime, cat1, cat2, cat3, ...rest } = d;
    await ctx.db.replace(_id, {
      ...rest,
      type: cat1 ?? null,
      category: cat2 ?? null,
      subcategory: cat3 ?? "",
    });
  },
});

export default internalMutation(async (ctx) => {
  await startMigrationsSerially(ctx, [
    internal.migrations.renameTransactionFields,
    internal.migrations.renameRuleFields,
  ]);
});
