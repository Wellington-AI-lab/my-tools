import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireKV } from '@/lib/env';
import { getTrendsAliases, putTrendsAliases } from '@/modules/trends/store';

const ruleSchema = z.object({
  canonical: z.string().min(1).max(64),
  variants: z.array(z.string().min(1).max(64)).max(50),
});

const putSchema = z.object({
  rules: z.array(ruleSchema).max(300),
});

export const GET: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const rules = await getTrendsAliases(kv);
    return new Response(JSON.stringify({ rules }), {
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

// Replace rules (simple & safe for personal tool)
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
    await putTrendsAliases(kv, parsed.data.rules);
    return new Response(JSON.stringify({ success: true, count: parsed.data.rules.length }), {
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


