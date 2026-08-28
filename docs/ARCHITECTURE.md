# 第一版架构与边界

```text
Mac 菜单栏客户端
  ├─ 快速提交公开网页
  ├─ 维护项目与 Todo
  └─ 查看最近输入
             │ HTTPS
             ▼
Node.js 后台 + SQLite 持久化
  ├─ 公开网页正文提取与去重
  ├─ 近 7/30 天上下文组装
  ├─ OpenAI Responses API
  ├─ 20:00 日报 / 周六 14:00 周报
  └─ 飞书事件回调与消息发送
             │
             ▼
飞书机器人
  ├─ 推送三个问题
  ├─ 接收用户回答
  └─ mentor 追问并保存对话
```

## 数据

- `sources`：链接、标题、正文、来源和抓取状态。
- `projects` / `todos`：工作背景与当前行动。
- `questions` / `messages`：每日问题、回答和追问。
- `reports`：周报。
- `settings`：首次私聊后记录飞书接收身份。
- `processed_events`：飞书事件去重。

## 明确不包含

- 登录后页面、付费墙、视频正文和公司内部资料。
- 微信机器人、移动端 App 和浏览器扩展。
- 多用户、组织权限、复杂知识图谱和自动代写答案。
- 飞书事件加密；第一版使用 Verification Token 和 HTTPS。上线前若必须启用 Encrypt Key，需要再加入解密处理。
