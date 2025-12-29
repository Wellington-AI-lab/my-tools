# my-tools

一个**模块化工具平台**，部署于 **Vercel**。

每个工具模块彼此独立，通过 `/api/*` 与 **KV 数据库** 共享核心数据（如标的池、标签、用户配置等）。

## 已上线模块

| 模块 | 路由 | 状态 | 说明 |
|------|------|------|------|
| 股票组合回测 | `/tools/stocks` | stable | 日线回测、CAGR/夏普比率、最大回撤分析 |
| 新闻聚合 | `/tools/news` | stable | 聚合 V2EX、HackerNews、36氪等科技资讯 |
| 数据源管理 | `/tools/admin` | stable | 管理 RSS/RSSHub 数据源（管理员） |
| 深度分析 | `/tools/deep-analysis` | beta | 信息流内容分析与趋势检测 |
| Telegram 信号 | `/tools/telegram` | todo | 信号归档与标签化（待开发） |

## API 端点

| 端点 | 说明 |
|------|------|
| `/api/auth/login` | 用户登录 |
| `/api/auth/logout` | 用户登出 |
| `/api/stocks/calculate` | 股票组合回测计算 |
| `/api/profile/watchlist` | 用户自选股管理 |
| `/api/profile/preferences` | 用户偏好设置 |
| `/api/profile/tags` | 标签管理 |
| `/api/intelligence/scan` | 智能内容抓取 |
| `/api/intelligence/sources` | 数据源管理 |
| `/api/in-depth-analysis/run` | 深度分析执行 |

## 技术栈

### 前端
- **框架**: Astro 5
- **样式**: Tailwind CSS
- **图表**: Lightweight Charts, Recharts
- **语言**: TypeScript

### 后端
- **运行时**: Astro SSR (Vercel Edge)
- **认证**: Cookie Session + PBKDF2 密码哈希

### 数据存储
| KV 存储 | 数据库 |
|---------|--------|
| Vercel KV (Redis) | Vercel Postgres |

### 外部服务
- **行情数据**: Finnhub（主）, FMP, Polygon, Yahoo Finance（备）
- **AI/LLM**: OpenAI 兼容接口

## 本地开发

```bash
npm install
npm run dev
```

访问 `http://localhost:4321`

> 本地开发默认跳过登录验证

## 环境变量 / Secrets

### 站点鉴权
- `SESSION_SECRET` - 会话签名密钥
- `SITE_PASSWORD_HASH` - 普通用户密码的 SHA-256 hex
- `ADMIN_PASSWORD_HASH` - 管理员密码的 SHA-256 hex

### 行情数据
- `FINNHUB_API_KEY` - Finnhub API 密钥
- `FMP_API_KEY` - FMP API 密钥（可选）
- `POLYGON_API_KEY` - Polygon API 密钥（可选）

### AI 服务
- `OPENAI_API_KEY` - OpenAI API 密钥
- `OPENAI_BASE_URL` - API 基础 URL（可选）

### 环境变量配置
在 Vercel 项目设置中配置环境变量，或通过 CLI：
```bash
vercel env add SESSION_SECRET
```

## 部署

```bash
npm run build
vercel --prod
```

## 测试

```bash
npm run test           # 运行测试
npm run test:watch     # 监听模式
npm run test:coverage  # 覆盖率报告
```

## 开发笔记

- 每个模块独立实现，便于维护和扩展
- 采用**测试驱动**开发方式，核心 API 均有测试覆盖

## 相关链接

- **生产地址**: https://my-tools-bim.pages.dev
- **GitHub**: https://github.com/Wellington-AI-lab/my-tools
