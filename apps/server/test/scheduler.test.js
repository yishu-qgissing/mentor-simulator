import test from "node:test";
import assert from "node:assert/strict";
import { isWeekday } from "../src/services/scheduler.js";

test("daily scheduler only permits weekdays in the configured timezone", () => {
  assert.equal(isWeekday(new Date("2026-08-29T12:00:00Z"), "Asia/Shanghai"), false);
  assert.equal(isWeekday(new Date("2026-08-30T12:00:00Z"), "Asia/Shanghai"), false);
  assert.equal(isWeekday(new Date("2026-08-31T12:00:00Z"), "Asia/Shanghai"), true);
});
