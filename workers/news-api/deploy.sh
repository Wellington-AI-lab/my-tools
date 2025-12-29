#!/bin/bash
# 新闻聚合 API 部署脚本

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "========================================"
echo "   新闻聚合 API - 一键部署脚本"
echo "========================================"
echo ""

# 检查是否登录
echo "1️⃣  检查 Cloudflare 登录状态..."
if ! npx wrangler whoami &>/dev/null; then
    echo "❌ 未登录 Cloudflare，请先运行:"
    echo "   npx wrangler login"
    exit 1
fi
echo "✅ 已登录"
echo ""

# 创建 D1 数据库
echo "2️⃣  创建 D1 数据库..."
DB_OUTPUT=$(npx wrangler d1 create news-db 2>&1)
echo "$DB_OUTPUT"

# 提取 database_id
DATABASE_ID=$(echo "$DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)

if [ -n "$DATABASE_ID" ]; then
    # 更新 wrangler.toml
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/database_id = \"<YOUR_DATABASE_ID>\"/database_id = \"$DATABASE_ID\"/" wrangler.toml
    else
        # Linux
        sed -i "s/database_id = \"<YOUR_DATABASE_ID>\"/database_id = \"$DATABASE_ID\"/" wrangler.toml
    fi
    echo "✅ 数据库 ID 已写入 wrangler.toml: $DATABASE_ID"
else
    echo "⚠️  数据库可能已存在，跳过创建"
    # 尝试从现有配置读取
    DATABASE_ID=$(grep "database_id" wrangler.toml | grep -v "<YOUR_DATABASE_ID>" | cut -d'"' -f2 || true)
    if [ -z "$DATABASE_ID" ]; then
        echo "❌ 请手动在 wrangler.toml 中填入正确的 database_id"
        exit 1
    fi
fi
echo ""

# 应用数据库结构
echo "3️⃣  应用数据库结构..."
npx wrangler d1 execute news-db --local --file=./schema.sql
npx wrangler d1 execute news-db --file=./schema.sql
echo "✅ 数据库表结构已创建"
echo ""

# 设置 API Secret
echo "4️⃣  设置 API Secret..."
echo "请输入你的 API 密钥 (用于鉴权):"
read -s -p "> " API_SECRET
echo ""
npx wrangler secret put API_SECRET <<< "$API_SECRET"
echo "✅ API Secret 已设置"
echo ""

# 安装依赖
echo "5️⃣  安装依赖..."
if [ ! -d "node_modules" ]; then
    npm install
fi
echo "✅ 依赖已安装"
echo ""

# 部署 Worker
echo "6️⃣  部署 Worker..."
npx wrangler deploy
echo "✅ Worker 部署成功!"
echo ""

# 获取 Worker URL
WORKER_URL="https://news-api.${CF_ACCOUNT_ID?:your-subdomain}.workers.dev"
echo "========================================"
echo "   🎉 部署完成!"
echo "========================================"
echo ""
echo "API 端点:"
echo "  - POST: ${WORKER_URL}/add"
echo "  - GET:  ${WORKER_URL}/latest"
echo "  - GET:  ${WORKER_URL}/stats"
echo ""
echo "测试命令:"
echo "  curl ${WORKER_URL}/latest"
echo ""
