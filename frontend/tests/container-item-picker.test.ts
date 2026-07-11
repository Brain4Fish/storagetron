import test from "node:test";
import assert from "node:assert/strict";

import { Container, InventoryLabel, Item } from "../lib/api";
import {
    buildContainerItemPickerRows,
    filterAndSortContainerItemRows,
} from "../lib/container-item-picker";

const blueLabel: InventoryLabel = {
    id: "label-blue",
    name: "Electronics",
    color: "blue",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};
const greenLabel: InventoryLabel = {
    id: "label-green",
    name: "Kitchen",
    color: "green",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

function item(id: string, name: string, createdAt: string, labels: InventoryLabel[] = []): Item {
    return {
        id,
        name,
        created_at: createdAt,
        labels,
    };
}

function container(id: string, name: string, items: Item[]): Container {
    return {
        id,
        name,
        created_at: "2026-01-01T00:00:00Z",
        items,
        labels: [],
        inherited_labels: [],
    };
}

const camera = item("camera", "Canon Camera", "2026-06-03T00:00:00Z", [blueLabel]);
const bottle = item("bottle", "Water Bottle", "2026-06-01T00:00:00Z", [greenLabel]);
const laptop = item("laptop", "ThinkPad", "2026-06-02T00:00:00Z", [blueLabel, greenLabel]);

test("picker rows identify available, current-container, and other-container items", () => {
    const rows = buildContainerItemPickerRows(
        [camera, bottle, laptop],
        [container("target", "TBX-1", [camera]), container("other", "Desk", [bottle])],
        "target",
    );

    assert.deepEqual(rows.map((row) => [row.item.id, row.isSelectable, row.containerStatus]), [
        ["camera", false, "Already here"],
        ["bottle", false, "In Desk"],
        ["laptop", true, "Available"],
    ]);
});

test("picker search is case-insensitive across names, labels, and locations", () => {
    const locatedLaptop = { ...laptop, location: { id: "location", name: "Office" } };
    const rows = buildContainerItemPickerRows([camera, bottle, locatedLaptop], [], "target");
    const filter = (query: string) => filterAndSortContainerItemRows(rows, {
        query,
        availability: "all",
        selectedLabelIds: [],
        sortOrder: "newest",
    }).map((row) => row.item.id);

    assert.deepEqual(filter("canon"), ["camera"]);
    assert.deepEqual(filter("ELECTRONICS"), ["camera", "laptop"]);
    assert.deepEqual(filter("office"), ["laptop"]);
});

test("picker availability filters separate loose and assigned inventory", () => {
    const rows = buildContainerItemPickerRows(
        [camera, bottle, laptop],
        [container("other", "Desk", [camera])],
        "target",
    );
    const ids = (availability: "available" | "assigned") => filterAndSortContainerItemRows(rows, {
        query: "",
        availability,
        selectedLabelIds: [],
        sortOrder: "newest",
    }).map((row) => row.item.id);

    assert.deepEqual(ids("available"), ["laptop", "bottle"]);
    assert.deepEqual(ids("assigned"), ["camera"]);
});

test("picker requires every selected label", () => {
    const rows = buildContainerItemPickerRows([camera, bottle, laptop], [], "target");
    const result = filterAndSortContainerItemRows(rows, {
        query: "",
        availability: "all",
        selectedLabelIds: [blueLabel.id, greenLabel.id],
        sortOrder: "newest",
    });

    assert.deepEqual(result.map((row) => row.item.id), ["laptop"]);
});

test("picker sorts newest and oldest while preserving ties", () => {
    const tiedCamera = { ...camera, created_at: laptop.created_at };
    const rows = buildContainerItemPickerRows([tiedCamera, bottle, laptop], [], "target");
    const sort = (sortOrder: "newest" | "oldest") => filterAndSortContainerItemRows(rows, {
        query: "",
        availability: "all",
        selectedLabelIds: [],
        sortOrder,
    }).map((row) => row.item.id);

    assert.deepEqual(sort("newest"), ["camera", "laptop", "bottle"]);
    assert.deepEqual(sort("oldest"), ["bottle", "camera", "laptop"]);
});
