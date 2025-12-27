import { getKV } from '@/lib/env';
import { getUtcDateString } from '@/lib/request';

type LimitResult = { allowed: boolean; remaining: number; count: number; limit: number };

export async function bumpDailyCounter(opts: {
  locals: App.Locals;
  keyPrefix: string;
  id: string;
  limit: number;
  ttlSeconds?: number;
}): Promise<LimitResult> {
  const { locals, keyPrefix, id, limit } = opts;
  const ttlSeconds = opts.ttlSeconds ?? 60 * 60 * 24;
  const kv = getKV(locals);
  const day = getUtcDateString();
  const key = `${keyPrefix}:${day}:${id}`;

  if (!kv) {
    // Dev/no-KV: allow, but still return a stable shape.
    return { allowed: true, remaining: limit, count: 0, limit };
  }

  const currentRaw = await kv.get(key);
  const current = currentRaw ? Number(currentRaw) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  await kv.put(key, String(next), { expirationTtl: ttlSeconds });

  const allowed = next <= limit;
  return { allowed, remaining: Math.max(0, limit - next), count: next, limit };
}

export async function clearDailyCounter(opts: {
  locals: App.Locals;
  keyPrefix: string;
  id: string;
}): Promise<void> {
  const { locals, keyPrefix, id } = opts;
  const kv = getKV(locals);
  if (!kv) return;
  const key = `${keyPrefix}:${getUtcDateString()}:${id}`;
  await kv.delete(key);
}


