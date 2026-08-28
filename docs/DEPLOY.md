# Railway 与 GitHub 部署

## 1. 创建私有 GitHub 仓库

在 GitHub 创建一个空的私有仓库，例如 `mentor-simulator`。不要初始化 README、`.gitignore` 或 License，避免首次推送产生无关冲突。

本项目的 `.env`、SQLite 数据库、依赖目录和构建产物均已被忽略。推送前仍应运行仓库敏感信息检查。

## 2. Railway 后台

1. 在 Railway 新建项目并选择 Deploy from GitHub repo。
2. 选择私有仓库。
3. Railway 会依据根目录的 `Dockerfile` 和 `railway.json` 构建 Node.js 24 后台。
4. 在 Variables 中填写服务端环境变量。
5. 创建一个 Volume，挂载路径设为 `/data`。
6. 将 `DB_PATH` 设置为 `/data/mentor.sqlite`。
7. 在 Networking 中生成一个 HTTPS 域名。

必须配置：

```env
DB_PATH=/data/mentor.sqlite
OPENAI_API_KEY=你的RightAPI Key
OPENAI_BASE_URL=https://rightapi.ai/codex/v1
OPENAI_MODEL=gpt-5.6-sol
FEISHU_APP_ID=你的App ID
FEISHU_APP_SECRET=你的App Secret
FEISHU_VERIFICATION_TOKEN=你的Verification Token
FEISHU_OPEN_ID=
API_ACCESS_TOKEN=至少32位随机字符串
DAILY_CRON=0 20 * * *
WEEKLY_CRON=0 14 * * 6
TZ=Asia/Shanghai
```

Railway 会自行注入 `PORT`，无需手动固定为 4310。

## 3. 飞书回调

在飞书开放平台将事件订阅地址设置为：

```text
https://你的Railway域名/api/feishu/events
```

验证成功后发布应用，私聊机器人发送一句话。后台会保存发送者的 `open_id`，用于后续主动推送。

## 4. Mac 构建

在 GitHub 仓库的 Settings > Secrets and variables > Actions 中创建：

- `VITE_API_URL`：Railway HTTPS 根地址，不带 `/api`。
- `VITE_API_ACCESS_TOKEN`：与 Railway 中的 `API_ACCESS_TOKEN` 完全相同。

进入 Actions > Build macOS app > Run workflow。工作流会分别生成：

- `Mentor-Simulator-x64`：Intel Mac。
- `Mentor-Simulator-arm64`：Apple Silicon Mac（M1/M2/M3/M4 等）。

安装包没有 Apple 签名，仅用于个人内测。首次启动可能需要在 macOS 的“隐私与安全性”中选择仍要打开。
