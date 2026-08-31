import test from "node:test";
import assert from "node:assert/strict";
import { parseMemoryExtraction, qualifiesForLongTermMemory } from "../src/services/memory.js";

test("memory extraction accepts valid JSON and normalizes scores", () => {
  const items = parseMemoryExtraction(`\n\`\`\`json\n{"items":[{"action":"create","memory_id":null,"type":"belief","topic":"AI 搜索","content":"任务闭环可能比答案质量更重要","importance":108,"confidence":"high","evidence":"用户明确表达"}]}\n\`\`\``);
  assert.equal(items.length, 1);
  assert.equal(items[0].importance, 100);
  assert.equal(items[0].type, "belief");
});

test("memory extraction rejects unsupported actions and malformed output", () => {
  assert.deepEqual(parseMemoryExtraction("not json"), []);
  assert.deepEqual(parseMemoryExtraction('{"items":[{"action":"delete","type":"belief","topic":"x","content":"y"}]}'), []);
});

test("new long-term memories must cross deterministic type thresholds", () => {
  assert.equal(qualifiesForLongTermMemory({ action: "create", type: "belief", importance: 69 }), false);
  assert.equal(qualifiesForLongTermMemory({ action: "create", type: "belief", importance: 70 }), true);
  assert.equal(qualifiesForLongTermMemory({ action: "create", type: "pattern", importance: 84 }), false);
  assert.equal(qualifiesForLongTermMemory({ action: "reinforce", type: "belief", importance: 1 }), true);
});
