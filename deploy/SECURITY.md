# 安全部署与防入侵清单

> 这份清单按“最容易被攻击 → 最应该先做”的顺序排列。源码加密不能替代服务器防护，重点是保护后台账号、API Key 和数据文件。

## 一、上线前必须做

1. **修改默认管理员密码**
   - 默认账号仅用于首次启动；登录 `/admin.html` 后立即在「管理员与安全」修改密码。
   - 密码至少 12 位，混合大小写、数字和符号，不要与其他站点重复。

2. **全站启用 HTTPS**
   - 使用 Nginx + certbot：`certbot --nginx -d your-domain.com`。
   - HTTPS 启用后确认响应头出现 `Strict-Transport-Security`。
   - 后台会话 Cookie 已设置为 `HttpOnly`、`SameSite=Strict`，HTTPS 下自动加 `Secure`。

3. **限制后台入口**
   - 在 `deploy/nginx.conf` 的 `location = /admin.html` 中取消 `allow/deny` 注释，改成自己的固定公网 IP。
   - 或设置环境变量 `ADMIN_ALLOWED_IPS=你的公网IP`，限制整个 `/api/admin` 只允许该 IP 访问。
   - 不要把后台地址发到公开群聊或文章里。

4. **配置反向代理限流**
   - 仓库里的 `deploy/nginx.conf` 已内置：
     - `/api/admin/login`：10 次/分钟（配合程序内 6 次/10 分钟锁定）；
     - `/api/`：20 次/秒，突发 40；
     - 禁止访问 `.env`、`.db`、`.sqlite`、`.log`、`.bak` 等文件。
   - 宝塔 / 1Panel 用户把同样的 `limit_req_zone` 和 `location` 配置粘贴到站点配置中。

5. **隔离数据与密钥**
   - `data/ys-studio.db` 只放在服务器，权限设为 `600`，属主为运行 Node 的账号。
   - AI Key、语音 Key 只填在后台「站点设置」，不要写进前端代码、Git 仓库或截图。
   - 不要把 `data/`、`.env`、`node_modules/` 放进网站根目录。

6. **备份**
   - 每天备份 `data/ys-studio.db`（SQLite 可在运行时用 `.backup` 或直接复制 WAL 后的文件）。
   - 备份文件放到另一台机器或对象存储，至少保留 7 天。
   - 定期在后台「数据与日志」导出 JSON 备份。

## 二、程序已经内置的防护

- 管理员密码使用 `scrypt` 加盐哈希，不保存明文。
- 会话令牌在数据库中只保存 SHA-256 哈希；Cookie 为 `HttpOnly` + `SameSite=Strict`，7 天过期。
- 登录失败限流：同一 IP 6 次 / 10 分钟锁定；同一账号 8 次 / 15 分钟锁定。
- `/api/ai/chat`：20 次 / 10 分钟、200 次 / 天，按 IP 限制，防止真实 AI Key 被刷。
- `/api/speech/evaluate`：10 次 / 10 分钟、100 次 / 天。
- 反馈提交：5 次 / 10 分钟；访问统计与 AI 统计也有频率限制。
- 所有 SQL 使用参数化查询；上传仅允许 PNG/JPEG/WebP 且不超过 3MB。
- 前台 AI、公开配置接口不会返回 `aiApiKey`、`speechApiKey`、`aiEndpoint`。
- 安全响应头：`X-Content-Type-Options`、`X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy`、HTTPS 下的 HSTS。
- 后台写操作记录审计日志；数据导出仅站点所有者可用。

## 三、建议再加的防护

- **fail2ban**：监控 Nginx 的 401/429 日志，自动封禁反复尝试登录的 IP。
- **WAF / CDN**：Cloudflare、雷池 WAF、宝塔防火墙都可以拦截常见 SQL 注入、XSS、扫描器。
- **2FA**：如果部署环境允许，在 Nginx 层加 `auth_request` + TOTP，或只允许通过 VPN / Tailscale 访问后台。
- **系统更新**：Node.js、Nginx、系统依赖保持最新；不要使用过期版本。
- **最小权限**：Node 进程不要用 root 运行；数据库目录不要给 Web 用户写权限。
- **监控**：关注 429、401、502 激增；发现异常立即改密码、清理会话、检查审计日志。
- **隐藏版本**：Nginx 已设置 `server_tokens off`；Node 已关闭 `x-powered-by`。

## 四、关于“源码加密”

- **前端源码无法真正加密**：浏览器必须下载 JS 才能运行，压缩、混淆只能提高阅读门槛，不能阻止有心人还原。不要把 API Key、数据库密码等秘密放进前端。
- **后端可以打包/混淆**：例如用 esbuild 打成单文件并压缩，但运行时仍可被分析。真正的安全来自：服务器权限、后台限流、密钥只在服务端、HTTPS、备份与监控。
- 如果确实需要保护后端逻辑，建议把 API 部署在只能通过内网/VPN 访问的机器上，前面加反向代理和鉴权，而不是依赖“加密源码”。

## 五、怀疑被入侵时的处理顺序

1. 立即修改管理员密码，并在「管理员与安全」删除其他可疑账号。
2. 停止 API 服务，备份当前数据库和日志后再排查。
3. 检查 `audit_logs` 是否有异常登录、设置修改、数据导出。
4. 轮换 AI Key、语音 Key；检查服务器是否被植入定时任务或 SSH 公钥。
5. 从干净备份恢复，升级依赖，重新配置防火墙与限流。
