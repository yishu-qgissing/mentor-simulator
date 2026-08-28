# 第一版配置指南

## 1. 本地开发

需要 Node.js 24 或更新版本。

```powershell
npm install
Copy-Item apps/server/.env.example apps/server/.env
Copy-Item apps/desktop/.env.example apps/desktop/.env
npm run dev
```

- 后台：`http://localhost:4310`
- 桌面界面：`http://127.0.0.1:5174`
- 未配置 OpenAI 和飞书时，日报使用三条演示问题，飞书发送进入演示模式。

## 2. OpenAI-compatible 模型服务

在 `apps/server/.env` 中配置：

```env
OPENAI_API_KEY=你的_API_Key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5-mini
```

Key 只存在后台环境变量中，不会被打进 Mac 客户端。日报使用 Responses API；周报尝试使用网页搜索补充近期动态，若模型或账号不支持网页搜索，会自动退回已有信息源并标明限制。

使用 RightAPI 时配置为：

```env
OPENAI_API_KEY=你的_RightAPI_Key
OPENAI_BASE_URL=https://rightapi.ai/codex/v1
OPENAI_MODEL=gpt-5.6-sol
```

`OPENAI_BASE_URL` 需要包含服务商提供的版本前缀，但不要在末尾填写 `/responses`；应用会自动拼接。

## 3. 飞书自建应用

在飞书开放平台创建企业自建应用后：

1. 添加“机器人”能力。
2. 开通机器人发送消息、读取用户发给机器人的单聊消息等必要权限。
3. 在事件订阅中添加“接收消息”事件。
4. 将事件请求地址设置为 `https://你的后台域名/api/feishu/events`。
5. 第一版不启用事件加密；填写 Verification Token 用于校验回调。
6. 发布应用，并在飞书中打开机器人私聊，发送任意一条消息。后台会自动记住你的 `open_id`，以后日报和周报会发到这个会话。

后台环境变量：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_VERIFICATION_TOKEN=xxx
FEISHU_OPEN_ID=
```

`FEISHU_OPEN_ID` 一般可以留空；首次私聊机器人后会自动保存。若需要在首次私聊前主动推送，也可以手动填写。

## 4. 云端后台

后台需要持续在线，才能在 Mac 休眠时照常推送。部署时至少配置：

```env
DB_PATH=/持久化磁盘/mentor.sqlite
OPENAI_API_KEY=xxx
OPENAI_BASE_URL=https://rightapi.ai/codex/v1
OPENAI_MODEL=gpt-5.6-sol
FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx
FEISHU_VERIFICATION_TOKEN=xxx
API_ACCESS_TOKEN=生成一段足够长的随机字符串
DAILY_CRON=0 20 * * *
WEEKLY_CRON=0 14 * * 6
TZ=Asia/Shanghai
```

云端必须挂载持久化磁盘，否则重新部署会丢失历史链接、Todo 和对话。

Mac 客户端构建前配置：

```env
VITE_API_URL=https://你的后台域名
VITE_API_ACCESS_TOKEN=与后台相同的访问令牌
```

## 5. 打包 Mac 应用

macOS 上执行：

```bash
npm install
npm --workspace apps/desktop run pack:mac
```

产物位于 `apps/desktop/release`。未配置 Apple Developer 签名时，首次打开可能需要在 macOS“隐私与安全性”中手动允许；正式长期使用建议后续增加签名和公证。

## 6. 时间规则

- 日报：每天 20:00，读取近 7 天的网页、项目、Todo、问题和对话。
- 周报：每周六 14:00，读取近 30 天上下文，并重点总结当周思考。
- 时区：`Asia/Shanghai`。
