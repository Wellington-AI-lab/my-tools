# my tools

这是一个部署在 **Cloudflare Pages（免费版）** 上的工具平台。
每个小工具模块彼此独立，但通过 `/api/*` 与 **Cloudflare KV** 共享核心数据（例如：**标的池/标签**）。

## 📦 已上线模块

| 模块 | 路由 | 状态 | 说明 |
|------|------|------|------|
| 股票组合回测 | `/tools/stocks` | stable | 日线回测、CAGR/夏普等指标 |
| Trend Radar | `/tools/trends` | beta | 新闻聚合 + AI 标签分析 |
| 关注重点 | `/tools/rednote-agent` | beta | 小红书信息流分析 |
| Telegram 信号 | `/tools/telegram` | beta | 占位 |

---

## 🔄 Trend Radar 改造计划（进行中）

### 背景
整合 [ourongxing/newsnow](https://github.com/ourongxing/newsnow) 项目，获取 40+ 中文新闻源数据。

### 架构
```
newsnow (newsbim.pages.dev)  →  my-tools (my-tools-bim.pages.dev)
     40+ 新闻源抓取              →  AI 打标签 + 趋势分析
```

### 部署状态
- **newsnow**: 已部署到 `https://newsbim.pages.dev`
- **D1 数据库**: `newsnow-db` 已创建
- **环境变量**: 需配置 `G_CLIENT_ID`, `G_CLIENT_SECRET`, `JWT_SECRET`, `INIT_TABLE`, `ENABLE_CACHE`

### 待解决问题
- Cloudflare Pages 的 `_worker.js` 文件未正确生成
- API 端点返回 HTML 而非 JSON
- 需要确认 D1 绑定是否生效

### 临时方案
如 newsnow 后端暂时不可用，可：
1. 直接访问 newsnow 前端查看新闻
2. 趋势雷达暂时使用模拟数据演示

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

---

## 📝 部署

### my-tools 部署
```bash
npm run build
npx wrangler pages deploy dist --project-name=my-tools
```

### newsnow 部署
```bash
cd /Users/wellington/newsnow
pnpm run deploy
# 或手动：
npx wrangler pages deploy dist/output/public --project-name=newsbim
```

---

## 🛠️ 技术栈

- **前端**：Astro + Tailwind CSS
- **后端**：Cloudflare Pages Functions
- **存储**：Cloudflare KV + D1（newsnow）
- **AI**：Cloudflare Workers AI（打标签）

---

## 📋 开发笔记

### 2025-12-27 趋势雷达改造
- Fork newsnow 项目到 `/Users/wellington/newsnow`
- 创建 D1 数据库 `newsnow-db` (id: 7df668b3-c34e-4073-a6d2-6873f8b7bdc9)
- 添加 API 端点 `/api/trends/aggregate` 和 `/api/trends/init`
- 修改中间件允许 `/api/trends` 路径绕过登录
- 创建标签系统 `src/modules/trends/tag-system.ts`
- 改造趋势雷达前端 `/src/pages/tools/trends.astro`
- **问题**: Cloudflare Pages 的 `_worker.js` 未正确生成，API 返回 HTML

### 解决方案探索
- 尝试配置 `h3` 版本 resolution
- 修改 `nitro.config.ts` 添加 `unenv` 配置
- 添加 `public/_routes.json`
- **下一步**: 可能需要使用 Cloudflare Workers 单独部署后端

---

## 🔗 相关链接

- **生产地址**: https://my-tools-bim.pages.dev
- **newsnow 地址**: https://newsbim.pages.dev
- **GitHub**: https://github.com/Wellington-AI-lab/my-tools
