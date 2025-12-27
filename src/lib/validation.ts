/**
 * Shared lightweight input validation helpers.
 */

/**
 * Stock symbol validation (upper-case, dot/hyphen/numbers allowed for tickers).
 *
 * This is not meant to be a perfect market symbol validator; it is a safety
 * guardrail to prevent abuse and unexpected DB/cache key patterns.
 *
 * Examples: AAPL, GOOGL, BRK-B, BRK.B, META
 */
export function normalizeAndValidateSymbol(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const symbol = input.toUpperCase().trim();
  // 必须以字母开头，支持字母、数字、连字符、点（如 BRK-B, BRK.B）
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol)) return null;
  return symbol;
}


