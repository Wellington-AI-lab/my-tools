/**
 * 社会热点扫描定时任务
 * 每4小时自动刷新一次，调用 trends/scan API 生成新的热点报告
 */

type Env = {
  KV: KVNamespace;
  // D1 绑定（虽然 cron worker 不直接使用，但保持配置一致）
  TRENDS_DB?: D1Database;
};

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        console.log('[trends-cron] Starting scheduled scan...');
        const startTime = Date.now();

        try {
          // 调用 scan API（使用 force=true 确保 AI 处理）
          // 注意：需要在 Worker 环境中部署，不能直接 fetch 本地路径
          // 这里我们使用环境变量或默认的部署 URL
          const apiBaseUrl = 'https://my-tools-bim.pages.dev'; // 替换为你的实际域名
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


