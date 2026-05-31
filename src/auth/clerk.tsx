/**
 * Clerk auth provider — wraps the app in ClerkProvider + ConvexProviderWithClerk.
 * Shows a sign-in screen when not authenticated.
 *
 * Required env vars:
 *   VITE_CLERK_PUBLISHABLE_KEY — Clerk publishable key (pk_...)
 *   VITE_CONVEX_URL            — Convex deployment URL
 *
 * Convex env var (set via `npx convex env set`):
 *   CLERK_ISSUER_URL — e.g. https://your-app.clerk.accounts.dev
 */
import { ClerkProvider, SignIn, useAuth, useUser } from '@clerk/clerk-react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import type { ReactNode } from 'react';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!publishableKey) {
  console.error(
    '[auth/clerk] VITE_CLERK_PUBLISHABLE_KEY is not set. ' +
    'Authentication will not work.',
  );
}

/** Shows a centered sign-in screen when the user is not authenticated. */
function AuthGate({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#11111b', color: '#64748b', fontSize: 14,
      }}>
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#11111b',
      }}>
        <SignIn />
      </div>
    );
  }

  return <>{children}</>;
}

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={{ baseTheme: undefined }}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <AuthGate>{children}</AuthGate>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
