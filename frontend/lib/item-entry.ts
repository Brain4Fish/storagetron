import { InventoryLabel, Item, PhotoUpload, uploadFileToPresignedUrl } from "./api";

export const ASSISTED_STEPS = [
    "Item details",
    "Take photos",
    "Print label",
    "Attach label",
    "Pack item",
    "Photo packaging",
    "Choose container",
    "Done",
] as const;

export type AssistedStep = (typeof ASSISTED_STEPS)[number];

export type AssistedEntryState = {
    stepIndex: number;
    completed: number[];
};

export function initialAssistedEntryState(): AssistedEntryState {
    return { stepIndex: 0, completed: [] };
}

export function goToAssistedStep(state: AssistedEntryState, stepIndex: number): AssistedEntryState {
    const nextIndex = Math.max(0, Math.min(ASSISTED_STEPS.length - 1, stepIndex));
    return { ...state, stepIndex: nextIndex };
}

export function completeAssistedStep(state: AssistedEntryState, stepIndex = state.stepIndex): AssistedEntryState {
    const completed = state.completed.includes(stepIndex) ? state.completed : [...state.completed, stepIndex].sort((a, b) => a - b);
    return goToAssistedStep({ ...state, completed }, stepIndex + 1);
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);
const SUPPORTED_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".heif"];

export function validatePhotoFile(file: Pick<File, "name" | "size" | "type">): string | null {
    const lowerName = file.name.toLowerCase();
    const supported = SUPPORTED_PHOTO_TYPES.has(file.type.toLowerCase())
        || (!file.type && SUPPORTED_PHOTO_EXTENSIONS.some((extension) => lowerName.endsWith(extension)));
    if (!supported) return "Choose a JPG, PNG, HEIC, or HEIF image.";
    if (file.size > MAX_PHOTO_BYTES) return "Each photo must be 10 MB or smaller.";
    return null;
}

export function photoFileKey(file: Pick<File, "name" | "size" | "lastModified">): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

type PhotoUploadAPI = {
    createPhotoUpload: (itemId: string, data: { file_name: string; content_type: string }) => Promise<PhotoUpload>;
    deleteItemPhoto: (itemId: string, photoId: string) => Promise<void>;
};

export async function uploadItemPhoto(
    api: PhotoUploadAPI,
    itemId: string,
    file: File,
    onProgress?: (progress: number) => void,
    putFile = uploadFileToPresignedUrl,
): Promise<string> {
    const upload = await api.createPhotoUpload(itemId, {
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
    });
    try {
        await putFile(upload.upload_url, file, onProgress);
        return upload.photo_id;
    } catch (error) {
        try {
            await api.deleteItemPhoto(itemId, upload.photo_id);
        } catch {
            throw new Error("Photo upload failed, and its incomplete record could not be removed.");
        }
        throw error;
    }
}

export type SaveItemProgress = {
    itemId: string;
    attachedLabelIds: string[];
    uploadedFileKeys: string[];
    assignedContainerId: string;
};

export function initialSaveItemProgress(): SaveItemProgress {
    return { itemId: "", attachedLabelIds: [], uploadedFileKeys: [], assignedContainerId: "" };
}

export type SaveItemInput = {
    name: string;
    description: string;
    locationId: string;
    labelIds: string[];
    containerId: string;
    files: File[];
};

type SaveAPI = PhotoUploadAPI & {
    createItem: (data: { name: string; description?: string; location_id?: string | null }) => Promise<Item>;
    updateItem: (id: string, data: { name: string; description?: string; location_id?: string | null }) => Promise<Item>;
    attachItemLabel: (itemId: string, labelId: string) => Promise<void>;
    detachItemLabel: (itemId: string, labelId: string) => Promise<void>;
    addItemToContainer: (containerId: string, itemId: string) => Promise<void>;
    removeItemFromContainer: (containerId: string, itemId: string) => Promise<void>;
};

export type SaveItemResult = { progress: SaveItemProgress; errors: string[] };

export async function saveItemEntry(
    api: SaveAPI,
    input: SaveItemInput,
    current: SaveItemProgress,
    options: { includePhotos?: boolean; includeContainer?: boolean; onPhotoProgress?: (key: string, progress: number) => void } = {},
): Promise<SaveItemResult> {
    const progress: SaveItemProgress = { ...current, attachedLabelIds: [...current.attachedLabelIds], uploadedFileKeys: [...current.uploadedFileKeys] };
    const errors: string[] = [];
    const record = { name: input.name.trim(), description: input.description, location_id: input.locationId || null };

    try {
        if (progress.itemId) await api.updateItem(progress.itemId, record);
        else progress.itemId = (await api.createItem(record)).id;
    } catch (error) {
        return { progress, errors: [error instanceof Error ? error.message : "Could not save item details."] };
    }

    const attached = new Set(progress.attachedLabelIds);
    const selected = new Set(input.labelIds);
    const labelOperations = [
        ...input.labelIds.filter((id) => !attached.has(id)).map((id) => ({ id, attach: true, promise: api.attachItemLabel(progress.itemId, id) })),
        ...progress.attachedLabelIds.filter((id) => !selected.has(id)).map((id) => ({ id, attach: false, promise: api.detachItemLabel(progress.itemId, id) })),
    ];
    const labelResults = await Promise.allSettled(labelOperations.map((operation) => operation.promise));
    labelResults.forEach((result, index) => {
        const operation = labelOperations[index];
        if (result.status === "fulfilled") {
            if (operation.attach) attached.add(operation.id);
            else attached.delete(operation.id);
        } else errors.push(`Could not ${operation.attach ? "attach" : "remove"} a label.`);
    });
    progress.attachedLabelIds = Array.from(attached);

    if (options.includePhotos !== false) {
        for (const file of input.files) {
            const key = photoFileKey(file);
            if (progress.uploadedFileKeys.includes(key)) continue;
            try {
                await uploadItemPhoto(api, progress.itemId, file, (value) => options.onPhotoProgress?.(key, value));
                progress.uploadedFileKeys.push(key);
            } catch (error) {
                errors.push(error instanceof Error ? error.message : `Could not upload ${file.name}.`);
            }
        }
    }

    if (options.includeContainer !== false && progress.assignedContainerId !== input.containerId) {
        try {
            if (progress.assignedContainerId) await api.removeItemFromContainer(progress.assignedContainerId, progress.itemId);
            progress.assignedContainerId = "";
            if (input.containerId) {
                await api.addItemToContainer(input.containerId, progress.itemId);
                progress.assignedContainerId = input.containerId;
            }
        } catch (error) {
            errors.push(error instanceof Error ? error.message : "Could not assign the container.");
        }
    }

    return { progress, errors };
}

export function selectedLabels(labels: InventoryLabel[], ids: string[]): InventoryLabel[] {
    const selected = new Set(ids);
    return labels.filter((label) => selected.has(label.id));
}
