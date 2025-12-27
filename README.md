# my tools

这是一个部署在 **Cloudflare Pages（免费版）** 上的工具平台。
每个小工具模块彼此独立，但通过 `/api/*` 与 **Cloudflare KV/D1** 共享核心数据（例如：**标的池/标签**）。

## 📦 已上线模块

| 模块 | 路由 | 状态 | 说明 |
|------|------|------|------|
| 股票组合回测 | `/tools/stocks` | stable | 日线回测、CAGR/夏普等指标 |
| 社会热点扫描 | `/tools/trends` | stable | 新闻聚合 + AI 标签分析 + 历史趋势 |
| 关注重点 | `/tools/rednote-agent` | beta | 小红书信息流分析 |
| Telegram 信号 | `/tools/telegram` | todo | 待开发 |

---

## 🔄 社会热点扫描（已完成）

### 架构
```
newsnow (newsbim.pages.dev)  →  my-tools (my-tools-bim.pages.dev)
     40+ 新闻源抓取              →  AI 打标签 + 趋势分析 + D1 存储
```

### 部署状态
- **newsnow**: https://newsbim.pages.dev ✅
- **newsnow D1**: `newsnow-db` (id: 7df668b3-c34e-4073-a6d2-6873f8b7bdc9) ✅
- **trends D1**: `trends-db` (id: 51d6efae-0423-48b3-98be-a0d35034e589) ✅
- **社会热点扫描**: https://my-tools-bim.pages.dev/tools/trends ✅

### API 端点

| 端点 | 说明 |
|------|------|
| `/api/trends/scan` | 获取趋势分析数据（支持 `?force=true` 强制刷新，`?ai=true` AI模式）|
| `/api/trends/history?mode=latest` | 获取最新标签快照 |
| `/api/trends/history?mode=velocity&days=7` | 本周飙升榜（速度分析）|
| `/api/trends/history?mode=persistent&days=7` | 持续热点（长期保持高位）|
| `/api/trends/history?mode=top&days=7` | 时段Top标签 |
| `/api/trends/history?tag=AI&days=7` | 单标签历史趋势 |
| `/api/trends/history?hours=24` | 24小时异动分析 |
| newsnow `/api/trends/aggregate` | 聚合新闻数据 |

### AI 智能打标签
- **模型**: Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
- **调用方式**: REST API 批量处理（20条/批）
- **标签质量**: 提取实体名、事件类型、行业领域
- **成本**: 免费额度内（~150次调用/天，远低于10000 Neurons限制）
- **回退机制**: AI 失败时自动回退到关键词词典匹配（~200词汇）
- **配额监控**: 超限时自动降级到关键词模式，前端显示警告

### 历史趋势分析（D1）
- **数据存储**: 每次4小时扫描自动写入 D1 数据库
- **存储容量**: 5GB 可存约 450 年数据
- **分析维度**:
  - 🔥 **本周飙升榜**: 增长最快的标签
  - 📊 **持续热点**: 长期保持高位的话题
  - ⚡ **实时异动**: 24小时内变化最大
- **趋势指标**: 速度、加速度、排名变化

### 定时任务设置
使用 Cloudflare Worker 实现定时刷新：

- **Worker 地址**: https://trends-cron-worker.zhusen-wang.workers.dev
- **Cron 表达式**: `0 */4 * * *` (每 4 小时执行一次，UTC 时间)
- **Worker 位置**: `/workers/trends-cron/`
- **Secret**: `CRON_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

**更新 Worker**:
```bash
cd /Users/wellington/my-tools/workers/trends-cron
npm run deploy
```

**手动触发刷新**:
```bash
curl -X POST https://trends-cron-worker.zhusen-wang.workers.dev/trigger
```

### 技术要点
- **AI 打标签**: 使用 Cloudflare Workers AI REST API
- **批量处理**: 每批 20 条新闻，减少 API 调用
- **关键词回退**: AI 失败时自动使用关键词词典匹配
- **D1 存储**: 历史快照永久保存，支持趋势分析
- **前端三栏布局**: 本周飙升榜、持续热点、实时异动
- 支持点击标签查看相关新闻
- 数据缓存 1 小时，支持强制刷新

---

## 🚀 本地开发

```bash
npm install
npm run dev
```

然后访问 `http://localhost:4321`

