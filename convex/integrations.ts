import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { encrypt, decrypt } from "./lib/crypto";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("integrations").collect();
  },
});

export const get = query({
  args: { id: v.id("integrations") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/** Create a new integration row in pending_auth state */
export const create = mutation({
  args: {
    bank: v.string(),
    label: v.string(),
  },
  handler: async (ctx, { bank, label }) => {
    return await ctx.db.insert("integrations", {
      bank,
      label,
      status: "pending_auth",
      encryptedRefreshToken: null,
      encryptedAccessToken: null,
      accessTokenExpiry: null,
      linkedAccountNumbers: [],
      lastSyncedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
  },
});

export const rename = mutation({
  args: { id: v.id("integrations"), label: v.string() },
  handler: async (ctx, { id, label }) => {
    await ctx.db.patch(id, { label });
  },
});

export const remove = mutation({
  args: { id: v.id("integrations") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const markError = mutation({
  args: { id: v.id("integrations"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    await ctx.db.patch(id, { status: "error", lastError: error });
  },
});

/** Store encrypted tokens after successful OAuth — called from HTTP action */
export const storeTokens = mutation({
  args: {
    id: v.id("integrations"),
    encryptedRefreshToken: v.string(),
    encryptedAccessToken: v.string(),
    accessTokenExpiry: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "active",
      encryptedRefreshToken: args.encryptedRefreshToken,
      encryptedAccessToken: args.encryptedAccessToken,
      accessTokenExpiry: args.accessTokenExpiry,
      lastError: null,
    });
  },
});

export const markSynced = mutation({
  args: {
    id: v.id("integrations"),
    linkedAccountNumbers: v.array(v.string()),
    encryptedAccessToken: v.string(),
    accessTokenExpiry: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "active",
      linkedAccountNumbers: args.linkedAccountNumbers,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      encryptedAccessToken: args.encryptedAccessToken,
      accessTokenExpiry: args.accessTokenExpiry,
    });
  },
});

/**
 * Decrypt and return tokens for use inside an action.
 * Never exposed to the browser — only callable from server-side actions.
 */
export const decryptTokens = action({
  args: { id: v.id("integrations") },
  handler: async (ctx, { id }): Promise<{
    refreshToken: string;
    accessToken: string | null;
    accessTokenExpiry: string | null;
  }> => {
    const integration = await ctx.runQuery(api.integrations.get, { id });
    if (!integration) throw new Error("Integration not found");
    if (!integration.encryptedRefreshToken) throw new Error("No refresh token stored");

    const encKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!encKey) throw new Error("TOKEN_ENCRYPTION_KEY not set");

    const refreshToken = await decrypt(integration.encryptedRefreshToken, encKey);
    const accessToken = integration.encryptedAccessToken
      ? await decrypt(integration.encryptedAccessToken, encKey)
      : null;

    return {
      refreshToken,
      accessToken,
      accessTokenExpiry: integration.accessTokenExpiry,
    };
  },
});
