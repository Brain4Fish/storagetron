import test from "node:test";
import assert from "node:assert/strict";

import { normalizeScanCode } from "../lib/scan";

test("normalizeScanCode trims plain inventory codes", () => {
    assert.equal(normalizeScanCode("  ITEM-001  "), "ITEM-001");
});

test("normalizeScanCode extracts and decodes scan URLs", () => {
    assert.equal(normalizeScanCode("https://example.test/scan/ITEM%2F001"), "ITEM/001");
});

test("normalizeScanCode extracts item and kit URL identifiers", () => {
    assert.equal(normalizeScanCode("https://example.test/items/item-id"), "item-id");
    assert.equal(normalizeScanCode("https://example.test/kits/kit-id?tab=photos"), "kit-id");
});

test("normalizeScanCode returns original code when URL has no supported path segment", () => {
    const value = "https://example.test/not-inventory/ITEM-001";
    assert.equal(normalizeScanCode(value), value);
});
