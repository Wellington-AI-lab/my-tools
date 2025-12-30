# my-tools

一个**模块化工具平台**，部署于 **Vercel**。

每个工具模块彼此独立，通过 `/api/*` 与 **KV/Postgres 数据库** 共享核心数据（如标的池、标签、用户配置等）。

## ✨ 特性

- **类型安全**: 完整的 TypeScript 类型覆盖 (0 errors, 0 warnings)
- **测试驱动**: 核心功能均有单元测试覆盖
- **模块化架构**: 每个工具独立实现，便于维护和扩展
- **AI 增强**: 集成 LLM 进行内容分析和信号筛选

## 已上线模块

| 模块 | 路由 | 状态 | 说明 |
|------|------|------|------|
| 股票组合回测 | `/tools/stocks` | stable | 日线回测、CAGR/夏普比率、最大回撤分析 |
| 新闻聚合 | `/tools/news` | stable | 聚合 V2EX、HackerNews、36氪等科技资讯 |
| 新闻情报 | `/tools/news-intel` | stable | AI 增强的新闻分析，支持信号评分和分类 |
| 数据源管理 | `/tools/admin` | stable | 管理 RSS/RSSHub 数据源（管理员） |
| 深度分析 | `/tools/deep-analysis` | beta | 信息流内容分析与趋势检测 |
| Telegram 信号 | `/tools/telegram` | beta | 信号归档与标签化 |

### 外部链接
- [RSSHub](https://rsshub-fork-ai.vercel.app) - 万物皆可 RSS

## 技术栈

### 前端
- **框架**: Astro 5.6 + React 19
- **样式**: Tailwind CSS
- **图表**: Lightweight Charts
- **语言**: TypeScript (strict mode)

### 后端
- **运行时**: Astro SSR (Vercel Edge Runtime)
- **认证**: Cookie Session + PBKDF2 密码哈希
- **API**: RESTful endpoints

### 数据存储
| 服务 | 用途 |
|------|------|
| Vercel KV | 会话缓存、新闻去重 |
| Vercel Postgres | 持久化数据存储 |

### 外部服务
- **行情数据**: Finnhub, FMP, Polygon
- **AI/LLM**: GLM, Anthropic, OpenAI 兼容接口

## 本地开发

```bash
npm install
npm run dev
```

访问 `http://localhost:4321`

> 本地开发默认跳过登录验证

### 开发规范（节省 Vercel 部署次数）

| 场景 | 命令 | 说明 |
|------|------|------|
| 日常开发 | `npm run dev` | 热更新，秒级响应，无需构建 |
| 部署前验证 | `npm run build && npm run preview` | 确认生产构建没问题 |
| 正式部署 | `vercel --prod` | 手动触发，不依赖 Git 自动部署 |

**原因**：Vercel 免费版每月 100 次部署限额，每次小改动不需要自动触发部署。

### AI 辅助开发规范

- **自动执行**：常规开发任务（修复 bug、新增功能、重构代码等）由 AI 直接执行，无需人工确认
- **人工决策**：仅以下情况需要人工介入：
  - 架构层面的重大变更（如更换技术栈、数据库迁移）
  - 影响数据安全或用户隐私的操作
  - 不确定需求的歧义场景
  - 费用相关的决策（如新增付费服务）

## 测试

```bash
npm run test           # 运行测试
npm run test:watch     # 监听模式
npm run test:coverage  # 覆盖率报告
npm run check          # TypeScript 类型检查
```

## 环境变量 / Secrets

### 站点鉴权
- `SESSION_SECRET` - 会话签名密钥
- `SITE_PASSWORD_HASH` - 普通用户密码的 PBKDF2 hex
- `ADMIN_PASSWORD_HASH` - 管理员密码的 PBKDF2 hex

### 行情数据
- `FINNHUB_API_KEY` - Finnhub API 密钥
- `FMP_API_KEY` - FMP API 密钥（可选）
- `POLYGON_API_KEY` - Polygon API 密钥（可选）

### AI 服务
- `GLM_API_KEY` - 智谱 AI API 密钥
- `ANTHROPIC_API_KEY` - Anthropic API 密钥（可选）
- `OPENAI_API_KEY` - OpenAI API 密钥（可选）

### 配置方式
在 Vercel 项目设置中配置环境变量，或通过 CLI：
```bash
vercel env add SESSION_SECRET <value>
```

## 部署

```bash
npm run build
vercel --prod
```

## 开发笔记

- 采用 **测试驱动** 开发方式，核心 API 均有测试覆盖
- 使用 **Vitest** 进行单元测试，**MSW** 进行 API mock
- 代码风格遵循 **Astro 最佳实践**

## 相关链接

- **生产地址**: https://my-tools-bim.pages.dev
- **GitHub**: https://github.com/Wellington-AI-lab/my-tools
- **License**: MIT
