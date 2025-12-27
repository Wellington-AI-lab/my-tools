#!/bin/bash
# 完整备份脚本：my-tools 项目

set -e  # 遇到错误立即退出

BACKUP_DIR="/Users/wellington"
PROJECT_DIR="/Users/wellington/my-tools"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="my-tools-backup-${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo "📦 开始创建 my-tools 完整备份..."
echo "备份目录: ${BACKUP_PATH}"

# 创建临时备份目录
mkdir -p "${BACKUP_PATH}"

# 复制所有源代码和配置文件（排除 node_modules、dist、.astro 等）
echo "📂 复制源代码和配置文件..."

# 使用 rsync 或 cp，排除不需要的目录
rsync -av \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.astro' \
  --exclude='.wrangler' \
  --exclude='.cache' \
  --exclude='coverage' \
  --exclude='.nyc_output' \
  --exclude='*.log' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.dev.vars' \
  "${PROJECT_DIR}/" "${BACKUP_PATH}/"

# 确保 package-lock.json 被包含（用于精确恢复依赖版本）
if [ -f "${PROJECT_DIR}/package-lock.json" ]; then
  cp "${PROJECT_DIR}/package-lock.json" "${BACKUP_PATH}/"
fi

echo "✅ 文件复制完成"

# 创建备份清单
echo "📋 生成备份清单..."
find "${BACKUP_PATH}" -type f | sort > "${BACKUP_PATH}/BACKUP_MANIFEST.txt"
FILE_COUNT=$(wc -l < "${BACKUP_PATH}/BACKUP_MANIFEST.txt" | tr -d ' ')
echo "备份文件总数: ${FILE_COUNT}"

# 创建压缩包
echo "🗜️  创建压缩包..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}/"
COMPRESSED_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo "压缩包大小: ${COMPRESSED_SIZE}"

# 清理临时目录
rm -rf "${BACKUP_PATH}"

echo ""
echo "✅ 备份完成！"
echo "📦 备份文件: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "📊 文件数量: ${FILE_COUNT}"
echo "💾 压缩大小: ${COMPRESSED_SIZE}"

