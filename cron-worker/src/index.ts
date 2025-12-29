/**
 * 社会热点扫描定时任务
 * 每4小时自动刷新一次，调用 trends/scan API 生成新的热点报告
 *
 * 功能：
 * - 定时任务 (scheduled): 每4小时自动扫描
 * - 健康检查 (/health): 服务状态查询
 * - 手动触发 (/trigger): 支持手动触发扫描（用于测试）
 */

type Env = {
  KV: KVNamespace;
  // D1 绑定（虽然 cron worker 不直接使用，但保持配置一致）
  TRENDS_DB?: D1Database;
  // API 基础 URL（可通过 wrangler.toml 或 Dashboard 配置）
  API_BASE_URL?: string;
  // 认证密钥（用于手动触发）
  CRON_SECRET?: string;
};

const DEFAULT_API_BASE_URL = 'https://my-tools-bim.pages.dev';

/**
 * 执行趋势扫描
 */
async function runScan(env: Env, useAI = true): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const apiBaseUrl = env.API_BASE_URL ?? DEFAULT_API_BASE_URL;
    const aiParam = useAI ? '&ai=true' : '';
    const scanUrl = `${apiBaseUrl}/api/trends/scan?force=true${aiParam}`;

    const response = await fetch(scanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'my-tools-trends-cron/1.0',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * 定时任务处理器
 */
async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const startTime = Date.now();
  console.log('[trends-cron] Starting scheduled scan...');

  const result = await runScan(env, true);

  if (result.success && result.data) {
    const elapsed = Date.now() - startTime;
    console.log('[trends-cron] Scan completed successfully');
    console.log(`[trends-cron] - News count: ${result.data.newsCount || 0}`);
    console.log(`[trends-cron] - AI calls: ${result.data.aiApiCalls || 0}`);
    console.log(`[trends-cron] - Quota exceeded: ${result.data.aiQuotaExceeded || false}`);
    console.log(`[trends-cron] - Elapsed: ${elapsed}ms`);
  } else {
    console.error(`[trends-cron] Scan failed: ${result.error}`);
  }
}

/**
 * HTTP 请求处理器（用于健康检查和手动触发）
 */
async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 健康检查端点
  if (path === '/health') {
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'my-tools-trends-cron',
      mode: 'AI tagging enabled',
      schedule: 'Every 4 hours',
    });
  }

  // 手动触发端点
  if (path === '/trigger' && request.method === 'POST') {
    // 可选：验证 CRON_SECRET
    // const authHeader = request.headers.get('X-Cron-Auth');
    // if (env.CRON_SECRET && authHeader !== env.CRON_SECRET) {
    //   return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const useAI = url.searchParams.get('ai') !== 'false'; // 默认启用 AI
    console.log(`[trends-cron] Manual trigger (AI: ${useAI})`);

    const result = await runScan(env, useAI);

    if (result.success) {
      return Response.json({
        success: true,
        aiMode: useAI,
        data: result.data,
      });
    }

    return Response.json({
      success: false,
      error: result.error,
    }, { status: 500 });
  }

  // 默认响应
  return Response.json({
    service: 'my-tools-trends-cron',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      trigger: 'POST /trigger[?ai=false]',
    },
    schedule: 'Every 4 hours (UTC: 0, 4, 8, 12, 16, 20)',
  }, { status: 200 });
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleFetch(request, env);
  },
};
