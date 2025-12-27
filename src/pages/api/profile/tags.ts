import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireKV } from '@/lib/env';
import { getTagRules, putTagRules, type TagRule } from '@/modules/profile/store';

// 正则验证：限制长度和禁止危险模式以防止 ReDoS
const safeRegexPattern = z.string().max(50).refine(
  (pattern) => {
    // 禁止可能导致灾难性回溯的模式
    if (/([+*])\1|\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return false;
    // 验证是否为有效正则
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid or unsafe regex pattern' }
);

const ruleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('symbol_in'),
    symbols: z.array(z.string().max(10)).max(100),
  }),
  z.object({
    type: z.literal('regex'),
    pattern: safeRegexPattern,
  }),
]);

const tagRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  rule: ruleSchema,
});

const putSchema = z.object({
  rules: z.array(tagRuleSchema),
});

export const GET: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const rules = await getTagRules(kv);
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

    // Narrow to TagRule type
    const rules = parsed.data.rules as unknown as TagRule[];
    await putTagRules(kv, rules);

    return new Response(JSON.stringify({ success: true, count: rules.length }), {
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


