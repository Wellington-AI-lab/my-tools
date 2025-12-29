# my tools

这是一个部署在 **Cloudflare Pages（免费版）** 上的工具平台。
每个小工具模块彼此独立，但通过 `/api/*` 与 **Cloudflare KV/D1** 共享核心数据（例如：**标的池/标签**）。

## 📦 已上线模块

| 模块 | 路由 | 状态 | 说明 |
|------|------|------|------|
| 股票组合回测 | `/tools/stocks` | stable | 日线回测、CAGR/夏普等指标 |
| 新闻聚合 | `/tools/news` | stable | 聚合 V2EX、HackerNews、36氪等科技资讯 |
| 关注重点 | `/tools/rednote-agent` | beta | 小红书信息流分析 |
| Telegram 信号 | `/tools/telegram` | todo | 待开发 |

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
- **存储**：Cloudflare KV + D1
- **部署**：Cloudflare Pages + Workers

---

## 📋 开发笔记

---

## 🔗 相关链接

- **生产地址**: https://my-tools-bim.pages.dev
- **newsnow 地址**: https://newsbim.pages.dev
- **GitHub**: https://github.com/Wellington-AI-lab/my-tools
- **newsnow 源项目**: https://github.com/ourongxing/newsnow
