/**
 * Server-side token verifier for the Vite dev server middleware.
 *
 * Returns null when auth is disabled, or a verify function that throws
 * on invalid/missing tokens.
 *
 * To add a new provider: add a case that returns a verify function.
 * The function receives the raw Bearer token and should throw on failure.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

type Verifier = (token: string) => Promise<void>;

/**
 * Build a token verifier from env vars.
 * Returns null when auth is not configured (requests pass through).
 */
export async function createVerifier(
  env: Record<string, string>,
): Promise<Verifier | null> {
  const provider = env.VITE_AUTH_PROVIDER;

  if (provider === 'clerk') {
    const issuer = env.AUTH_ISSUER_URL;
    if (!issuer) {
      console.warn(
        '[vite-auth] VITE_AUTH_PROVIDER=clerk but AUTH_ISSUER_URL is not set. ' +
        'Token verification disabled — all requests will be allowed.',
      );
      return null;
    }

    // Use jose for standard JWKS verification — works with any OIDC provider
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwksUrl = new URL('/.well-known/jwks.json', issuer);
    const JWKS = createRemoteJWKSet(jwksUrl);

    return async (token: string) => {
      await jwtVerify(token, JWKS, { issuer });
    };
  }

  // Add future providers here:
  // if (provider === 'auth0') { ... }

  if (provider) {
    console.warn(
      `[vite-auth] Unknown auth provider "${provider}". ` +
      'Token verification disabled.',
    );
  }

  return null;
}

/**
 * Express-style middleware that rejects unauthenticated requests
 * when a verifier is active. Pass null to skip auth entirely.
 */
export function authMiddleware(verifier: Verifier | null) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (!verifier) return next();

    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid Authorization header' }));
      return;
    }

    try {
      await verifier(auth.slice(7));
      next();
    } catch (err: any) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid token' }));
    }
  };
}
