import { runTrendsAgent } from '@/modules/trends/agent';
import { putTrendsReport } from '@/modules/trends/store';

type Env = {
  KV: KVNamespace;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
};

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const report = await runTrendsAgent({
          env: {
            LLM_BASE_URL: env.LLM_BASE_URL,
            LLM_API_KEY: env.LLM_API_KEY,
            LLM_MODEL: env.LLM_MODEL,
          },
        });
        await putTrendsReport(env.KV, report);
      })()
    );
  },
};


