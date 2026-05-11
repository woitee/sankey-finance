/**
 * No-auth provider — plain ConvexProvider, no login gate.
 * Active when VITE_AUTH_PROVIDER is unset or empty.
 */
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import type { ReactNode } from 'react';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

export function AppProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
