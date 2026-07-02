import test from "node:test";
import assert from "node:assert/strict";

import { labelChipClasses, labelSelectionDiff } from "@/lib/labels";

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
