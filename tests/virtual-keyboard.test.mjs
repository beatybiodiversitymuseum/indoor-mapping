import assert from "node:assert/strict";
import test from "node:test";
import { KEYBOARD_ROWS, applyVirtualKey, virtualKeyWithCaps } from "../app/virtual-keyboard.js";

test("the on-screen keyboard only transforms the search string", () => {
  assert.ok(KEYBOARD_ROWS.flat().includes("A"));
  assert.equal(applyVirtualKey("foss", "i"), "fossi");
  assert.equal(applyVirtualKey("fossil", "backspace"), "fossi");
  assert.equal(applyVirtualKey("irish", "space"), "irish ");
  assert.equal(applyVirtualKey("irish elk", "clear"), "");
});

test("caps mode changes letter case without changing punctuation", () => {
  assert.equal(virtualKeyWithCaps("A", false), "a");
  assert.equal(virtualKeyWithCaps("A", true), "A");
  assert.equal(virtualKeyWithCaps("-", true), "-");
});
