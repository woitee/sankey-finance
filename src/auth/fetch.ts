import { getAuthToken } from './token';

/**
 * Drop-in replacement for fetch() that attaches the auth token
 * as a Bearer header when authentication is active.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
