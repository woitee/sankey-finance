/**
 * Migration script: import existing JSON data into Convex.
 *
 * Usage:
 *   npx tsx scripts/migrate_to_convex.ts
 *
 * Requires VITE_CONVEX_URL set in .env.local (done by `npx convex dev --once`).
 * Re-running is safe — all operations are upserts.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("VITE_CONVEX_URL not set in .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(url);

async function migrateStatements() {
  const parsedDir = path.join(process.cwd(), "data", "parsed");
  const files = fs.readdirSync(parsedDir).filter((f) => f.endsWith(".json"));

  console.log(`Found ${files.length} statement files.`);

  for (const file of files.sort()) {
    const period = file.replace(".json", "");
    const raw = fs.readFileSync(path.join(parsedDir, file), "utf-8");
    const statement = JSON.parse(raw);

    // Ensure account exists
    await client.mutation(api.accounts.ensureExists, {
      accountNumber: statement.accountNumber,
      institution: statement.institution ?? undefined,
    });

    // Upsert statement summary
    await client.mutation(api.statements.upsert, {
      period: statement.period,
      accountNumber: statement.accountNumber,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      totalIncome: statement.totalIncome,
      totalDebits: statement.totalDebits,
    });

    // Upsert each transaction
    let count = 0;
    for (const tx of statement.transactions) {
      await client.mutation(api.transactions.upsert, {
        originalId: tx.id,
        period: statement.period,
        bankAccountNumber: statement.accountNumber,
        datePosted: tx.datePosted,
        dateExecuted: tx.dateExecuted,
        type: tx.type,
        cardholderName: tx.cardholderName,
        accountIdentifier: tx.accountIdentifier,
        merchantName: tx.merchantName,
        details: tx.details,
        amount: tx.amount,
        fees: tx.fees,
        cat3: tx.cat3 ?? null,
        cat2: tx.cat2 ?? null,
        cat1: tx.cat1 ?? null,
        categorizationSource: tx.categorizationSource ?? null,
        groupId: tx.groupId ?? null,
        groupLabel: tx.groupLabel ?? null,
      });
      count++;
    }

    console.log(`  ${period} (${statement.accountNumber}): ${count} transactions`);
  }
}

async function migrateCorrections() {
  const correctionsPath = path.join(process.cwd(), "data", "corrections.json");
  if (!fs.existsSync(correctionsPath)) {
    console.log("No corrections.json found, skipping.");
    return;
  }

  const raw = fs.readFileSync(correctionsPath, "utf-8");
  const db = JSON.parse(raw);
  const corrections = db.corrections ?? [];

  const normalized = corrections.map((c: any) => ({
    merchantPattern: c.merchantPattern,
    cat3: c.cat3,
    cat2: c.cat2 ?? null,
    cat1: c.cat1 ?? null,
    note: c.note ?? null,
    createdAt: c.createdAt,
  }));

  await client.mutation(api.corrections.bulkImport, { corrections: normalized });
  console.log(`Corrections: ${normalized.length} entries imported.`);
}

async function main() {
  console.log("Starting migration to Convex...\n");
  await migrateStatements();
  await migrateCorrections();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
