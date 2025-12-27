# 手动部署指南（方式 2）

## ⚠️ 重要说明

Cloudflare Pages 的"上传项目"功能**只支持静态文件**，我们的项目需要 SSR（服务器端渲染）和 Functions，所以**不能用手动上传**。

## ✅ 推荐方案：使用 Wrangler CLI（一条命令）

### 步骤 1：登录 Cloudflare

在终端运行：

```bash
cd /Users/wellington/Stock_Backtest_Website
npx wrangler login
```

会打开浏览器，点击"允许"授权。

### 步骤 2：部署

运行部署脚本：

```bash
./deploy.sh
```

或者手动运行：

```bash
npm run build
npx wrangler pages deploy dist --project-name=my-tools
```

### 步骤 3：配置 KV 和 Secrets

部署完成后，在 Cloudflare Dashboard：

1. **创建 KV Namespace**：
   - Workers & Pages → KV → Create namespace
   - 名字：`my_tools_kv`
   - 复制 Namespace ID

2. **绑定 KV**：
   - Pages → my-tools → Settings → Functions
   - KV namespace bindings → Add binding
   - Variable name：`KV`
   - 选择你创建的 namespace

3. **添加 Secrets**：
   - Pages → my-tools → Settings → Variables
   - Add variable → Secret
   - 添加以下 Secrets：

| 变量名 | 值 |
|--------|-----|
| `SESSION_SECRET` | `99d427889a030180474c120e921ebdd2fb64117fd45edf0ea4cbe8cb2f9e23f5` |
| `SITE_PASSWORD_HASH` | `e0f3862c9d915d5c71d61035be46a92708f8889453c66ed78df90e99d679ffbe` |
| `ADMIN_PASSWORD_HASH` | `b343be7b05e67d383e3526a847cc1f8a72651f3fbab7f08b9e234e1f63e3d1eb` |
| `FINNHUB_API_KEY` | （去 finnhub.io 注册获取） |

### 步骤 4：测试

访问你的 Pages URL（类似：`https://my-tools.pages.dev`），测试登录和功能。

---

## 🔄 以后更新代码

每次修改代码后，只需要运行：

```bash
./deploy.sh
```

或者：

```bash
npm run build
npx wrangler pages deploy dist --project-name=my-tools
```

---

## ❓ 如果遇到问题

### 部署失败
- 检查是否已登录：`npx wrangler whoami`
- 检查构建是否成功：`npm run build`

### 登录失败
- 确认 Secrets 都已正确添加
- 确认 KV binding 的变量名是 `KV`（大小写敏感）

### 功能不工作
- 检查 `FINNHUB_API_KEY` 是否正确
- 查看 Pages → Deployments → Functions logs 看错误信息

