/**
 * Module-level auth token bridge.
 *
 * Auth providers register a getter (from a React hook); non-React code
 * (e.g. HttpProvider, LlmParser) calls getAuthToken() to retrieve it.
 */

type TokenGetter = () => Promise<string | null>;

let _getToken: TokenGetter = async () => null;

/** Called once by the active auth provider to wire up token access. */
export function registerTokenGetter(getter: TokenGetter) {
  _getToken = getter;
}

/** Returns the current session JWT, or null when auth is disabled. */
export function getAuthToken(): Promise<string | null> {
  return _getToken();
}
