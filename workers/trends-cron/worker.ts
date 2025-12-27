// Trend Radar Cron Worker - 定时刷新趋势雷达数据
// 每 4 小时执行一次，使用 AI 打标签

export interface Env {
  CRON_SECRET?: string;
}

const SCAN_API_URL = "https://my-tools-bim.pages.dev/api/trends/scan";

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    const timestamp = new Date().toISOString();
    console.log(`[trends-cron] Scheduled trigger at ${timestamp}`);

    try {
      // 直接调用 scan API，启用 AI 模式
      const response = await fetch(`${SCAN_API_URL}?force=true&ai=true`, {
        method: "GET",
        headers: {
          "User-Agent": "TrendsCronWorker",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[trends-cron] Refresh failed: ${response.status} ${text}`);
        return;
      }

      const data = await response.json();
      console.log(
        `[trends-cron] AI refresh success: ${data.newsCount} news, top tags:`,
        data.topTags?.slice(0, 5).map((t: any) => `${t.tag}:${t.count}`).join(", ") || "none"
      );

    } catch (error: any) {
      console.error(`[trends-cron] Error: ${error.message}`);
    }
  },

  // 也支持直接 fetch 访问（用于测试）
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "trends-cron-worker",
        mode: "AI tagging enabled",
      });
    }

    if (url.pathname === "/trigger" && request.method === "POST") {
      // 手动触发刷新（用于测试）
      try {
        const useAI = url.searchParams.get("ai") === "true";
        const scanUrl = `${SCAN_API_URL}?force=true&ai=${useAI ? "true" : "false"}`;
        const response = await fetch(scanUrl, {
          method: "GET",
          headers: {
            "User-Agent": "TrendsCronWorker",
          },
        });

        const data = await response.json();
        return Response.json({
          success: response.ok,
          aiMode: useAI,
          data,
        });
      } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    return Response.json(
      {
        service: "trends-cron-worker",
        status: "running",
        mode: "AI tagging every 4 hours",
        docs: "POST /trigger to manually refresh trends",
        docs: "POST /trigger?ai=true to use AI tagging",
      },
      { status: 200 }
    );
  },
} satisfies ExportedHandler<Env>;
