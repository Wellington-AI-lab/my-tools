# 开发会话记录：Trend Radar + RedNote DeepAgent

**日期**：2025-01-XX（今晚）  
**目标**：构建多源趋势雷达 + 小红书信息流分析工具

---

## ✅ 已完成的工作

### 1. RedNote DeepAgent（小红书信息流分析）

**路由**：`/tools/rednote-agent`

**核心架构**：
- **Stage 1（Spam Firewall）**：`src/modules/rednote/pipeline/stage1-filter.ts`
  - HeatScore 公式：`Likes*1 + Collects*3 + Comments*5 + Shares*5`
  - 硬过滤：HeatScore < 50（可配置 `heatThreshold`）
  - 黑名单：`["私聊","领资料","兼职","加V","回复111"]`
  - 去重：中文 2-gram Jaccard 相似度，阈值 **0.66**
- **Stage 2（Brain）**：`src/modules/rednote/pipeline/stage2-llm.ts`
  - 有 LLM env：走 OpenAI-compatible `/v1/chat/completions`
  - 无 LLM env：自动降级为**确定性模拟推理**（保证 UI 可用）
- **Stage 3（Response）**：`src/modules/rednote/pipeline/stage3-response.ts`
- **API**：`POST /api/rednote/run`

**数据源**：
- 优先：Apify `xiaohongshu-search`（需 API Key）
- 开发：Mock JSON（`src/modules/rednote/mock/rednote-raw.mock.json`）

**UI 组件**：
- `SearchControl.astro`：关键词 + 时间范围（24h/7d/30d）
- `AgentLog.astro`：终端风格日志
- `InsightDeck.astro`：Markdown 洞察 + 趋势标签
- `FeedGrid.astro`：卡片网格 + HeatScore 可视化

---

### 2. Trend Radar（多源趋势雷达）

**路由**：`/tools/trends`

**MVP 数据源**（免费/可抓取，不稳定可接受）：
- **Google Trends**：公开 Daily RSS（CN + US）
  - 实现：`src/modules/trends/sources/google-trends-rss.ts`
- **微博热搜**：抓取 `s.weibo.com/top/summary` HTML 解析
  - 实现：`src/modules/trends/sources/weibo-hot.ts`
- **降级策略**：任一源失败自动 fallback，全部失败用 mock

**主题覆盖**（9 个）：
- `finance`（金融）、`economy`（经济）、`ai`（AI 行业）、`robotics`（机器人行业）
- `travel`（旅游）、`music`（歌曲/音乐）、`movies`（电影）、`fashion`（时尚）、`entertainment`（娱乐）

**Pipeline**：
- **Funnel**：`src/modules/trends/pipeline/filter.ts`（硬过滤 + 去重）
- **推理**：`src/modules/trends/pipeline/reason.ts`（LLM 可选，默认 mock）
- **对比**：`src/modules/trends/compare.ts`（7 天窗口 spike/共振/聚类）
- **归一化**：`src/modules/trends/normalize.ts`（中英同义词 → canonical key）
- **聚类**：`src/modules/trends/cluster.ts`（事件簇，跨来源合并）
- **影响评估**：`src/modules/trends/impact.ts`（LLM 可选，默认启发式）

**定时任务**：
- **Cron Worker**：`cron-worker/src/index.ts`
- **时间**：每天 **北京时间 06:00**（UTC 22:00）
- **配置**：`cron-worker/wrangler.toml`
- **状态**：代码已完成，**待部署到 Cloudflare**

**KV 存储结构**：
- `trends:latest`：最新报告
- `trends:daily:YYYY-MM-DD`：按日期归档（保留 14 天）
- `trends:index`：最近 14 天 day_key 列表（用于历史查询）
- `trends:aliases`：可配置的同义词规则（JSON）

**API 接口**：
- `GET /api/trends/latest`：读取最新报告
- `POST /api/trends/run`：手动运行并写入 KV
- `GET /api/trends/history?limit=7`：最近 N 天报告列表
- `GET /api/trends/compare?days=7`：7 天对比（spike/共振/事件簇）
- `GET /api/trends/aliases`：读取 alias 规则
- `PUT /api/trends/aliases`：保存 alias 规则

**UI 功能**：
- 今日报告展示（Insight + Themes + Source Health）
- Compare（7d）：Spikes / Resonance / Events（带影响评估）
- Last 7 Days：历史浏览
- Alias Map：可编辑的同义词规则（JSON 格式）

---

## 🏗️ 架构决策

### 数据源选择（MVP）
- **Google Trends**：无官方免费 API → 用公开 RSS（不稳定但可用）
- **X（Twitter）**：官方 API 需付费 → **暂不接入**（未来可扩展）
- **微博/抖音/快手**：官方 API 需企业认证 → **抓取/第三方**（不稳定可接受）

### 定时执行
- **方案**：Cloudflare Worker（Cron Trigger）
- **原因**：Cloudflare Pages 本身不支持 cron，需独立 Worker
- **部署**：`cron-worker/` 目录需单独部署（绑定同一 KV namespace）

