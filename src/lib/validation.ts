/**
 * Shared lightweight input validation helpers.
 */

/**
 * Stock symbol validation (upper-case, dot allowed for some tickers).
 *
 * This is not meant to be a perfect market symbol validator; it is a safety
 * guardrail to prevent abuse and unexpected DB/cache key patterns.
 */
export function normalizeAndValidateSymbol(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const symbol = input.toUpperCase().trim();
  if (!/^[A-Z.]{1,10}$/.test(symbol)) return null;
  return symbol;
}


