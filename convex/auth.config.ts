/**
 * Convex auth configuration.
 *
 * When CLERK_ISSUER_URL is set (add to .env.local, then `npm run env:push`),
 * Convex will validate Clerk JWTs attached to client requests.
 *
 * When the variable is absent, the providers array is empty and Convex
 * runs without authentication — identical to not having this file.
 */

const providers: { domain: string; applicationID: string }[] = [];

const clerkIssuer = process.env.CLERK_ISSUER_URL;
if (clerkIssuer) {
  providers.push({
    domain: clerkIssuer,
    applicationID: "convex",
  });
}

export default { providers };
