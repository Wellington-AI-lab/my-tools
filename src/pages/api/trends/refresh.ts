/**
 * 定时刷新端点
 * 供 Cloudflare Workers Cron 或外部 cron 服务调用
 */

import type { APIRoute } from 'astro';
import { getEnv } from '@/lib/env';

const SCAN_API_URL = "https://my-tools-bim.pages.dev/api/trends/scan";
const AUTH_HEADER = "X-Cron-Auth";

export const GET: APIRoute = async (context) => {
  const { request } = context;

  // 简单的认证检查
  const authHeader = request.headers.get(AUTH_HEADER);
  const env = getEnv(context.locals) as any;
  const cronSecret = env.CRON_SECRET;

  if (authHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    console.log(`[cron] Starting trends refresh at ${new Date().toISOString()}`);

    // 调用 scan API 强制刷新
    const resp = await fetch(`${SCAN_API_URL}?force=true`, {
      method: "GET",
      headers: { "User-Agent": "Cron-Job" },
    });

    if (!resp.ok) {
      throw new Error(`Scan API failed: ${resp.status}`);
    }

    const data = await resp.json();

    return Response.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      newsCount: data.newsCount || 0,
      topTags: (data.topTags || []).slice(0, 10).map((t: any) => ({ tag: t.tag, count: t.count })),
    });

  } catch (error: any) {
    console.error("[cron] Refresh error:", error);
    return Response.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
};

/**
 * Cloudflare Workers Cron 配置说明:
 *
 * 方案1 - 外部 cron 服务 (推荐):
 * 1. 访问 https://cron-job.org 注册免费账号
 * 2. 创建 cron job: GET https://my-tools-bim.pages.dev/api/trends/refresh
 * 3. 添加 Header: X-Cron-Auth = your-cron-secret
 * 4. 设置执行频率: 每2小时 (0 *\/2 * * *)
 */
