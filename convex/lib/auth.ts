import { customQuery, customMutation, customAction } from "convex-helpers/server/customFunctions";
import { query, mutation, action } from "../_generated/server";

const authProvider = process.env.AUTH_PROVIDER;

if (authProvider === "clerk" && !process.env.CLERK_ISSUER_URL) {
  throw new Error(
    "AUTH_PROVIDER is set to 'clerk' but CLERK_ISSUER_URL is missing. " +
    "Add it to .env.local and run: npm run env:push",
  );
}

if (authProvider && authProvider !== "clerk") {
  throw new Error(
    `Unknown AUTH_PROVIDER: "${authProvider}". Supported: clerk`,
  );
}

const authEnabled = !!authProvider;

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
