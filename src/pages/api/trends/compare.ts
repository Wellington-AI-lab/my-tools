import type { APIRoute } from 'astro';
import { getEnv, requireKV, getD1 } from '@/lib/env';
import { getTrendsHistory } from '@/modules/trends/store';
import { compareTrendsWindowWithMatcher } from '@/modules/trends/compare';
import { getTrendsAliases } from '@/modules/trends/store';
import { createAliasMatcher } from '@/modules/trends/normalize';
import { assessTrendEventImpact } from '@/modules/trends/impact';

export const GET: APIRoute = async (context) => {
  try {
    const d1 = getD1(context.locals);
    if (!d1) {
      return new Response(JSON.stringify({ error: 'D1 database not available' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    const kv = requireKV(context.locals);
    const daysRaw = context.url.searchParams.get('days');
    const days = daysRaw ? Number(daysRaw) : 7;
    const windowDays = Number.isFinite(days) ? Math.max(2, Math.min(14, Math.floor(days))) : 7;

    // New signature: getTrendsHistory(d1, limit)
    const history = await getTrendsHistory(d1, windowDays);
    const userAliases = await getTrendsAliases(kv);
    const matcher = createAliasMatcher(userAliases);
    const cmp = compareTrendsWindowWithMatcher(history, windowDays, matcher);

    if (!cmp) {
      return new Response(JSON.stringify({ error: 'Not enough history yet. Run trends at least once.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    const env = getEnv(context.locals) as any;
    const withImpact = await assessTrendEventImpact({
      env: {
        LLM_BASE_URL: env.LLM_BASE_URL ?? process.env.LLM_BASE_URL,
        LLM_API_KEY: env.LLM_API_KEY ?? process.env.LLM_API_KEY,
        LLM_MODEL: env.LLM_MODEL ?? process.env.LLM_MODEL,
      },
      clusters: cmp.clusters,
    });
    cmp.clusters = withImpact;

    return new Response(JSON.stringify(cmp), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


