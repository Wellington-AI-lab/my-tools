import type { APIRoute } from 'astro';
import { requireKV } from '@/lib/env';
import { getLatestNewsReport } from '@/modules/news/store';

// 获取最新的信息流报告
export const GET: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const report = await getLatestNewsReport(kv);

    if (!report) {
      return new Response(JSON.stringify({
        error: '暂无数据，请先手动运行一次信息流抓取。',
        empty: true,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(report), {
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
