import { customQuery, customMutation, customAction } from "convex-helpers/server/customFunctions";
import { query, mutation, action } from "../_generated/server";

const authEnabled = !!process.env.AUTH_PROVIDER;

async function requireIdentity(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (authEnabled && !identity) throw new Error("Not authenticated");
  return identity;
}

export const authenticatedQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return { ctx: { ...ctx, identity }, args: {} };
  },
});

export const authenticatedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return { ctx: { ...ctx, identity }, args: {} };
  },
});

export const authenticatedAction = customAction(action, {
  args: {},
  input: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return { ctx: { ...ctx, identity }, args: {} };
  },
});
