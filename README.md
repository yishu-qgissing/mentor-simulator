# Mentor Simulator

个人信息输入、思考追问和周期复盘工具的第一版骨架。

## Quick start

```powershell
npm install
Copy-Item apps/server/.env.example apps/server/.env
npm run dev
```

服务端默认运行在 `http://localhost:4310`，桌面端会启动一个可切换的菜单栏/托盘窗口。

OpenAI-compatible 模型服务、飞书和定时任务均通过 `apps/server/.env` 配置。未配置凭据时，服务仍可使用演示数据和本地流程。

完整配置见 [第一版配置指南](docs/SETUP.md)，系统边界见 [架构说明](docs/ARCHITECTURE.md)。

上线步骤见 [Railway 与 GitHub 部署](docs/DEPLOY.md)。
