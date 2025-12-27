#!/bin/bash
# Cloudflare Pages 部署脚本

echo "🚀 开始部署到 Cloudflare Pages..."
echo ""

# 检查是否已登录
if ! npx wrangler whoami &>/dev/null; then
  echo "⚠️  请先登录 Cloudflare："
  echo "   npx wrangler login"
  echo ""
  exit 1
fi

# 构建项目
echo "📦 构建项目..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ 构建失败，请检查错误信息"
  exit 1
fi

# 部署到 Cloudflare Pages
echo ""
echo "🌐 部署到 Cloudflare Pages..."
npx wrangler pages deploy dist --project-name=my-tools

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 部署成功！"
  echo ""
  echo "📝 接下来请确保在 Cloudflare Dashboard 中："
  echo "   1. 创建并绑定 KV namespace（变量名：KV）"
  echo "   2. 添加所有必需的 Secrets"
  echo "   3. 访问你的站点测试登录"
else
  echo ""
  echo "❌ 部署失败，请检查错误信息"
  exit 1
fi

