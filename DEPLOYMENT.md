# 部署指南（Cloudflare Pages 免费版）

本项目已从旧的 Next.js / OpenNext / D1 模式切换为：
- **Astro + Cloudflare Pages Functions**（`/api/*`）
- **Cloudflare KV**（标的池/标签/偏好 + 行情缓存）
- 股票回测 **按需抓取**（Finnhub 主用 + FMP/Polygon fallback），不再维护历史价格数据库

---

## 1) Cloudflare Pages 项目设置

1. 在 Cloudflare Dashboard 创建 **Pages** 项目并连接你的 Git 仓库。
2. Build 配置：
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`

---

## 2) 创建并绑定 KV（必须）

在 Cloudflare Dashboard：
- 进入 **Workers & Pages → KV**
- 创建一个 KV Namespace（例如：`my_tools_kv`）
- 回到你的 **Pages 项目 → Settings → Functions → KV bindings**
  - 添加 binding：
    - **Variable name**：`KV`
    - **KV namespace**：选择你刚创建的 `my_tools_kv`

> 说明：项目使用 `KV` 作为唯一 KV binding（同时也供 Astro 的 session driver 使用）。

---

## 3) 配置 Secrets（必须）

在 **Pages 项目 → Settings → Variables** 中添加 **Secrets**（推荐用 Secret 类型，而不是 plain env var）：

### 3.1 站点鉴权
- `SESSION_SECRET`：随机字符串（建议 32+ bytes）
- `SITE_PASSWORD_HASH`：普通密码的 SHA-256 hex
- `ADMIN_PASSWORD_HASH`：管理员密码的 SHA-256 hex

生成方式：
```bash
node scripts/generate-session-secret.mjs
node scripts/generate-password-hash.mjs site
node scripts/generate-password-hash.mjs admin
```

### 3.2 行情数据源（至少 Finnhub）
- `FINNHUB_API_KEY`（必须）
- `FMP_API_KEY`（推荐）
- `POLYGON_API_KEY`（推荐）

---

## 4) 发布与验证

1. 触发 Pages 部署（push 到主分支，或手动 redeploy）。
2. 访问站点：
   - 首次会跳到 `/login`
3. 登录成功后：
   - 首页应看到模块卡片
   - 进入 `/tools/stocks` 测试回测计算
   - 点击“写入标的池”后，右侧 watchlist 应能加载并点击添加

---

## 5) 常见问题

### 5.1 构建日志提示 “Invalid binding `KV`”
原因：Pages 项目未绑定 KV 或 variable name 不是 `KV`。  
解决：确认 **Functions → KV bindings** 配置正确。

### 5.2 回测请求失败/慢/偶发 429
原因：外部行情源免费额度或网络波动。  
对策：
- KV 缓存会显著减少重复请求
- 建议同时配置 FMP/Polygon 作为 fallback

