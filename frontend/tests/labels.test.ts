import test from "node:test";
import assert from "node:assert/strict";

import { labelChipClasses, labelSelectionDiff, matchesSelectedLabels } from "../lib/labels";

const label = (id: string) => ({
    id,
    name: id,
    color: "blue" as const,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
});

test("labelSelectionDiff returns only changed attachments", () => {
    assert.deepEqual(labelSelectionDiff([label("a"), label("b")], ["b", "c"]), {
        attach: ["c"],
        detach: ["a"],
    });
});

test("inherited label styles remain visually distinct", () => {
    assert.notEqual(labelChipClasses.blue.direct, labelChipClasses.blue.inherited);
});

test("matchesSelectedLabels matches everything when no labels are selected", () => {
    assert.equal(matchesSelectedLabels([label("a")], []), true);
    assert.equal(matchesSelectedLabels([], []), true);
});

test("matchesSelectedLabels matches an item with the selected label", () => {
    assert.equal(matchesSelectedLabels([label("a"), label("b")], ["a"]), true);
    assert.equal(matchesSelectedLabels([label("b")], ["a"]), false);
});

test("matchesSelectedLabels requires every selected label", () => {
    assert.equal(matchesSelectedLabels([label("a"), label("b")], ["a", "b"]), true);
    assert.equal(matchesSelectedLabels([label("a")], ["a", "b"]), false);
});

test("matchesSelectedLabels rejects unmatched labels", () => {
    assert.equal(matchesSelectedLabels(undefined, ["missing"]), false);
    assert.equal(matchesSelectedLabels([label("a")], ["missing"]), false);
});
