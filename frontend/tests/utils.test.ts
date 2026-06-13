import test from "node:test";
import assert from "node:assert/strict";

import { cn, formatDate } from "../lib/utils";

test("cn merges conditional classes and resolves Tailwind conflicts", () => {
    assert.equal(cn("px-2", false && "hidden", "px-4", "text-sm"), "px-4 text-sm");
});

test("formatDate handles missing and invalid values", () => {
    assert.equal(formatDate(null), "—");
    assert.equal(formatDate(undefined), "—");
    assert.equal(formatDate("not-a-date"), "not-a-date");
});
