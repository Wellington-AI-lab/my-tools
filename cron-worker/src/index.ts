/**
 * 社会热点扫描定时任务
 * 每4小时自动刷新一次，调用 trends/scan API 生成新的热点报告
 */

type Env = {
  KV: KVNamespace;
  // D1 绑定（虽然 cron worker 不直接使用，但保持配置一致）
  TRENDS_DB?: D1Database;
  // API 基础 URL（可通过 wrangler.toml 或 Dashboard 配置）
  API_BASE_URL?: string;
};

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        console.log('[trends-cron] Starting scheduled scan...');
        const startTime = Date.now();

        try {
          // 调用 scan API（使用 force=true 确保 AI 处理）
          // API_BASE_URL 通过环境变量配置，或使用默认值
          const apiBaseUrl = env.API_BASE_URL ?? 'https://my-tools-bim.pages.dev';
          const scanUrl = `${apiBaseUrl}/api/trends/scan?force=true`;

          const response = await fetch(scanUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'my-tools-trends-cron/1.0',
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[trends-cron] Scan failed: ${response.status} ${errorText}`);
            return;
          }

          const data = await response.json();
          const elapsed = Date.now() - startTime;

          console.log(`[trends-cron] Scan completed successfully`);
          console.log(`[trends-cron] - News count: ${data.newsCount || 0}`);
          console.log(`[trends-cron] - AI calls: ${data.aiApiCalls || 0}`);
          console.log(`[trends-cron] - Quota exceeded: ${data.aiQuotaExceeded || false}`);
          console.log(`[trends-cron] - Elapsed: ${elapsed}ms`);
        } catch (error: any) {
          console.error(`[trends-cron] Error: ${error.message || String(error)}`);
        }
      })()
    );
  },
};


