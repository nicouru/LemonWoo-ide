import { test } from "node:test";
import assert from "node:assert/strict";
import { sum } from "../src/sum.ts";

test("sum adds numbers", () => {
  assert.equal(sum(2, 3), 5);
});
