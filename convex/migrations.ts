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
    const { _id, _creationTime, type, cat1, cat2, cat3, ...rest } = doc as any;
    if (cat1 !== undefined) {
      await ctx.db.replace(_id, {
        ...rest,
        transactionType: type,
        type: cat1,
        category: cat2,
        subcategory: cat3,
      });
    }
  },
});

export const renameRuleFields = migration({
  table: "rules",
  migrateOne: async (ctx, doc) => {
    const { _id, _creationTime, cat1, cat2, cat3, ...rest } = doc as any;
    if (cat1 !== undefined) {
      await ctx.db.replace(_id, {
        ...rest,
        type: cat1,
        category: cat2,
        subcategory: cat3,
      });
    }
  },
});

export default internalMutation(async (ctx) => {
  await startMigrationsSerially(ctx, [
    internal.migrations.renameTransactionFields,
    internal.migrations.renameRuleFields,
  ]);
});
