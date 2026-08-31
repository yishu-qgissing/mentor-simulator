import cron from "node-cron";
import { db, now, localDate, getSetting, listProjects, listSources } from "../db.js";
import { generateDailyQuestions, generateWeeklyReport } from "./openai.js";
import { sendFeishuText } from "./feishu.js";
import { listLongTermMemories } from "./memory.js";

const DEFAULT_DAILY_CRON = "0 20 * * 1-5";
const DEFAULT_WEEKLY_CRON = "0 14 * * 6";

function contextFor(days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const sources = db.prepare("SELECT id,title,url,excerpt,substr(content,1,8000) AS content,created_at FROM sources WHERE created_at >= ? ORDER BY created_at DESC LIMIT 40").all(cutoff);
  const projects = listProjects();
  const questions = db.prepare("SELECT id,day,prompt,answered_at FROM questions WHERE created_at >= ? ORDER BY created_at DESC LIMIT 30").all(cutoff);
  const conversations = db.prepare("SELECT m.question_id,m.role,m.content,m.created_at FROM messages m WHERE m.created_at >= ? ORDER BY m.created_at ASC LIMIT 100").all(cutoff);
  const longTermMemories = listLongTermMemories(20);
  return JSON.stringify({ sources, projects, questions, conversations, longTermMemories }, null, 2);
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

export function isWeekday(date = new Date(), timezone = process.env.TZ || "Asia/Shanghai") {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  return weekday !== "Sat" && weekday !== "Sun";
}

async function runLoggedJob(name, job) {
  console.log(`[scheduler] ${name} started`);
  try {
    const result = await job();
    console.log(`[scheduler] ${name} completed`);
    return result;
  } catch (error) {
    console.error(`[scheduler] ${name} failed`, error);
    throw error;
  }
}

export async function runScheduledDaily(date = new Date()) {
  const timezone = process.env.TZ || "Asia/Shanghai";
  if (!isWeekday(date, timezone)) {
    console.log(`[scheduler] daily skipped: weekend in ${timezone}`);
    return null;
  }
  return runLoggedJob("daily", createDailyQuestions);
}

export function runScheduledWeekly() {
  return runLoggedJob("weekly", createWeeklyReport);
}

export function startScheduler() {
  const timezone = process.env.TZ || "Asia/Shanghai";
  const dailyCron = process.env.DAILY_CRON || DEFAULT_DAILY_CRON;
  const weeklyCron = process.env.WEEKLY_CRON || DEFAULT_WEEKLY_CRON;
  console.log(`[scheduler] daily=${dailyCron} weekly=${weeklyCron} timezone=${timezone}`);
  cron.schedule(dailyCron, () => runScheduledDaily().catch(() => {}), { timezone });
  cron.schedule(weeklyCron, () => runScheduledWeekly().catch(() => {}), { timezone });
}

export { listSources };
