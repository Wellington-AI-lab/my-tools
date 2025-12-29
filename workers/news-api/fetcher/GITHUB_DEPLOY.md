# GitHub Actions 部署教程

---

## 📁 项目结构

```
fetcher/
├── .github/
│   └── workflows/
│       └── daily_news.yml      # GitHub Actions 配置
├── fetcher.py                   # 抓取脚本
├── requirements.txt             # Python 依赖
└── README.md                    # 本文件
```

---

## 🚀 部署步骤

### 第 1 步：创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角 **+** → **New repository**
3. 填写仓库名（如 `news-fetcher`）
4. 选择 **Public** 或 **Private**
5. 点击 **Create repository**

### 第 2 步：上传代码到 GitHub

在你的本地终端运行：

```bash
cd ~/my-tools/workers/news-api/fetcher

# 初始化 Git (如果还没有)
git init

# 添加所有文件
git add .

# 提交
git commit -m "Add RSS news fetcher with GitHub Actions"

# 关联远程仓库 (替换成你的用户名和仓库名)
git remote add origin https://github.com/你的用户名/news-fetcher.git

# 推送
git push -u origin main
```

---

## 🔐 第 3 步：添加 GitHub Secrets

这是最重要的一步！不要把 API 密钥直接写在代码里。

### 3.1 打开 Secrets 设置页面

1. 进入你的 GitHub 仓库页面
2. 点击顶部 **Settings** (设置) 标签
3. 在左侧菜单找到 **Secrets and variables** (密钥和变量)
4. 点击 **Actions**
5. 点击 **New repository secret** 按钮

### 3.2 添加 API_URL

| 字段 | 值 |
|------|-----|
| **Name** | `API_URL` |
| **Secret** | `https://news-api.zhusen-wang.workers.dev/add` |

点击 **Add secret**

### 3.3 添加 API_KEY

| 字段 | 值 |
|------|-----|
| **Name** | `API_KEY` |
| **Secret** | `56299bfa63f7cacc3d3b59a6084ccd095d7d5858c3216c5b109618c2f07b5da2` |

点击 **Add secret**

---

## ✅ 第 4 步：测试手动运行

1. 在 GitHub 仓库页面，点击 **Actions** 标签
2. 你会看到工作流 `RSS News Fetcher`
3. 点击右侧 **Run workflow** 按钮
4. 选择分支（通常是 `main`）
5. 点击绿色的 **Run workflow** 按钮

如果一切正常，你会看到绿色的 ✅。点击进入可以查看运行日志。

---

## 📅 定时运行说明

工作流配置为每 6 小时运行一次：

| 运行时间 (UTC) | 运行时间 (北京时间) |
|----------------|---------------------|
| 00:00 | 08:00 |
| 06:00 | 14:00 |
| 12:00 | 20:00 |
| 18:00 | 02:00 |

> 注意：GitHub Actions 的 cron 使用 UTC 时间，可能需要根据你的时区调整。

---

## 🔍 查看运行日志

1. 进入仓库的 **Actions** 页面
2. 点击某次运行记录
3. 点击左侧的任务名称
4. 可以看到详细的日志输出

---

## ⚠️ 常见问题

### Q: 运行失败，提示 401 错误
**A:** 检查 GitHub Secrets 中的 `API_KEY` 是否正确。

### Q: 定时任务没有触发
**A:**
- GitHub Actions 的定时可能会有延迟（最多 1 小时）
- 确保仓库中有至少一次 git push，否则定时任务不会启动

### Q: 如何修改运行频率
**A:** 编辑 `.github/workflows/daily_news.yml` 中的 `cron` 字段：
```yaml
schedule:
  - cron: '0 */6 * * *'  # 每 6 小时
```
常用示例：
- `0 0 * * *` - 每天一次
- `0 */2 * * *` - 每 2 小时
- `*/30 * * * *` - 每 30 分钟

---

## 📊 监控数据

查看抓取的数据：

```bash
# 获取最新文章
curl https://news-api.zhusen-wang.workers.dev/latest

# 获取统计信息
curl https://news-api.zhusen-wang.workers.dev/stats
```
