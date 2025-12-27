import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireKV } from '@/lib/env';
import { normalizeAndValidateSymbol } from '@/lib/validation';
import {
  applyRuleTags,
  getTagRules,
  getWatchlist,
  mergeTags,
  putWatchlist,
  type WatchlistItem,
} from '@/modules/profile/store';

const putSchema = z.object({
  upsert: z
    .array(
      z.object({
        symbol: z.string(),
        tags: z.array(z.string()).optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
  remove: z.array(z.string()).optional(),
});

export const GET: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const [items, rules] = await Promise.all([getWatchlist(kv), getTagRules(kv)]);

    const enriched = items.map((it) => {
      const autoTags = applyRuleTags(it.symbol, rules);
      return {
        ...it,
        autoTags,
        tags: mergeTags(it.tags, autoTags),
      };
    });

    return new Response(JSON.stringify({ items: enriched, rules }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const parsed = putSchema.safeParse(await context.request.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const current = await getWatchlist(kv);
    const map = new Map<string, WatchlistItem>(current.map((i) => [i.symbol, i]));
    const now = new Date().toISOString();

    const upsert = parsed.data.upsert ?? [];
    for (const u of upsert) {
      const symbol = normalizeAndValidateSymbol(u.symbol);
      if (!symbol) continue;
      const existing = map.get(symbol);
      const tags = Array.isArray(u.tags) ? u.tags.filter((t) => typeof t === 'string') : existing?.tags ?? [];
      const note = typeof u.note === 'string' ? u.note : existing?.note;
      if (existing) {
        map.set(symbol, { ...existing, tags, note, updatedAt: now });
      } else {
        map.set(symbol, { symbol, tags, note, createdAt: now, updatedAt: now });
      }
    }

    const remove = parsed.data.remove ?? [];
    for (const r of remove) {
      const symbol = normalizeAndValidateSymbol(r);
      if (!symbol) continue;
      map.delete(symbol);
    }

    const next = Array.from(map.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
    await putWatchlist(kv, next);

    return new Response(JSON.stringify({ success: true, count: next.length }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


