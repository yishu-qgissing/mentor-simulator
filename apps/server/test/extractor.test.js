import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, extractHtml } from "../src/services/extractor.js";

test("extractHtml prefers article text and removes scripts", () => {
  const page = extractHtml(`<!doctype html><html><head><title>产品观察</title><meta name="description" content="一段摘要"></head><body><nav>导航</nav><article><h1>真正标题</h1><p>正文内容</p><script>secret()</script></article></body></html>`, "https://example.com/post");
  assert.equal(page.title, "产品观察");
  assert.equal(page.excerpt, "一段摘要");
  assert.match(page.content, /真正标题 正文内容/);
  assert.doesNotMatch(page.content, /secret|导航/);
});

test("assertPublicUrl blocks localhost and private IPv4 literals", async () => {
  await assert.rejects(() => assertPublicUrl("http://localhost:4310/private"), /本机或内网/);
  await assert.rejects(() => assertPublicUrl("http://127.0.0.1/private"), /本机或内网/);
  await assert.rejects(() => assertPublicUrl("http://192.168.1.20/private"), /本机或内网/);
});
