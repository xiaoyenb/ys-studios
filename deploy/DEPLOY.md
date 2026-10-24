# YS工作室辅助站 · 前后端分离部署说明

本项目已拆分为两个独立服务：

- **前端站点**：Vite 构建的静态文件（含前台首页与独立管理后台 `admin.html`）
- **后端 API**：Express + Node SQLite，仅提供 `/api` 与 `/uploads`，不再托管前端页面

## 0. 系统要求

- Node.js 24+
- npm 11+
- 前端：任意静态托管或 Nginx
- 后端：可运行 Node 的云服务器、容器或 Node 托管环境

## 1. 本地开发

```bash
npm ci
npm run dev:api   # 终端 1：API，端口 3001
npm run dev       # 终端 2：前端，端口 5173
```

- 前台：`http://localhost:5173/`
- 后台：`http://localhost:5173/admin.html`
- API：`http://localhost:3001/api/health`

默认管理员：

- 用户名：`admin`
- 密码：`YSstudio@2026`

登录后台后请立即修改密码，或使用 `YS_ADMIN_PASSWORD` 指定初始密码。

**上线前请先阅读 [SECURITY.md](./SECURITY.md)**：HTTPS、后台 IP 白名单、限流、备份与密钥管理都在里面。

## 2. 前后端分别部署

### 2.1 部署前端

```bash
cp deploy/frontend.env.example .env
# 同域反向代理：VITE_API_BASE_URL=/api
# 前后端不同域名：VITE_API_BASE_URL=https://api.your-domain.com
npm run build
```

将 `dist/` 部署到静态主机或 Nginx。`dist/admin.html` 是独立后台入口，**不要**在前台导航中公开。

### 2.2 部署 API

```bash
export PORT=3001
export YS_DB_PATH=/var/lib/ys-studio/ys-studio.db
export CLIENT_ORIGIN=https://www.your-domain.com
export PUBLIC_API_URL=https://api.your-domain.com
export YS_ADMIN_PASSWORD='your-strong-password'
npm start
```

API 只响应 `/api` 与 `/uploads`，访问根路径会返回 JSON 提示，不会返回前端页面。

可选：把后端打成单文件压缩产物（仍然需要安装 `express` 等依赖）：

```bash
npm run build:server
node server-dist/index.js
```

这能减少源码可读性，但**不是加密**；真正的安全依靠 HTTPS、后台限流、IP 白名单和密钥隔离。

Nginx 配置参考 [nginx.conf](./nginx.conf)：静态根目录指向 `dist`，将 `/api/` 与 `/uploads/` 反向代理到 `127.0.0.1:3001`。

### 2.3 跨域与登录

- 前后端不同域名时，务必设置 `CLIENT_ORIGIN`（逗号分隔多个源）并启用 HTTPS。
- 后台登录使用 Bearer Token（sessionStorage），不依赖第三方 Cookie；同域也兼容 Cookie 会话。
- 上传 Logo 返回的地址由 `PUBLIC_API_URL` 决定，生产环境必须设置为浏览器可访问的 API 域名。

## 3. 虚拟主机

纯静态虚拟主机只能部署前端：

- 上传 `dist/`
- 将 `/api` 指向独立部署的 API 地址
- 若主机不支持反向代理，则在构建时设置 `VITE_API_BASE_URL=https://api.your-domain.com`

后台部署在独立 API 服务的域名下，通过 `.../admin.html` 访问前端后台入口。

## 4. Docker Compose（前后端两个容器）

```bash
cp deploy/server.env.example .env
# 修改管理员密码与域名
docker compose up -d --build
```

- `web`：Nginx 托管前端，端口 `8080`
- `api`：独立 Node API，仅内部暴露 3001
- 数据：`./data` 持久化 SQLite
- 上传：`./public/uploads` 持久化 Logo

访问：

- 前台：`http://服务器IP:8080/`
- 后台：`http://服务器IP:8080/admin.html`

生产环境请修改 `.env` 中的 `CLIENT_ORIGIN`、`PUBLIC_API_URL`，并在 Nginx 外层配置 HTTPS。

## 5. 宝塔 / 内网离线

### 宝塔

1. 前端：新建静态站点，指向 `dist`，配置反向代理 `/api` 与 `/uploads` 到 API 端口。
2. 后端：Node 项目启动 `server/index.js`，设置环境变量。
3. SSL、备份与访问限制在面板中配置。

### 内网离线

- 在相同架构机器构建前端与安装依赖。
- 前端 `dist` 放内网静态服务器；API 运行在内网 Node 服务器。
- 将 `VITE_API_BASE_URL` 设置为内网 API 地址（如 `http://10.0.0.20:3001`），并在 API 设置 `CLIENT_ORIGIN=http://10.0.0.10`。
- AI 构建为本地规则引擎，不依赖外网 API。

## 6. 后台安全建议

- 上线前修改默认管理员密码，设置独立 `YS_ADMIN_PASSWORD`。
- 全站启用 HTTPS。
- 通过 Nginx 限制 `/api/admin` 的访问来源 IP。
- 定期备份 `data/` 与 `public/uploads/`。
- 不要将 `.env`、数据库文件提交到公开仓库。
