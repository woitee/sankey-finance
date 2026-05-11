import type { ReactNode } from 'react';

/**
 * Auth provider interface — each implementation wraps the app
 * in its own provider hierarchy (auth + Convex).
 *
 * To add a new provider:
 *  1. Create src/auth/<name>.tsx exporting { AppProvider }
 *  2. Add a case in src/auth/index.ts
 *  3. Add env vars to .env.example
 */
export interface AuthModule {
  AppProvider: React.ComponentType<{ children: ReactNode }>;
}
