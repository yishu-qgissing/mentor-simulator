import test from "node:test";
import assert from "node:assert/strict";
import { askGPT, generateDailyQuestions, generateWeeklyReport, mentorAlignmentInstructions, responsesEndpoint } from "../src/services/openai.js";

test("responsesEndpoint supports OpenAI-compatible gateways", () => {
  assert.equal(responsesEndpoint("https://rightapi.ai/codex/v1/"), "https://rightapi.ai/codex/v1/responses");
  assert.equal(responsesEndpoint("https://api.openai.com/v1"), "https://api.openai.com/v1/responses");
});

test("mentor prompt enforces thought alignment and a single incremental move", () => {
  assert.match(mentorAlignmentInstructions, /不是用你的框架替换用户的框架/);
  assert.match(mentorAlignmentInstructions, /只推进一小步/);
  assert.match(mentorAlignmentInstructions, /每轮最多引入一个新概念、指出一个核心问题、提出一个追问/);
  assert.match(mentorAlignmentInstructions, /最小范围的纠偏/);
});

test("daily generation always returns exactly three questions without a key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const questions = await generateDailyQuestions("empty context");
  if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  assert.equal(questions.length, 3);
  assert.ok(questions.every((question) => question.endsWith("？")));
});

test("askGPT retries one connection timeout before succeeding", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new TypeError("fetch failed");
      error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
      throw error;
    }
    return new Response(JSON.stringify({ output_text: "OK" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    assert.equal(await askGPT("reply", "ping"), "OK");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("weekly generation falls back when web search is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    if (body.tools) return new Response("gateway does not support tools", { status: 503 });
    return new Response(JSON.stringify({ output_text: "离线周报" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    assert.equal(await generateWeeklyReport("weekly context"), "离线周报");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("weekly generation still returns a report when the model is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response("gateway unavailable", { status: 503 });
  const context = JSON.stringify({
    sources: [{ title: "AI 产品动态", url: "https://example.com/ai" }],
    projects: [{ name: "竞品研究", todos: [{ title: "梳理用户反馈", status: "todo" }] }],
    questions: []
  });
  try {
    const report = await generateWeeklyReport(context);
    assert.match(report, /本周周报（降级版）/);
    assert.match(report, /AI 产品动态/);
    assert.match(report, /梳理用户反馈/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
  }
});
