import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DB_PATH || "./data/mentor.sqlite";
const absolutePath = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

export const db = new DatabaseSync(absolutePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    published_at TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready'
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    prompt TEXT NOT NULL,
    source_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    answered_at TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export function now() {
  return new Date().toISOString();
}

export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function getSetting(key) {
  return db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value || null;
}

export function setSetting(key, value) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key, value, now());
}

export function listSources(limit = 50) {
  return db.prepare("SELECT * FROM sources ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function listProjects() {
  const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();
  const todos = db.prepare("SELECT * FROM todos ORDER BY updated_at DESC").all();
  return projects.map((project) => ({ ...project, todos: todos.filter((todo) => todo.project_id === project.id) }));
}

export function dashboard() {
  const latestQuestion = db.prepare("SELECT * FROM questions ORDER BY created_at DESC LIMIT 1").get();
  const latestReport = db.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 1").get();
  return {
    sources: listSources(8),
    projects: listProjects(),
    unassignedTodos: db.prepare("SELECT * FROM todos WHERE project_id IS NULL ORDER BY updated_at DESC").all(),
    latestQuestion: latestQuestion ? { ...latestQuestion, source_ids: JSON.parse(latestQuestion.source_ids) } : null,
    latestReport: latestReport || null
  };
}
