/**
 * Safe redirect helper: only allow same-origin relative paths.
 *
 * - Accepts paths like "/foo?bar=baz"
 * - Rejects absolute URLs like "https://evil.com"
 * - Rejects protocol-relative URLs like "//evil.com"
 */
export function safeRedirectPath(input: string | null): string {
  if (!input) return '/';
  if (input.startsWith('/') && !input.startsWith('//')) return input;
  return '/';
}


