# 新闻聚合 API - 部署教程

一个简单的新闻聚合后端，使用 Cloudflare Workers + D1 数据库。

## 📁 项目结构

```
news-api/
├── src/
│   └── index.ts       # Worker 业务代码
├── schema.sql         # 数据库表结构
├── wrangler.toml      # Cloudflare 配置
├── package.json       # 依赖管理
├── deploy.sh          # 一键部署脚本
└── README.md          # 本文件
```

---

## 🚀 部署步骤

### 方法一: 使用一键部署脚本 (推荐)

```bash
cd ~/my-tools/workers/news-api
chmod +x deploy.sh
./deploy.sh
```

脚本会自动完成以下步骤:
1. 检查 Cloudflare 登录
2. 创建 D1 数据库
3. 应用数据库结构
4. 设置 API Secret
5. 部署 Worker

---

### 方法二: 手动部署

#### 1. 登录 Cloudflare

```bash
npx wrangler login
```

#### 2. 创建 D1 数据库

```bash
npx wrangler d1 create news-db
```

**重要**: 记下输出中的 `database_id`，类似:
```
database_id = "51d6efae-0423-48b3-98be-a0d35034e589"
```

#### 3. 更新 wrangler.toml

打开 `wrangler.toml`，把 `<YOUR_DATABASE_ID>` 替换成上面的 ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "news-db"
database_id = "51d6efae-0423-48b3-98be-a0d35034e589"  # 👈 替换这里
```

#### 4. 应用数据库结构

```bash
npx wrangler d1 execute news-db --file=./schema.sql
```

#### 5. 设置 API Secret

设置一个密钥，用于保护 `/add` 接口:

```bash
npx wrangler secret put API_SECRET
```

输入你想要的密码，比如 `my-secret-key-123`。

#### 6. 安装依赖并部署

```bash
npm install
npx wrangler deploy
```

---

## 📡 API 使用说明

部署完成后，你会得到一个 URL，例如:
```
https://news-api.your-subdomain.workers.dev
```

### 接口 1: 添加文章 (需要鉴权)

**请求:**
```bash
curl -X POST https://news-api.xxx.workers.dev/add \
  -H "x-api-key: 你的API_SECRET" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "title": "AI 的新突破",
      "url": "https://example.com/ai-breakthrough",
      "source": "HackerNews",
      "summary": "人工智能领域取得重大进展...",
      "external_id": "hn_123456"
    }
  ]'
```

**响应:**
```json
{
  "success": true,
  "inserted": 1,
  "skipped": 0
}
```

### 接口 2: 获取最新文章 (无需鉴权)

**请求:**
```bash
curl https://news-api.xxx.workers.dev/latest?limit=10
```

**响应:**
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": 1,
      "title": "AI 的新突破",
      "url": "https://example.com/ai-breakthrough",
      "source": "HackerNews",
      "summary": "人工智能领域取得重大进展...",
      "created_at": 1735389600,
      "external_id": "hn_123456"
    }
  ]
}
```

### 接口 3: 获取统计信息

**请求:**
```bash
curl https://news-api.xxx.workers.dev/stats
```

**响应:**
```json
{
  "success": true,
  "totalArticles": 1234,
  "bySource": [
    { "source": "HackerNews", "count": 456 },
    { "source": "Reddit", "count": 321 }
  ],
  "latestArticleAt": 1735389600
}
```

---

## 🔧 常用管理命令

```bash
# 查看数据库内容
npx wrangler d1 execute news-db --command="SELECT * FROM articles ORDER BY created_at DESC LIMIT 10"

# 清空数据库
npx wrangler d1 execute news-db --command="DELETE FROM articles"

# 查看 Worker 日志
npx wrangler tail

# 本地开发 (连接本地数据库)
npx wrangler dev --local
```

---

## 📝 数据字段说明

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| title | Text | 文章标题 | 是 |
| url | Text | 原文链接 | 是 |
| source | Text | 来源名称 (如 "HackerNews") | 是 |
| summary | Text | 文章摘要 | 否 |
| created_at | Integer | Unix 时间戳 | 否 (默认当前时间) |
| external_id | Text | 唯一标识符 (防止重复) | 是 |

---

## ⚠️ 注意事项

1. **API Secret 保护**: 不要把你的 `API_SECRET` 告诉别人，否则任何人都可以向你的数据库写数据。

2. **external_id**: 这个字段用于防止重复。如果相同 `external_id` 的文章再次提交，会被自动忽略。

3. **免费额度**:
   - Workers: 每天 100,000 次请求
   - D1: 每天 5,000,000 次读取
   - D1: 每天 100,000 次写入

---

## 🆘 遇到问题?

1. **数据库已存在**: 如果提示 `news-db` 已存在，可以用 `npx wrangler d1 list` 查看现有数据库的 ID。

2. **401 错误**: 检查请求头中的 `x-api-key` 是否正确。

3. **部署失败**: 确保 `npx wrangler login` 已成功登录。
