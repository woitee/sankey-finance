import type { BankProvider } from "./types";

/**
 * Bank provider registry.
 * To add a new bank:
 *   1. Create convex/banks/<bankid>.ts implementing BankProvider
 *   2. Import and register it here
 */
const REGISTRY: Record<string, BankProvider> = {
  // e.g. fio: new FioProvider(),
};

export function getProvider(bank: string): BankProvider {
  const provider = REGISTRY[bank];
  if (!provider) throw new Error(`No provider registered for bank: "${bank}"`);
  return provider;
}

export const SUPPORTED_BANKS: { id: string; name: string }[] = Object.entries(REGISTRY).map(
  ([id, p]) => ({ id, name: p.bank }),
);
