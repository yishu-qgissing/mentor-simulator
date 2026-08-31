import "dotenv/config";
import express from "express";
import cors from "cors";
import { db, now, dashboard, listProjects, setSetting } from "./db.js";
import { extractPage } from "./services/extractor.js";
import { createDailyQuestions, createWeeklyReport, startScheduler } from "./services/scheduler.js";
import { generateMentorReply } from "./services/openai.js";
import { sendFeishuText } from "./services/feishu.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/feishu/events" || !process.env.API_ACCESS_TOKEN) return next();
  if (req.get("x-access-token") !== process.env.API_ACCESS_TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  service: "mentor-simulator",
  version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "local",
  time: now()
}));
app.get("/api/dashboard", (_req, res) => res.json(dashboard()));
app.get("/api/sources", (_req, res) => res.json(db.prepare("SELECT * FROM sources ORDER BY created_at DESC").all()));
app.post("/api/sources", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "请输入有效的公开网页链接" });
  const existing = db.prepare("SELECT * FROM sources WHERE url=?").get(url);
  if (existing) return res.json({ source: existing, duplicate: true });
  try {
    const page = await extractPage(url);
    const result = db.prepare("INSERT INTO sources(url,title,excerpt,content,domain,published_at,created_at) VALUES(?,?,?,?,?,?,?)").run(page.url, page.title, page.excerpt, page.content, page.domain, page.published_at, now());
    res.status(201).json({ source: { id: Number(result.lastInsertRowid), ...page, created_at: now(), status: "ready" } });
  } catch (error) {
    const result = db.prepare("INSERT INTO sources(url,title,excerpt,content,domain,created_at,status) VALUES(?,?,?,?,?,?,?)").run(url, url, "暂时无法读取正文，将保留链接。", "", new URL(url).hostname, now(), "unreadable");
    res.status(201).json({ source: { id: Number(result.lastInsertRowid), url, title: url, status: "unreadable" }, warning: error.message });
  }
});

app.get("/api/projects", (_req, res) => res.json(listProjects()));
app.post("/api/projects", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "项目名称不能为空" });
  const timestamp = now();
  const result = db.prepare("INSERT INTO projects(name,context,created_at,updated_at) VALUES(?,?,?,?)").run(name, String(req.body?.context || ""), timestamp, timestamp);
  res.status(201).json({ project: db.prepare("SELECT * FROM projects WHERE id=?").get(Number(result.lastInsertRowid)) });
});
app.patch("/api/projects/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE projects SET name=?,context=?,updated_at=? WHERE id=?").run(String(req.body?.name || "").trim(), String(req.body?.context || ""), now(), id);
  res.json({ project: db.prepare("SELECT * FROM projects WHERE id=?").get(id) });
});
app.post("/api/todos", (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Todo 内容不能为空" });
  const result = db.prepare("INSERT INTO todos(project_id,title,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(req.body?.projectId || null, title, "todo", String(req.body?.note || ""), now(), now());
  res.status(201).json({ todo: db.prepare("SELECT * FROM todos WHERE id=?").get(Number(result.lastInsertRowid)) });
});
app.patch("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE todos SET status=?,title=?,note=?,updated_at=? WHERE id=?").run(String(req.body?.status || "todo"), String(req.body?.title || ""), String(req.body?.note || ""), now(), id);
  res.json({ todo: db.prepare("SELECT * FROM todos WHERE id=?").get(id) });
});

app.get("/api/questions", (_req, res) => res.json(db.prepare("SELECT * FROM questions ORDER BY created_at DESC LIMIT 30").all()));
app.post("/api/jobs/daily", async (_req, res) => res.json({ questions: await createDailyQuestions() }));
app.post("/api/jobs/weekly", async (_req, res) => res.json({ report: await createWeeklyReport() }));

app.post("/api/feishu/events", async (req, res) => {
  const event = req.body;
  if (event.type === "url_verification") {
    if (process.env.FEISHU_VERIFICATION_TOKEN && event.token !== process.env.FEISHU_VERIFICATION_TOKEN) return res.status(403).json({ error: "invalid token" });
    return res.json({ challenge: event.challenge });
  }
  if (process.env.FEISHU_VERIFICATION_TOKEN && event.header?.token !== process.env.FEISHU_VERIFICATION_TOKEN) return res.status(403).json({ error: "invalid token" });
  const eventId = event.header?.event_id;
  if (eventId && db.prepare("SELECT 1 FROM processed_events WHERE event_id=?").get(eventId)) return res.json({ code: 0 });
  if (eventId) db.prepare("INSERT INTO processed_events(event_id,created_at) VALUES(?,?)").run(eventId, now());
  res.json({ code: 0 });
  const text = event.event?.message?.content;
  const senderOpenId = event.event?.sender?.sender_id?.open_id;
  if (!text || event.event?.sender?.sender_type === "app") return;
  try {
    if (senderOpenId) setSetting("feishu_open_id", senderOpenId);
    const decoded = JSON.parse(text).text || text;
    const recentQuestions = db.prepare("SELECT * FROM questions ORDER BY created_at DESC LIMIT 3").all().reverse();
    const requestedIndex = Number(String(decoded).trim().match(/^([123])(?:[.、：:]|\s)/)?.[1] || 0) - 1;
    const question = recentQuestions[requestedIndex] || recentQuestions.at(-1);
    if (!question) return;
    db.prepare("INSERT INTO messages(question_id,role,content,created_at) VALUES(?,?,?,?)").run(question.id, "user", decoded, now());
    db.prepare("UPDATE questions SET answered_at=? WHERE id=?").run(now(), question.id);
    const conversation = db.prepare("SELECT role,content FROM messages WHERE question_id=? ORDER BY created_at ASC").all(question.id);
    const context = `问题：${question.prompt}\n对话记录：\n${conversation.map((item) => `${item.role === "user" ? "用户" : "导师"}：${item.content}`).join("\n")}`;
    const reply = await generateMentorReply(context);
    db.prepare("INSERT INTO messages(question_id,role,content,created_at) VALUES(?,?,?,?)").run(question.id, "assistant", reply, now());
    await sendFeishuText(reply, senderOpenId);
  } catch (error) {
    console.error("处理飞书事件失败", error);
  }
});

const port = Number(process.env.PORT || 4310);
app.listen(port, () => console.log(`Mentor Simulator server listening on http://localhost:${port}`));
startScheduler();

export { app };
