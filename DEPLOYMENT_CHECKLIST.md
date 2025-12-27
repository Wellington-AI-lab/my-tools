# Cloudflare Pages 部署清单（从头开始）

## ✅ 步骤 1：创建 Cloudflare Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages**
3. 点击 **Create application** → **Pages** → **Connect to Git**
4. 选择你的 Git 仓库（GitHub/GitLab/Bitbucket）
5. 项目设置：
   - **Project name**：`my-tools`（或你喜欢的名字）
   - **Framework preset**：**Astro**
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - **Root directory**：`/`（默认）

---

## ✅ 步骤 2：创建 KV Namespace（必须）

1. 在 Cloudflare Dashboard → **Workers & Pages → KV**
2. 点击 **Create namespace**
3. 名字：`my_tools_kv`（或任意名字）
4. **复制 Namespace ID**（类似：`abc123def456...`）

---

## ✅ 步骤 3：绑定 KV 到 Pages 项目

1. 回到 **Workers & Pages → Pages → 你的项目名**
2. 点击 **Settings** → **Functions**
3. 找到 **KV namespace bindings** → **Add binding**
4. 填写：
   - **Variable name**：`KV`（**必须完全一致，大小写敏感**）
   - **KV namespace**：选择你刚创建的 namespace
5. 点击 **Save**

---

## ✅ 步骤 4：添加 Secrets（必须）

1. 在 Pages 项目 → **Settings → Variables**
2. 点击 **Add variable** → 选择 **Secret**（不是 Environment Variable）
3. 逐个添加以下 Secrets（**变量名必须完全一致**）：

### 必须的 Secrets：

| 变量名 | 说明 | 如何获取 |
|--------|------|----------|
| `SESSION_SECRET` | 会话签名密钥 | 运行 `node scripts/generate-session-secret.mjs` |
| `SITE_PASSWORD_HASH` | 普通用户密码哈希 | 运行 `node scripts/generate-password-hash-direct.mjs site <你的密码>` |
| `ADMIN_PASSWORD_HASH` | 管理员密码哈希 | 运行 `node scripts/generate-password-hash-direct.mjs admin <你的密码>` |
| `FINNHUB_API_KEY` | Finnhub API Key（主数据源） | 去 [finnhub.io](https://finnhub.io) 注册免费账号获取 |

### 推荐的 Secrets（用于 fallback）：

| 变量名 | 说明 | 如何获取 |
|--------|------|----------|
| `FMP_API_KEY` | Financial Modeling Prep API Key | 去 [financialmodelingprep.com](https://financialmodelingprep.com) 注册免费账号 |
| `POLYGON_API_KEY` | Polygon.io API Key | 去 [polygon.io](https://polygon.io) 注册免费账号 |

**注意**：
- 密码要求：超过 20 位，包含数字、大小写字母、特殊符号
- 所有 Secrets 添加后点击 **Save**

---

## ✅ 步骤 5：触发部署

1. 在 Pages 项目 → **Deployments**
2. 如果还没自动部署，点击 **Retry deployment** 或 push 一次代码触发
3. 等待构建完成（通常 2-5 分钟）

---

## ✅ 步骤 6：验证部署

1. 访问你的 Pages URL（类似：`https://my-tools.pages.dev`）
2. 应该自动跳转到 `/login`
3. 输入你设置的**原始密码**（不是哈希值）登录
4. 登录成功后进入首页，点击 **股票回测** 模块
5. 测试功能：
   - 添加 2-3 个股票代码（如：`AAPL`, `NVDA`, `TSLA`）
   - 设置权重
   - 点击 **计算年化收益率**
   - 应该能看到结果（CAGR、总收益、最大回撤、夏普）

---

## 🔧 如果遇到问题

### 登录失败
- 检查 `SESSION_SECRET`、`SITE_PASSWORD_HASH` 是否正确设置
- 确认密码哈希是用**原始密码**生成的，登录时输入的是**原始密码**

### 计算失败 / 数据获取失败
- 检查 `FINNHUB_API_KEY` 是否正确设置
- 查看 Pages → **Deployments → 最新部署 → Functions logs** 看错误信息

### KV 相关错误
- 确认 KV binding 的变量名是 `KV`（大小写敏感）
- 确认 KV namespace 已创建并绑定

---

## 📝 快速命令参考

```bash
# 生成 SESSION_SECRET
node scripts/generate-session-secret.mjs

# 生成密码哈希（替换 <你的密码>）
node scripts/generate-password-hash-direct.mjs site <你的密码>
node scripts/generate-password-hash-direct.mjs admin <你的密码>
```

