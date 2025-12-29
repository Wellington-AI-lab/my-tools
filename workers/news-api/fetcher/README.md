<div align="center">

# ⚡ Vibe Tech News

### 🌍 全球科技前沿资讯聚合 | AI 智能摘要 | Serverless 架构

[![Deployment Status](https://img.shields.io/badge/deployment-cloudflare--pages-success)](https://newsbim.pages.dev)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![AI](https://img.shields.io/badge/AI-Groq%20Llama-purple.svg)](https://groq.com)

**每日自动聚合** HackerNews、V2EX、36氪、少数派、TechCrunch、The Verge 等全球科技资讯，AI 智能生成中文摘要。

[在线预览](https://newsbim.pages.dev) · [快速开始](#-快速开始) · [架构说明](#-架构说明)

</div>

---

## ✨ 特性

- 🤖 **AI 智能摘要** - 使用 Groq Llama 3 自动生成中文摘要，快速获取核心信息
- 🌓 **深色模式** - 自动跟随系统偏好，支持手动切换
- 🔍 **实时搜索** - 本地搜索，毫秒级响应
- 🏷️ **来源筛选** - 一键过滤不同来源的新闻
- ♾️ **分页加载** - 无限滚动，查看更多历史内容
- 📱 **响应式设计** - 完美适配手机、平板、桌面
- ⚡ **Serverless** - 基于 Cloudflare Workers + D1，零服务器成本
- 🔄 **自动更新** - GitHub Actions 每 6 小时自动抓取

---

## 🏗️ 架构说明

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   RSS Sources   │───▶│  GitHub Actions  │───▶│  Cloudflare D1  │
│  (HN, V2EX...)  │    │  (fetcher.py)    │    │   (Database)    │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│     Browser     │◀──▶│ Cloudflare Pages │◀──▶│ Cloudflare      │
│  (User View)    │    │   (Frontend)     │    │ Workers (API)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 数据流向

1. **RSS 抓取**：GitHub Actions 定时运行 `fetcher.py`，从多个 RSS 源抓取新闻
2. **AI 处理**：调用 Groq API 对每条新闻生成中文摘要
3. **数据存储**：将处理后的新闻存入 Cloudflare D1 数据库
4. **API 服务**：Cloudflare Workers 提供 RESTful API
5. **前端展示**：Cloudflare Pages 托管静态页面，调用 API 展示新闻

### 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| **后端** | Cloudflare Workers | Serverless 边缘计算 |
| **数据库** | Cloudflare D1 | SQLite 边缘数据库 |
| **前端** | Vanilla JS + CSS | 无框架，极致轻量 |
| **定时任务** | GitHub Actions | 每 6 小时触发 |
| **AI** | Groq Llama 3 | 免费高速推理 |
| **托管** | Cloudflare Pages | 全球 CDN 分发 |

---

## 🚀 快速开始

### 方式一：直接使用（推荐）

直接访问已部署的网站：https://newsbim.pages.dev

### 方式二：自行部署

#### 前置要求

- GitHub 账号
- Cloudflare 账号（免费版即可）
- Groq API Key（免费获取：https://console.groq.com/keys）

#### 1. Fork 本仓库

点击右上角 "Fork" 按钮，将仓库复制到你的账号下。

#### 2. 获取 API Keys

1. **Cloudflare API Token**：
   - 访问 https://dash.cloudflare.com/profile/api-tokens
   - 创建 Token，权限需要 `Workers Scripts Storage` + `Edit`

2. **Groq API Key**：
   - 访问 https://console.groq.com/keys
   - 创建新的 API Key

#### 3. 配置 GitHub Secrets

在你的 Fork 仓库中，进入 `Settings` → `Secrets and variables` → `Actions`，添加以下 Secrets：

| Secret 名称 | 值 |
|-------------|-----|
| `API_URL` | `https://你的Worker地址.workers.dev/add` |
| `API_KEY` | Worker 的 API Secret |
| `GROQ_API_KEY` | 你的 Groq API Key |
| `ENABLE_AI_SUMMARY` | `true` |

#### 4. 部署后端 (Worker)

```bash
# 克隆你的 Fork
git clone https://github.com/你的用户名/news-fetcher.git
cd news-fetcher

# 进入 Worker 目录
cd ../news-api  # Worker 代码在上层目录

# 安装依赖
npm install

# 配置 wrangler.toml 中的数据库绑定
# 运行部署脚本
./deploy.sh
```

部署脚本会自动：
- 创建 D1 数据库
- 执行数据库 Schema
- 设置环境变量
- 部署 Worker

#### 5. 部署前端 (Pages)

1. 进入 Cloudflare Dashboard → **Workers & Pages** → **Create application**
2. 选择 **Pages** → **Connect to Git**
3. 选择你的 `news-fetcher` 仓库
4. 配置构建设置：
   - Framework preset: `None`
   - Build command: `(留空)`
   - Build output directory: `(留空)`
5. 点击 **Save and Deploy**

#### 6. 测试

手动触发 GitHub Action：
- 仓库页面 → **Actions** → **RSS News Fetcher** → **Run workflow**

---

## 📁 项目结构

```
news-fetcher/                 # GitHub 仓库 (前端)
├── index.html                # 🎨 前端页面 (深色模式、搜索、分页)
├── fetcher.py                # 🐍 RSS 抓取脚本
├── requirements.txt          # Python 依赖
├── .github/
│   └── workflows/
│       └── daily_news.yml    # ⏰ GitHub Actions 定时任务
└── README.md

news-api/                     # Worker 仓库 (后端)
├── src/
│   └── index.ts             # 📦 Worker 代码
├── schema.sql                # 🗄️ D1 数据库结构
├── wrangler.toml             # ⚙️ Cloudflare 配置
├── package.json
└── deploy.sh                 # 🚀 部署脚本
```

---

## 🔧 配置说明

### 添加/修改 RSS 源

编辑 `fetcher.py` 中的 `SOURCES` 数组：

```python
SOURCES = [
    {
        "name": "Hacker News",
        "url": "https://news.ycombinator.com/rss"
    },
    {
        "name": "你的源",
        "url": "https://example.com/rss"
    },
]
```

### 修改抓取频率

编辑 `.github/workflows/daily_news.yml`：

```yaml
schedule:
  - cron: '0 */6 * * *'  # 每 6 小时，可修改为其他 cron 表达式
```

### 自定义样式

`index.html` 使用 CSS 变量定义主题，可直接修改：

```css
:root {
    --accent-color: #0071e3;    /* 主题色 */
    --bg-color: #f5f5f7;        /* 背景色 */
    /* ... 更多变量 */
}
```

---

## 📊 API 文档

### GET /latest

获取最新新闻列表，支持分页。

**参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码 |
| `limit` | int | 50 | 每页条数 (最大 100) |

**响应：**
```json
{
  "success": true,
  "count": 50,
  "page": 1,
  "limit": 50,
  "hasMore": true,
  "data": [
    {
      "id": 1,
      "title": "新闻标题",
      "url": "https://...",
      "source": "Hacker News",
      "summary": "AI 生成的摘要",
      "created_at": 1704067200
    }
  ]
}
```

### POST /add

添加新闻文章（需要鉴权）。

**Headers：**
```
x-api-key: YOUR_API_SECRET
Content-Type: application/json
```

**Body：**
```json
[
  {
    "title": "新闻标题",
    "url": "https://...",
    "source": "来源",
    "summary": "摘要",
    "external_id": "唯一标识"
  }
]
```

---

## 🌟 常用 RSS 源

| 网站 | RSS 地址 |
|------|----------|
| Hacker News | https://news.ycombinator.com/rss |
| V2EX | https://www.v2ex.com/index.xml |
| 36氪 | https://36kr.com/feed |
| 少数派 | https://sspai.com/feed |
| TechCrunch | https://techcrunch.com/feed/ |
| The Verge | https://www.theverge.com/rss/index.xml |
| BBC News | http://feeds.bbci.co.uk/news/rss.xml |
| Reuters | https://www.reutersagency.com/feed/ |
| Wired | https://www.wired.com/feed/rss |
| Ars Technica | https://feeds.arstechnica.com/arstechnica/index |

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

## 🙏 致谢

- [Cloudflare](https://cloudflare.com) - Workers & D1 服务
- [Groq](https://groq.com) - 高速 AI 推理
- [HackerNews](https://news.ycombinator.com) - 热门科技资讯
- [V2EX](https://v2ex.com) - 创意工作者社区

---

<div align="center">

**Made with ⚡ by [Vibe Tech](https://github.com/Wellington-AI-lab)**

[⭐ Star this repo](https://github.com/Wellington-AI-lab/news-fetcher) if it helped you!

</div>

