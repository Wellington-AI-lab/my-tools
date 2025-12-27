export async function kvGetJson<T>(
  kv: KVNamespace,
  key: string,
  fallback: T
): Promise<T> {
  const raw = await kv.get(key, { type: 'json' as any });
  if (raw == null) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

export async function kvPutJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  await kv.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
}


