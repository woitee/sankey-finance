import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getProvider } from "./banks/registry";
import { encrypt } from "./lib/crypto";

/**
 * Sync transactions for a single integration.
 * - Refreshes access token if expired
 * - Lists all bank accounts under the integration
 * - Fetches transactions since last sync (or last 90 days on first run)
 * - Upserts accounts + transactions into the DB
 * - Updates the integration row with new token + sync time
 */
export const syncIntegration = action({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    const encKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!encKey) throw new Error("TOKEN_ENCRYPTION_KEY not set");

    const integration = await ctx.runQuery(api.integrations.get, { id: integrationId });
    if (!integration) throw new Error("Integration not found");
    if (integration.status === "pending_auth") throw new Error("Integration not yet authorised");

    const jobId = await ctx.runMutation(api.jobs.create, {
      type: "bank_sync",
      metadata: { integrationId, bank: integration.bank, label: integration.label },
    });
    await ctx.runMutation(api.jobs.markRunning, { id: jobId });

    try {
      const provider = getProvider(integration.bank);

      // ── 1. Get a valid access token ──────────────────────────────────────────
      const { refreshToken, accessToken, accessTokenExpiry } =
        await ctx.runAction(api.integrations.decryptTokens, { id: integrationId });

      const now = new Date();
      const expiry = accessTokenExpiry ? new Date(accessTokenExpiry) : new Date(0);
      let currentAccessToken = accessToken;
      let newTokenSet = null;

      if (!currentAccessToken || expiry <= now) {
        newTokenSet = await provider.refreshAccessToken(refreshToken);
        currentAccessToken = newTokenSet.accessToken;
      }

      const validAccessToken = currentAccessToken!;

      // ── 2. List accounts ─────────────────────────────────────────────────────
      const bankAccounts = await provider.listAccounts(validAccessToken);

      for (const account of bankAccounts) {
        await ctx.runMutation(api.accounts.ensureExists, {
          accountNumber: account.accountNumber,
          institution: account.institution,
        });
      }

      // ── 3. Fetch transactions for each account ───────────────────────────────
      const fromDate = integration.lastSyncedAt
        ? integration.lastSyncedAt.slice(0, 10)
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const toDate = now.toISOString().slice(0, 10);

      let totalUpserted = 0;
      for (const account of bankAccounts) {
        const txs = await provider.fetchTransactions(
          validAccessToken,
          account.accountNumber,
          fromDate,
          toDate,
        );

        for (const tx of txs) {
          const period = tx.datePosted.slice(0, 7); // "YYYY-MM"
          await ctx.runMutation(api.transactions.upsert, {
            originalId: `${integration.bank}:${account.accountNumber}:${tx.externalId}`,
            period,
            bankAccountNumber: account.accountNumber,
            datePosted: tx.datePosted,
            dateExecuted: tx.dateExecuted,
            type: tx.type,
            cardholderName: tx.cardholderName,
            accountIdentifier: tx.accountIdentifier,
            merchantName: tx.merchantName,
            details: tx.details,
            amount: tx.amount,
            fees: tx.fees,
            cat3: null,
            cat2: null,
            cat1: null,
            categorizationSource: null,
            groupId: null,
            groupLabel: null,
          });
          totalUpserted++;
        }
      }

      // ── 4. Persist refreshed tokens ──────────────────────────────────────────
      const finalTokenSet = newTokenSet ?? {
        accessToken: validAccessToken,
        refreshToken,
        accessTokenExpiry: accessTokenExpiry!,
      };

      await ctx.runMutation(api.integrations.markSynced, {
        id: integrationId,
        linkedAccountNumbers: bankAccounts.map(a => a.accountNumber),
        encryptedAccessToken: await encrypt(finalTokenSet.accessToken, encKey),
        accessTokenExpiry: finalTokenSet.accessTokenExpiry,
      });

      await ctx.runMutation(api.jobs.markSuccess, {
        id: jobId,
        metadata: { transactionsUpserted: totalUpserted },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(api.integrations.markError, { id: integrationId, error: msg });
      await ctx.runMutation(api.jobs.markError, { id: jobId, error: msg });
      throw err;
    }
  },
});

/** Sync all active integrations — called by cron */
export const syncAll = action({
  args: {},
  handler: async (ctx) => {
    const integrations = await ctx.runQuery(api.integrations.list);
    const active = integrations.filter(i => i.status === "active");
    for (const integration of active) {
      await ctx.runAction(api.bankSync.syncIntegration, {
        integrationId: integration._id,
      });
    }
  },
});
