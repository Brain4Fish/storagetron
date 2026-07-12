import test from "node:test";
import assert from "node:assert/strict";
import {
    completeAssistedStep,
    goToAssistedStep,
    initialAssistedEntryState,
    initialSaveItemProgress,
    saveItemEntry,
    uploadItemPhoto,
    validatePhotoFile,
} from "../lib/item-entry";

test("assisted entry advances, records completion, and clamps navigation", () => {
    const completed = completeAssistedStep(initialAssistedEntryState());
    assert.deepEqual(completed, { stepIndex: 1, completed: [0] });
    assert.equal(goToAssistedStep(completed, 99).stepIndex, 7);
    assert.equal(goToAssistedStep(completed, -4).stepIndex, 0);
});

test("photo validation accepts supported images and enforces 10 MB", () => {
    assert.equal(validatePhotoFile({ name: "box.HEIC", type: "", size: 1024 }), null);
    assert.equal(validatePhotoFile({ name: "box.png", type: "image/png", size: 10 * 1024 * 1024 }), null);
    assert.match(validatePhotoFile({ name: "box.gif", type: "image/gif", size: 10 }) ?? "", /JPG/);
    assert.match(validatePhotoFile({ name: "box.jpg", type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }) ?? "", /10 MB/);
});

test("failed object upload removes its photo metadata", async () => {
    const deleted: string[] = [];
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    await assert.rejects(() => uploadItemPhoto({
        createPhotoUpload: async () => ({ photo_id: "photo-1", object_key: "key", upload_url: "upload" }),
        deleteItemPhoto: async (_itemId, photoId) => { deleted.push(photoId); },
    }, "item-1", file, undefined, async () => { throw new Error("PUT failed"); }), /PUT failed/);
    assert.deepEqual(deleted, ["photo-1"]);
});

test("cleanup failure is surfaced explicitly", async () => {
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    await assert.rejects(() => uploadItemPhoto({
        createPhotoUpload: async () => ({ photo_id: "photo-1", object_key: "key", upload_url: "upload" }),
        deleteItemPhoto: async () => { throw new Error("delete failed"); },
    }, "item-1", file, undefined, async () => { throw new Error("PUT failed"); }), /incomplete record/);
});

test("save coordinator retries only incomplete label and container operations", async () => {
    const calls: string[] = [];
    let failLabel = true;
    const adapter = {
        createItem: async () => ({ id: "item-1", name: "Camera", created_at: "", labels: [] }),
        updateItem: async () => ({ id: "item-1", name: "Camera", created_at: "", labels: [] }),
        attachItemLabel: async (_itemId: string, labelId: string) => { calls.push(`attach:${labelId}`); if (labelId === "b" && failLabel) throw new Error("label failed"); },
        detachItemLabel: async () => undefined,
        createPhotoUpload: async () => ({ photo_id: "photo", object_key: "key", upload_url: "url" }),
        deleteItemPhoto: async () => undefined,
        addItemToContainer: async (containerId: string) => { calls.push(`container:${containerId}`); },
        removeItemFromContainer: async () => undefined,
    };
    const input = { name: "Camera", description: "", locationId: "", labelIds: ["a", "b"], containerId: "box", files: [] };
    const first = await saveItemEntry(adapter, input, initialSaveItemProgress());
    assert.deepEqual(first.progress.attachedLabelIds, ["a"]);
    assert.equal(first.progress.assignedContainerId, "box");
    failLabel = false;
    const second = await saveItemEntry(adapter, input, first.progress);
    assert.deepEqual(second.errors, []);
    assert.deepEqual(calls, ["attach:a", "attach:b", "container:box", "attach:b"]);
});
