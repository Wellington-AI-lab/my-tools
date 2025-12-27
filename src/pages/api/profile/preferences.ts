import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireKV } from '@/lib/env';
import { getPreferences, putPreferences, type Preferences } from '@/modules/profile/store';

const putSchema = z.object({
  defaultBacktestYears: z.number().int().min(1).max(20).optional(),
});

export const GET: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const prefs = await getPreferences(kv);
    return new Response(JSON.stringify({ preferences: prefs }), {
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

    const next: Preferences = parsed.data;
    await putPreferences(kv, next);

    return new Response(JSON.stringify({ success: true }), {
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


