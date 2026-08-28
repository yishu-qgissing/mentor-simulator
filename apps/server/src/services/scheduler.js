import cron from "node-cron";
import { db, now, localDate, getSetting, listProjects, listSources } from "../db.js";
import { generateDailyQuestions, generateWeeklyReport } from "./openai.js";
import { sendFeishuText } from "./feishu.js";

function contextFor(days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const sources = db.prepare("SELECT id,title,url,excerpt,substr(content,1,8000) AS content,created_at FROM sources WHERE created_at >= ? ORDER BY created_at DESC LIMIT 40").all(cutoff);
  const projects = listProjects();
  const questions = db.prepare("SELECT id,day,prompt,answered_at FROM questions WHERE created_at >= ? ORDER BY created_at DESC LIMIT 30").all(cutoff);
  const conversations = db.prepare("SELECT m.question_id,m.role,m.content,m.created_at FROM messages m WHERE m.created_at >= ? ORDER BY m.created_at ASC LIMIT 100").all(cutoff);
  return JSON.stringify({ sources, projects, questions, conversations }, null, 2);
}

export async function createDailyQuestions() {
  const day = localDate();
  const existing = db.prepare("SELECT id,prompt FROM questions WHERE day=? ORDER BY id ASC").all(day);
  if (existing.length >= 3) return existing.slice(0, 3);
  const questions = await generateDailyQuestions(contextFor(7));
  const created = questions.map((prompt) => {
    const result = db.prepare("INSERT INTO questions(day,prompt,source_ids,created_at) VALUES(?,?,?,?)").run(day, prompt, "[]", now());
    return { id: Number(result.lastInsertRowid), prompt };
  });
  const message = created.map((item, index) => `${index + 1}. ${item.prompt}`).join("\n\n");
  await sendFeishuText(message, getSetting("feishu_open_id") || process.env.FEISHU_OPEN_ID);
  return created;
}

export async function createWeeklyReport() {
  const weekKey = localDate();
  const content = await generateWeeklyReport(contextFor(30));
  db.prepare("INSERT INTO reports(week_key,content,created_at) VALUES(?,?,?) ON CONFLICT(week_key) DO UPDATE SET content=excluded.content,created_at=excluded.created_at").run(weekKey, content, now());
  await sendFeishuText(content, getSetting("feishu_open_id") || process.env.FEISHU_OPEN_ID);
  return content;
}

export function startScheduler() {
  cron.schedule(process.env.DAILY_CRON || "0 20 * * *", () => createDailyQuestions().catch(console.error), { timezone: process.env.TZ || "Asia/Shanghai" });
  cron.schedule(process.env.WEEKLY_CRON || "0 14 * * 6", () => createWeeklyReport().catch(console.error), { timezone: process.env.TZ || "Asia/Shanghai" });
}

export { listSources };
