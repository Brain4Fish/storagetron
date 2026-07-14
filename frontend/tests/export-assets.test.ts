import test from "node:test";
import assert from "node:assert/strict";

import { buildInventoryWorksheetRows, mergeExportLabels } from "../lib/export-assets";
import type { InventoryLabel } from "../lib/api";

const label = (id: string, name: string): InventoryLabel => ({
    id,
    name,
    color: "blue",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
});

test("inventory worksheet appends comma-separated label names", () => {
    const rows = buildInventoryWorksheetRows([{
        name: "Camera",
        id: "item-1",
        link: "https://example.test/items/item-1",
        location: "Office",
        labels: [label("fragile", "Fragile"), label("electronics", "Electronics")],
    }]);

    assert.deepEqual(rows[0], ["Name", "UUID", "Link", "Location", "Labels"]);
    assert.deepEqual(rows[1], [
        "Camera",
        "item-1",
        "https://example.test/items/item-1",
        "Office",
        "Fragile, Electronics",
    ]);
});

test("inventory worksheet leaves labels empty for an unlabeled row", () => {
    const rows = buildInventoryWorksheetRows([{
        name: "Cable",
        id: "item-2",
        link: "https://example.test/items/item-2",
    }]);

    assert.equal(rows[1][4], "");
});

test("container export labels keep direct labels first and deduplicate inherited labels", () => {
    const direct = [label("office", "Office"), label("shared", "Shared")];
    const inherited = [label("shared", "Shared"), label("cables", "Cables")];

    assert.deepEqual(
        mergeExportLabels(direct, inherited).map((entry) => entry.name),
        ["Office", "Shared", "Cables"],
    );
});