> 本地开发默认跳过登录验证。

---

## 🔐 环境变量 / Secrets

**站点鉴权**
- `SESSION_SECRET`：会话签名密钥
- `SITE_PASSWORD_HASH`：普通登录密码的 SHA-256 hex
- `ADMIN_PASSWORD_HASH`：管理员登录密码的 SHA-256 hex

**行情数据**
- `FINNHUB_API_KEY`
- `FMP_API_KEY`（可选）
- `POLYGON_API_KEY`（可选）

**定时任务 + AI**
- `CRON_SECRET`：Cron 刷新认证密钥
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID
- `CLOUDFLARE_API_TOKEN`：Workers AI API Token

---

## 📝 部署

### my-tools 部署
```bash
npm run build
npx wrangler pages deploy dist --project-name=my-tools
```

### trends-cron-worker 部署
```bash
cd /Users/wellington/my-tools/workers/trends-cron
npm run deploy
```

### newsnow 部署
```bash
cd /Users/wellington/newsnow
pnpm run deploy
# 或手动：
npx wrangler pages deploy dist/output/public --project-name=newsbim
```

**⚠️ 重要**: newsnow 是 fork 的项目，上游更新不会自动同步。
- 推荐每月同步一次上游代码
- 同步步骤见 `/Users/wellington/newsnow/MODIFICATIONS.md`

---

## 🛠️ 技术栈

- **前端**：Astro + Tailwind CSS
- **后端**：Cloudflare Pages Functions + Workers (Cron)
- **存储**：Cloudflare KV + D1（趋势历史数据）
- **AI**: Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
- **部署**：Cloudflare Pages + Workers

---

## 📋 开发笔记

### 2025-12-28 历史趋势分析上线
- ✅ 创建 D1 数据库 `trends-db` (51d6efae-0423-48b3-98be-a0d35034e589)
- ✅ 配置 Pages Functions D1 绑定（通过 OAuth API）
- ✅ 实现标签快照存储（每次扫描自动写入）
- ✅ 新增历史趋势分析 API（velocity/persistent/top/单标签）
- ✅ 前端增加三栏趋势分析板块
- ✅ 页面名称改为"社会热点扫描"
- ✅ 状态升级为 stable

### 2025-12-27 Trend Radar 完成上线
- ✅ Fork newsnow 项目到 `/Users/wellington/newsnow`
- ✅ 创建 D1 数据库并配置绑定
- ✅ 添加 API 端点实现跨域数据获取
- ✅ 实现关键词提取系统（~200 词汇）
- ✅ 完成前端柱状图和交互
- ✅ 添加定时刷新端点
- ✅ 部署上线

### 关键问题解决
1. **API 返回 HTML**: 修复 `getEntire()` 调用方式
2. **D1 绑定**: 在 Cloudflare 控制台手动配置
3. **单字符标签**: 前端过滤，只显示有意义的标签
4. **定时刷新**: 使用 Cloudflare Worker Cron Triggers（Pages Functions 不支持 cron）
5. **AI 绑定**: Pages Functions 不支持 AI 绑定，改用 REST API 调用
6. **D1 Pages 绑定**: 使用 OAuth token 通过 API 配置

### 2025-12-27 Cron Worker 上线
- ✅ 创建独立的 Cloudflare Worker (`trends-cron-worker`)
- ✅ 配置 Cron Triggers 每 4 小时执行一次
- ✅ 设置 CRON_SECRET、CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_API_TOKEN 环境变量
- ✅ Worker 地址: https://trends-cron-worker.zhusen-wang.workers.dev

### 2025-12-27 AI 智能打标签集成
- ✅ 集成 Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
- ✅ 使用 REST API 方式调用（避免绑定限制）
- ✅ 批量处理（20条/批）优化 API 调用
- ✅ AI 失败自动回退到关键词匹配
- ✅ 前端默认启用 AI 模式
- ✅ AI 配额监控和警告

---

## 🔗 相关链接

- **生产地址**: https://my-tools-bim.pages.dev
- **Cron Worker**: https://trends-cron-worker.zhusen-wang.workers.dev
- **newsnow 地址**: https://newsbim.pages.dev
- **GitHub**: https://github.com/Wellington-AI-lab/my-tools
- **newsnow 源项目**: https://github.com/ourongxing/newsnow
