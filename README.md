# my tools

这是一个部署在 **Cloudflare Pages（免费版）** 上的工具平台。  
每个小工具模块彼此独立，但通过 `/api/*` 与 **Cloudflare KV** 共享核心数据（例如：**标的池/标签**）。

当前已上线/完成的模块：
- **股票组合回测**：日线、近 10 年（自动对齐 IPO 可用区间）、输出 **CAGR / 总收益 / 最大回撤 / 夏普**  
  - 数据源：**Finnhub 主用**，失败自动兜底 **FMP / Polygon**
  - 不落历史价格库：按需抓取 + KV 缓存（降低 API 调用次数与复杂度）
- **Trend Radar（Beta）**：多源趋势雷达，每日定时聚合 Google Trends（RSS）+ 微博热搜（抓取解析）
  - 主题覆盖：金融、经济、AI、机器人、旅游、歌曲、电影、时尚、娱乐
  - 功能：7 天对比（spike/共振/事件聚类）、中英同义词归一化、事件影响评估（LLM 可选）
  - 路由：`/tools/trends`
- **RedNote DeepAgent（Beta）**：小红书信息流分析，Funnel 过滤 + AI 洞察报告（SNR 优先）
  - 数据源：Apify（优先）或 Mock（开发）
  - 功能：HeatScore 计算、去重、真实性验证、趋势提取
  - 路由：`/tools/rednote-agent`

后续模块（占位）：
- 新闻聚合（围绕标的池重点监控）
- Telegram 信号整合（信号标签化并联动标的池）

> 📋 **开发会话记录**：详见 [SESSION_2025-01-XX_TRENDS_REDNOTE.md](./SESSION_2025-01-XX_TRENDS_REDNOTE.md)

---

## 🚀 本地开发

```bash
npm install
npm run dev
```

然后访问 `http://localhost:4321`

> 本地开发默认使用内存 KV（用于体验）。生产部署时必须绑定 Cloudflare KV（见部署）。

---

## 🔐 环境变量 / Secrets（生产必须）

**站点鉴权**
- `SESSION_SECRET`：会话签名密钥（随机字符串，建议 32+ bytes）
- `SITE_PASSWORD_HASH`：普通登录密码的 SHA-256 hex
- `ADMIN_PASSWORD_HASH`：管理员登录密码的 SHA-256 hex

**行情数据源（至少配置 Finnhub）**
- `FINNHUB_API_KEY`
- `FMP_API_KEY`（可选但推荐）
- `POLYGON_API_KEY`（可选但推荐）

**LLM 推理（可选，用于 RedNote/Trends 的 AI 分析）**
- `LLM_BASE_URL`：OpenAI-compatible API base URL（如 `https://api.openai.com/v1`）
- `LLM_API_KEY`：API key
- `LLM_MODEL`：Model name（如 `gpt-4`、`claude-3-opus`）
- 不配置时会自动降级为规则/模拟推理（功能仍可用，但信号质量较低）

---

## 🧰 常用脚本

- 生成密码哈希（输出 `SITE_PASSWORD_HASH=...` / `ADMIN_PASSWORD_HASH=...`）：
  - `node scripts/generate-password-hash.mjs`
- 生成 Session Secret：
  - `node scripts/generate-session-secret.mjs`

---

## 🛠️ 技术栈

- **前端**：Astro（平台壳 + 模块页面）
- **后端**：Cloudflare Pages Functions（`/api/*`）
- **存储**：Cloudflare KV（标的池/标签/偏好 + 行情缓存）
- **样式**：Tailwind CSS（全平台统一主题 token）

---

## 📝 部署（Cloudflare Pages）

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)

### 定时任务（Trend Radar）

Trend Radar 需要单独部署一个 Cloudflare Worker 用于每日定时执行：

```bash
cd cron-worker
npx wrangler deploy
```

**重要**：确保 Worker 的 KV namespace ID 与 Pages 一致（见 `cron-worker/wrangler.toml`）。  
定时：每天 **北京时间 06:00**（UTC 22:00）。