### LLM 集成
- **策略**：可选，无 env 时自动降级为规则/模拟
- **Env 变量**：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`（OpenAI-compatible）
- **影响**：RedNote Stage2、Trends 推理、事件影响评估

### 归一化/去重
- **中文去重**：2-gram Jaccard（阈值 0.66，可调）
- **中英归一化**：硬编码 alias map + KV 可配置扩展
- **事件聚类**：标题相似度（阈值 0.72，可调）

---

## ⚠️ 未决重要事项

### 1. Cron Worker 部署（高优先级）
**状态**：代码已完成，**未部署到 Cloudflare**

**需要做的**：
```bash
cd cron-worker
npx wrangler deploy
```

**注意事项**：
- 确保 KV namespace ID 与 Pages 一致（`52ccf57fcdf14a7e882adee054fd0a8b`）
- 验证 cron trigger 是否生效（Cloudflare Dashboard → Workers → Triggers）

**验证**：
- 等待第二天 06:00（北京时间）后检查 KV 是否有新报告
- 或手动触发：`npx wrangler dev --test-scheduled`

---

### 2. 未来数据源扩展（中优先级）

**X（Twitter）**：
- 选项 A：付费 X API（最稳定）
- 选项 B：Apify actor（第三方，不稳定）
- 选项 C：抓取（高风险，可能被封）

**抖音/快手**：
- 选项 A：官方开放平台（需企业认证）
- 选项 B：第三方 API（如 MoreAPI、OneAPI）
- 选项 C：抓取（高风险）

**实现位置**：
- 新增 `src/modules/trends/sources/*.ts`
- 在 `src/modules/trends/agent.ts` 的 `runTrendsAgent()` 中挂入

---

### 3. Alias 规则编辑体验（低优先级）

**现状**：JSON 格式手动编辑（在 `/tools/trends` 的 Alias Map 卡片）

**可改进**：
- 增量编辑 UI（添加/删除单个 alias，不用写完整 JSON）
- 回测验证（保存前后对比 spike/共振变化）
- 自动建议（基于历史报告推荐新 alias）

---

### 4. 事件影响评估增强（低优先级）

**现状**：
- LLM 有则用，无则启发式降级
- 输出：`bullish/bearish/neutral/unknown` + `confidence` + `rationale`

**可改进**：
- 多轮对话（让 LLM 更深入分析）
- 历史对比（对比昨天/上周的影响变化）
- 置信度校准（基于历史准确率）

---

## 📁 关键文件位置

### RedNote DeepAgent
- 类型：`src/modules/rednote/types.ts`
- Pipeline：`src/modules/rednote/pipeline/*.ts`
- Agent：`src/modules/rednote/agent.ts`
- API：`src/pages/api/rednote/run.ts`
- UI：`src/pages/tools/rednote-agent.astro`

### Trend Radar
- 类型：`src/modules/trends/types.ts`
- 数据源：`src/modules/trends/sources/*.ts`
- Pipeline：`src/modules/trends/pipeline/*.ts`
- 对比/归一化/聚类：`src/modules/trends/{compare,normalize,cluster,impact}.ts`
- Agent：`src/modules/trends/agent.ts`
- 存储：`src/modules/trends/store.ts`
- API：`src/pages/api/trends/*.ts`
- UI：`src/pages/tools/trends.astro`
- Cron：`cron-worker/src/index.ts`

---

## 🔧 环境变量（新增）

### RedNote DeepAgent
- `LLM_BASE_URL`（可选）：OpenAI-compatible API base URL
- `LLM_API_KEY`（可选）：API key
- `LLM_MODEL`（可选）：Model name（如 `gpt-4`、`claude-3-opus`）

### Trend Radar
- 同上（LLM 用于推理和影响评估）

### Apify（未来）
- `APIFY_API_KEY`：用于小红书搜索（RedNote）和可能的 X/TikTok 抓取

---

## 🚀 快速重启指南

### 本地开发
```bash
npm install
npm run dev
# 访问 http://localhost:4321
# 登录密码：localdev（已在 .env 配置）
```

### 验证功能
1. **RedNote**：`/tools/rednote-agent` → 输入关键词 → 运行 Agent
2. **Trends**：`/tools/trends` → 手动运行 → 查看 Compare/Events

### 部署 Cron Worker（待做）
```bash
cd cron-worker
npx wrangler deploy
# 验证：Cloudflare Dashboard → Workers → 查看 cron trigger
```

---

## 📝 技术债务 / 已知问题

1. **微博抓取可能失败**：HTML 结构变化会导致解析失败（已做 graceful fallback）
2. **Google Trends RSS 不稳定**：可能被限流（已做 fallback）
3. **Alias 编辑体验**：目前是 JSON 手动编辑，不够友好
4. **事件聚类阈值**：0.72 是经验值，可能需要根据实际数据调优
5. **LLM 超时**：默认 20s，可能不够（可调 `timeoutMs`）

---

## 🎯 未来可扩展方向

1. **多语言支持扩展**：日文/韩文趋势（需扩展 normalize）
2. **实时推送**：WebSocket 或 Server-Sent Events（重大 spike 时通知）
3. **趋势预测**：基于历史数据做简单时间序列预测
4. **与标的池联动**：自动从趋势中提取股票代码/公司名，写入 watchlist
5. **可视化增强**：趋势曲线图、热力图、词云

---

**最后更新**：2025-01-XX  
**下次启动时**：优先部署 cron-worker，然后验证定时任务是否正常

