/**
 * Currency formatting.
 * Set VITE_CURRENCY in .env to override (e.g. VITE_CURRENCY=EUR).
 * Defaults to CZK.
 */
const CURRENCY = (import.meta.env.VITE_CURRENCY as string | undefined) ?? 'CZK';

export function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export { CURRENCY };
