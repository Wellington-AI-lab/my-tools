#!/bin/bash

# 项目备份脚本
# 用途：创建完整的项目备份，排除不必要的文件（node_modules, dist等）
# 使用方法：./scripts/backup.sh [备份目标路径]

set -e  # 遇到错误立即退出

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 备份目标路径（如果未指定，使用当前目录）
BACKUP_DIR="${1:-$PROJECT_ROOT}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="my-tools-backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo "=========================================="
echo "项目备份工具"
echo "=========================================="
echo "项目路径: $PROJECT_ROOT"
echo "备份目标: $BACKUP_PATH"
echo "时间戳: $TIMESTAMP"
echo ""

# 创建临时备份目录
TEMP_BACKUP="/tmp/${BACKUP_NAME}"
rm -rf "$TEMP_BACKUP"
mkdir -p "$TEMP_BACKUP"

echo "正在收集文件..."

# 复制源代码目录
echo "  - 源代码 (src/)"
cp -r "$PROJECT_ROOT/src" "$TEMP_BACKUP/"

# 复制配置文件
echo "  - 配置文件"
cp "$PROJECT_ROOT/package.json" "$TEMP_BACKUP/"
cp "$PROJECT_ROOT/package-lock.json" "$TEMP_BACKUP/"
cp "$PROJECT_ROOT/tsconfig.json" "$TEMP_BACKUP/"
cp "$PROJECT_ROOT/tailwind.config.js" "$TEMP_BACKUP/"
cp "$PROJECT_ROOT/postcss.config.js" "$TEMP_BACKUP/"
cp "$PROJECT_ROOT/astro.config.mjs" "$TEMP_BACKUP/"
cp "$PROJECT_ROOT/vitest.config.ts" "$TEMP_BACKUP/"
cp "$PROJECT_ROOT/env.d.ts" "$TEMP_BACKUP/"

# 复制脚本目录
echo "  - 脚本文件 (scripts/)"
cp -r "$PROJECT_ROOT/scripts" "$TEMP_BACKUP/"

# 复制文档文件
echo "  - 文档文件"
cp "$PROJECT_ROOT/README.md" "$TEMP_BACKUP/" 2>/dev/null || true
cp "$PROJECT_ROOT/STYLE_GUIDE.md" "$TEMP_BACKUP/" 2>/dev/null || true
cp "$PROJECT_ROOT/DEPLOYMENT.md" "$TEMP_BACKUP/" 2>/dev/null || true
cp "$PROJECT_ROOT/DEPLOYMENT_CHECKLIST.md" "$TEMP_BACKUP/" 2>/dev/null || true
cp "$PROJECT_ROOT/MANUAL_DEPLOY.md" "$TEMP_BACKUP/" 2>/dev/null || true
cp "$PROJECT_ROOT/TEST_REPORT.md" "$TEMP_BACKUP/" 2>/dev/null || true
cp "$PROJECT_ROOT/deploy.sh" "$TEMP_BACKUP/" 2>/dev/null || true

# 复制 .gitignore（用于恢复时参考）
echo "  - Git 配置"
cp "$PROJECT_ROOT/.gitignore" "$TEMP_BACKUP/" 2>/dev/null || true

# 复制 workers 目录
echo "  - Workers 目录"
cp -r "$PROJECT_ROOT/workers" "$TEMP_BACKUP/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/cron-worker" "$TEMP_BACKUP/" 2>/dev/null || true

# 创建备份信息文件
echo "  - 备份信息"
cat > "$TEMP_BACKUP/BACKUP_INFO.txt" <<EOF
项目备份信息
========================================
备份时间: $(date)
备份版本: $(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo "未知")
Node 版本: $(node --version)
npm 版本: $(npm --version)

备份内容:
- 源代码 (src/)
- 配置文件 (package.json, tsconfig.json, etc.)
- 脚本文件 (scripts/)
- 文档文件 (*.md)
- Git 配置 (.gitignore)

排除内容:
- node_modules/ (可通过 npm install 恢复)
- dist/ (构建产物，可通过 npm run build 生成)
- coverage/ (测试覆盖率报告)
- .astro/ (Astro 缓存)
- .git/ (Git 历史，如需完整历史请单独备份)

恢复步骤:
1. 解压备份文件
2. 进入项目目录
3. 运行: npm install
4. 运行: npm run build (如需要)
5. 配置环境变量（参考 DEPLOYMENT.md）

重要提示:
- 备份不包含敏感信息（如 .env 文件）
- 备份不包含 Vercel KV 数据（需单独备份）
- 备份不包含 Postgres 数据库数据（需单独备份）
EOF

# 创建压缩包
echo ""
echo "正在创建压缩包..."
cd /tmp

# 尝试创建 tar.gz，如果失败则创建 zip
if command -v tar >/dev/null 2>&1; then
    if tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME" 2>/dev/null; then
        COMPRESSED_FILE="${BACKUP_NAME}.tar.gz"
        COMPRESS_TYPE="tar.gz"
    elif command -v zip >/dev/null 2>&1; then
        if zip -r "${BACKUP_NAME}.zip" "$BACKUP_NAME" > /dev/null 2>&1; then
            COMPRESSED_FILE="${BACKUP_NAME}.zip"
            COMPRESS_TYPE="zip"
        else
            echo "错误: 无法创建压缩包"
            exit 1
        fi
    else
        echo "错误: 未找到 tar 或 zip 命令"
        exit 1
    fi
elif command -v zip >/dev/null 2>&1; then
    if zip -r "${BACKUP_NAME}.zip" "$BACKUP_NAME" > /dev/null 2>&1; then
        COMPRESSED_FILE="${BACKUP_NAME}.zip"
        COMPRESS_TYPE="zip"
    else
        echo "错误: 无法创建压缩包"
        exit 1
    fi
else
    echo "错误: 未找到 tar 或 zip 命令"
    exit 1
fi

# 复制压缩包到目标位置（使用 cp 而不是 mv）
cp "$COMPRESSED_FILE" "$BACKUP_PATH.$COMPRESS_TYPE"

# 清理临时文件
rm -rf "$TEMP_BACKUP"

# 显示备份信息
FILE_SIZE=$(du -h "$BACKUP_PATH.$COMPRESS_TYPE" | cut -f1)
echo ""
echo "=========================================="
echo "备份完成！"
echo "=========================================="
echo "备份文件: $BACKUP_PATH.$COMPRESS_TYPE"
echo "文件大小: $FILE_SIZE"
echo ""
echo "备份内容摘要:"
echo "  ✓ 源代码 (src/)"
echo "  ✓ 配置文件"
echo "  ✓ 脚本文件"
echo "  ✓ 文档文件"
echo ""
echo "恢复步骤请查看备份文件中的 BACKUP_INFO.txt"
echo "=========================================="

