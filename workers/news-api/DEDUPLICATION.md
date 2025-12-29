# 语义去重系统 - 部署指南

## 架构概述

```
写入请求 → /add
    ↓
1. 检查 external_id (快速去重)
    ↓
2. 生成 Embedding 向量 (AI)
    ↓
3. Vectorize 查询最相似内容
    ↓
4. 相似度 > 0.85?
   ├─ 是 → 返回 duplicate (跳过)
   └─ 否 → 写入 D1 + Vectorize
```

## 初始化步骤

### 1. 创建 Vectorize 索引

```bash
cd workers/news-api
npx wrangler vectorize create news-index --dimensions=384 --metric=cosine
```

执行后将输出 `index_id`，将其填入 `wrangler.toml`：

```toml
[[vectorize]]
binding = "VECTORS"
index_name = "news-index"
index_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 填入这里
```

### 2. 部署 Worker

```bash
npx wrangler deploy
```

## 配置说明

| 参数 | 值 | 说明 |
|------|-----|------|
| 模型 | `@cf/baai/bge-small-en-v1.5` | Cloudflare AI Embedding 模型 |
| 维度 | 384 | 向量维度 |
| 相似度阈值 | 0.85 | 超过此值视为重复 |
| 距离度量 | cosine | 余弦相似度 |

## 费用说明

- **Workers AI**: 免费 (每月 10,000 次请求)
- **Vectorize**: 免费 (1M 向量 + 30K 查询/月)
- **D1 数据库**: 免费 (5GB 存储)

完全免费即可运行！

## API 响应示例

### 成功插入（新文章）
```json
{
  "success": true,
  "inserted": 1,
  "skipped": 0
}
```

### 检测到重复
```json
{
  "success": true,
  "inserted": 0,
  "skipped": 1,
  "duplicates": [
    {
      "title": "OpenAI 发布 GPT-5",
      "similarity": 0.92
    }
  ]
}
```

## 降级策略

如果 AI 服务不可用：
- 自动降级为普通写入
- 不会影响数据入库
- 记录警告日志
