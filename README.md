# my tools

这是一个部署在 **Cloudflare Pages（免费版）** 上的工具平台。
每个小工具模块彼此独立，但通过 `/api/*` 与 **Cloudflare KV** 共享核心数据（例如：**标的池/标签**）。

## 📦 已上线模块

| 模块 | 路由 | 状态 | 说明 |
|------|------|------|------|
| 股票组合回测 | `/tools/stocks` | stable | 日线回测、CAGR/夏普等指标 |
| Trend Radar | `/tools/trends` | ✅ 完成 | 新闻聚合 + AI 标签分析 |
| 关注重点 | `/tools/rednote-agent` | beta | 小红书信息流分析 |
| Telegram 信号 | `/tools/telegram` | todo | 待开发 |

---

## 🔄 Trend Radar（已完成）

### 架构
```
newsnow (newsbim.pages.dev)  →  my-tools (my-tools-bim.pages.dev)
     40+ 新闻源抓取              →  关键词提取 + 趋势分析
```

### 部署状态
- **newsnow**: https://newsbim.pages.dev ✅
- **D1 数据库**: `newsnow-db` (id: 7df668b3-c34e-4073-a6d2-6873f8b7bdc9) ✅
- **Trend Radar**: https://my-tools-bim.pages.dev/tools/trends ✅

### API 端点

| 端点 | 说明 |
|------|------|
| `/api/trends/scan` | 获取趋势分析数据（支持 `?force=true` 强制刷新）|
| `/api/trends/refresh` | 定时刷新端点（需认证头 `X-Cron-Auth`）|
| newsnow `/api/trends/aggregate` | 聚合新闻数据 |
| newsnow `/api/trends/init` | 初始化数据库 |

### 关键词系统
- **词典规模**: ~200 个关键词
- **分类**: 政治、军事、经济、科技、医疗、教育、房地产、文娱、企业、地方等
- **过滤**: 单字符标签（"中"、"美"）已过滤，只显示有意义的标签
- **黑名单**: 过滤通用词、动词、媒体类型等无意义词汇

### 定时任务设置
使用 https://cron-job.org 设置定时刷新：

1. 注册免费账号
2. 创建 Cron Job：
   - URL: `https://my-tools-bim.pages.dev/api/trends/refresh`
   - Method: `GET`
   - Headers: `X-Cron-Auth: your-cron-secret`
   - 频率: 每 2 小时 (推荐)

### 技术要点
- 关键词提取采用内联词典匹配（避免 chunk 导入问题）
- 前端过滤单字符标签，限制显示前 20 个
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

**定时任务**
- `CRON_SECRET`：Cron 刷新认证密钥

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
- **部署**：Cloudflare Pages

---

## 📋 开发笔记

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
4. **定时刷新**: 使用 cron-job.org 外部服务

---

## 🔗 相关链接

- **生产地址**: https://my-tools-bim.pages.dev
- **newsnow 地址**: https://newsbim.pages.dev
- **GitHub**: https://github.com/Wellington-AI-lab/my-tools
- **newsnow 源项目**: https://github.com/ourongxing/newsnow
