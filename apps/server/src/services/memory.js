import { db, now } from "../db.js";
import { askGPT } from "./openai.js";

const MEMORY_TYPES = new Set(["belief", "hypothesis", "decision", "open_question", "pattern", "preference", "constraint"]);
const MEMORY_ACTIONS = new Set(["create", "reinforce", "weaken", "revise"]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);
const CREATE_THRESHOLDS = {
  belief: 70,
  hypothesis: 70,
  decision: 65,
  open_question: 70,
  pattern: 85,
  preference: 60,
  constraint: 60
};

function clampScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 50;
}

export function parseMemoryExtraction(text) {
  if (!text) return [];
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const payload = JSON.parse(cleaned.slice(start, end + 1));
    return (Array.isArray(payload.items) ? payload.items : []).flatMap((item) => {
      const action = String(item.action || "").toLowerCase();
      const type = String(item.type || "").toLowerCase();
      const content = String(item.content || "").trim();
      const topic = String(item.topic || "").trim();
      if (!MEMORY_ACTIONS.has(action) || !MEMORY_TYPES.has(type) || !content || !topic) return [];
      return [{
        action,
        memoryId: Number.isInteger(Number(item.memory_id)) && Number(item.memory_id) > 0 ? Number(item.memory_id) : null,
        type,
        topic: topic.slice(0, 120),
        content: content.slice(0, 1000),
        importance: clampScore(item.importance),
        confidence: CONFIDENCE_LEVELS.has(item.confidence) ? item.confidence : "medium",
        evidence: String(item.evidence || "").trim().slice(0, 2000)
      }];
    }).slice(0, 5);
  } catch {
    return [];
  }
}

export function listLongTermMemories(limit = 20) {
  return db.prepare(`
    SELECT id,type,topic,content,status,importance,confidence,evidence,
           source_question_id,supersedes_id,first_seen_at,last_seen_at
    FROM cognitive_memories
    WHERE status IN ('active','contested')
    ORDER BY importance DESC, last_seen_at DESC
    LIMIT ?
  `).all(limit);
}

export function qualifiesForLongTermMemory(item) {
  if (!item || item.action !== "create") return true;
  return item.importance >= (CREATE_THRESHOLDS[item.type] || 70);
}

function insertMemory(item, questionId, supersedesId = null) {
  const timestamp = now();
  const result = db.prepare(`
    INSERT INTO cognitive_memories(
      type,topic,content,status,importance,confidence,evidence,
      source_question_id,supersedes_id,first_seen_at,last_seen_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    item.type, item.topic, item.content, "active", item.importance, item.confidence,
    item.evidence, questionId || null, supersedesId, timestamp, timestamp, timestamp, timestamp
  );
  return Number(result.lastInsertRowid);
}

function addMemoryEvent(memoryId, action, evidence, questionId) {
  db.prepare("INSERT INTO memory_events(memory_id,action,evidence,source_question_id,created_at) VALUES(?,?,?,?,?)")
    .run(memoryId, action, evidence, questionId || null, now());
}

export function applyMemoryExtraction(items, questionId) {
  const applied = [];
  db.exec("BEGIN");
  try {
    for (const item of items) {
      if (!qualifiesForLongTermMemory(item)) continue;
      const existing = item.memoryId
        ? db.prepare("SELECT * FROM cognitive_memories WHERE id=?").get(item.memoryId)
        : null;
      if (item.action === "create" || !existing) {
        if (item.action !== "create" && !existing) continue;
        const duplicate = db.prepare(`
          SELECT * FROM cognitive_memories
          WHERE type=? AND content=? AND status IN ('active','contested')
          ORDER BY updated_at DESC LIMIT 1
        `).get(item.type, item.content);
        if (duplicate) {
          const importance = Math.min(100, Math.max(duplicate.importance, item.importance) + 3);
          db.prepare("UPDATE cognitive_memories SET importance=?,last_seen_at=?,updated_at=? WHERE id=?")
            .run(importance, now(), now(), duplicate.id);
          addMemoryEvent(duplicate.id, "reinforce", item.evidence, questionId);
          applied.push({ memoryId: duplicate.id, action: "reinforce" });
          continue;
        }
        const memoryId = insertMemory(item, questionId);
        addMemoryEvent(memoryId, "create", item.evidence, questionId);
        applied.push({ memoryId, action: "create" });
        continue;
      }
      if (item.action === "revise") {
        db.prepare("UPDATE cognitive_memories SET status='revised',last_seen_at=?,updated_at=? WHERE id=?")
          .run(now(), now(), existing.id);
        const memoryId = insertMemory(item, questionId, existing.id);
        addMemoryEvent(existing.id, "revised", item.evidence, questionId);
        addMemoryEvent(memoryId, "create", item.evidence, questionId);
        applied.push({ memoryId, action: "revise", supersedesId: existing.id });
        continue;
      }
      const status = item.action === "weaken" ? "contested" : "active";
      const importance = Math.min(100, Math.max(existing.importance, item.importance) + (item.action === "reinforce" ? 3 : 0));
      db.prepare(`
        UPDATE cognitive_memories
        SET status=?,importance=?,confidence=?,evidence=?,
            source_question_id=?,last_seen_at=?,updated_at=?
        WHERE id=?
      `).run(
        status, importance, item.confidence, item.evidence || existing.evidence,
        questionId || existing.source_question_id,
        now(), now(), existing.id
      );
      addMemoryEvent(existing.id, item.action, item.evidence, questionId);
      applied.push({ memoryId: existing.id, action: item.action });
    }
    db.exec("COMMIT");
    return applied;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function extractAndStoreLongTermMemory({ questionId, question, conversation }) {
  const existing = listLongTermMemories(30);
  const instructions = `你是长期认知记忆维护器。只提取用户明确表达或明确认可的长期认知，不要把导师自己的建议、追问或推测写成用户观点。只输出严格 JSON，不要 Markdown。`;
  const input = `根据本轮对话维护长期认知。允许的类型：belief、hypothesis、decision、open_question、pattern、preference、constraint。允许的动作：create、reinforce、weaken、revise。

只有满足至少一项时才记录：与项目或决策直接相关；可能持续一个月以上；用户明确认为重要；改变了既有判断；形成可验证假设或长期未决问题。普通寒暄、一次性事实、文章摘要和导师未被认可的观点不记录。

importance 为 0-100；confidence 只能是 low、medium、high；evidence 必须简短引用或准确转述用户原话。reinforce、weaken、revise 必须填写已有 memory_id；create 的 memory_id 为 null。没有合格内容时输出 {"items":[]}。最多五项。

已有长期认知：
${JSON.stringify(existing, null, 2)}

当前问题：
${question}

本轮对话：
${conversation.map((item) => `${item.role === "user" ? "用户" : "导师"}：${item.content}`).join("\n")}

输出格式：
{"items":[{"action":"create","memory_id":null,"type":"belief","topic":"主题","content":"原子化认知","importance":75,"confidence":"medium","evidence":"用户表达的依据"}]}`;
  const answer = await askGPT(instructions, input);
  const items = parseMemoryExtraction(answer);
  return applyMemoryExtraction(items, questionId);
}
