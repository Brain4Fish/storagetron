import { normalizeScanCode } from "@/lib/scan";

export const API_URL =
    "/api";

export class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export type Photo = {
    id: string;
    item_id?: string;
    container_id?: string;
    object_key: string;
    content_type?: string;
    created_at?: string;
    url: string;
};

export type Item = {
    id: string;
    name: string;
    description?: string;
    location_id?: string;
    location?: Location;
    inherited_location?: Location;
    created_at: string;
    photos?: Photo[];
};

export type ItemListResponse = {
    items: Item[];
    total: number;
    limit: number;
    offset: number;
};

export type Container = {
    id: string;
    name: string;
    description?: string;
    location_id?: string;
    location?: Location;
    created_at: string;
    items?: Item[];
    items_count?: number;
    photos?: Photo[];
};

export type Location = {
    id: string;
    name: string;
    country?: string;
    city?: string;
    room?: string;
    shelf?: string;
    created_at?: string;
};

type ScanResult = {
    type: "item" | "container";
    item?: Item;
    container?: Container;
};

type PhotoUpload = {
    upload_url: string;
};

export type VersionInfo = {
    version: string;
    commit: string;
    date: string;
};

export type BackupTargetType = "sftp" | "local" | "s3" | "webdav";
export type BackupJobStatus = "pending" | "running" | "completed" | "failed";

export type BackupTarget = {
    id: string;
    name: string;
    type: BackupTargetType;
    enabled: boolean;
    configuration: Record<string, any>;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
};

export type BackupSchedule = {
    id: string;
    target_id: string;
    name: string;
    cron_expression: string;
    enabled: boolean;
    retention_policy: {
        keep_last_backups: number;
    };
    created_at: string;
    updated_at: string;
    deleted_at?: string;
};

export type BackupRun = {
    id: string;
    target_id: string;
    schedule_id?: string;
    status: BackupJobStatus;
    phase: string;
    progress_percent: number;
    started_at?: string;
    finished_at?: string;
    size_bytes?: number;
    backup_path?: string;
    error_message?: string;
    created_at: string;
    updated_at: string;
};

export type RestoreRun = {
    id: string;
    target_id: string;
    backup_identifier: string;
    status: BackupJobStatus;
    phase: string;
    progress_percent: number;
    started_at?: string;
    finished_at?: string;
    error_message?: string;
    created_at: string;
    updated_at: string;
};

export type CreateBackupTargetRequest = {
    name: string;
    type: "sftp";
    enabled: boolean;
    configuration: {
        host: string;
        port: number;
        username: string;
        password?: string;
        private_key?: string;
        passphrase?: string;
        host_key?: string;
        insecure_skip_host_key_check?: boolean;
        remote_path: string;
    };
};

export type CreateBackupScheduleRequest = {
    target_id: string;
    name: string;
    cron_expression: string;
    enabled: boolean;
    retention_policy: {
        keep_last_backups: number;
    };
};

export type UpdateBackupTargetRequest = Omit<CreateBackupTargetRequest, "type">;

export type UpdateBackupScheduleRequest = CreateBackupScheduleRequest;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(`${API_URL}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...(init?.headers || {}),
            },
            signal: controller.signal,
        });

        if (!res.ok) {
            let msg = "Request failed";
            try {
                const json = await res.json();
                if (json?.error) msg = json.error;
            } catch {}

            throw new ApiError(res.status, msg);
        }

        if (res.status === 204) return undefined as T;

        return res.json();
    } catch (e: any) {
        if (e.name === "AbortError") {
            throw new ApiError(0, "Request timeout");
        }
        throw e;
    } finally {
        clearTimeout(timeout);
    }
}

export async function uploadFileToPresignedUrl(
    url: string,
    file: File,
    onProgress?: (progress: number) => void
) {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = (event) => {
            if (!onProgress || !event.lengthComputable) return;

            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.(100);
                resolve();
            } else {
                reject(new Error("Upload failed"));
            }
        };

        xhr.onerror = () => reject(new Error("Upload failed"));

        xhr.send(file);
    });
}

export const api = {
    getVersion: () => request<VersionInfo>("/version"),
    listItems: () => request<Item[]>("/items"),
    listItemsPage: ({ limit, offset }: { limit: number; offset: number }) =>
        request<ItemListResponse>(`/items?limit=${limit}&offset=${offset}`),
    getItem: (id: string) => request<Item>(`/items/${id}`),
    createItem: (data: any) =>
        request("/items", { method: "POST", body: JSON.stringify(data) }),
    updateItem: (id: string, data: any) =>
        request<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteItem: (id: string) =>
        request(`/items/${id}`, { method: "DELETE" }),
    listContainers: () => request<Container[]>("/containers"),
    getContainer: (id: string) => request<Container>(`/containers/${id}`),
    createContainer: (data: any) =>
        request<Container>("/containers", { method: "POST", body: JSON.stringify(data) }),
    updateContainer: (id: string, data: any) =>
        request<Container>(`/containers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    addItemToContainer: (containerId: string, itemId: string) =>
        request<void>(`/containers/${containerId}/items`, {
            method: "POST",
            body: JSON.stringify({ item_id: itemId }),
        }),
    removeItemFromContainer: (containerId: string, itemId: string) =>
        request<void>(`/containers/${containerId}/items/${itemId}`, { method: "DELETE" }),
    createPhotoUpload: (id: string, data: any) =>
        request<PhotoUpload>(`/items/${id}/photos`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    deleteItemPhoto: (itemId: string, photoId: string) =>
        request<void>(`/items/${itemId}/photos/${photoId}`, { method: "DELETE" }),
    createContainerPhotoUpload: (id: string, data: any) =>
        request<PhotoUpload>(`/containers/${id}/photos`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    deleteContainerPhoto: (containerId: string, photoId: string) =>
        request<void>(`/containers/${containerId}/photos/${photoId}`, { method: "DELETE" }),
    listLocations: () => request<Location[]>("/locations"),
    createLocation: (data: any) =>
        request<Location>("/locations", { method: "POST", body: JSON.stringify(data) }),
    updateLocation: (id: string, data: any) =>
        request<Location>(`/locations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteLocation: (id: string) =>
        request<void>(`/locations/${id}`, { method: "DELETE" }),
    scanCode: (code: string) =>
        request<ScanResult>(`/scan/${encodeURIComponent(normalizeScanCode(code))}`),
    listBackupTargets: () => request<BackupTarget[]>("/backup/targets"),
    createBackupTarget: (data: CreateBackupTargetRequest) =>
        request<BackupTarget>("/backup/targets", { method: "POST", body: JSON.stringify(data) }),
    updateBackupTarget: (id: string, data: UpdateBackupTargetRequest) =>
        request<BackupTarget>(`/backup/targets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteBackupTarget: (id: string) =>
        request<void>(`/backup/targets/${id}`, { method: "DELETE" }),
    listBackupSchedules: () => request<BackupSchedule[]>("/backup/schedules"),
    createBackupSchedule: (data: CreateBackupScheduleRequest) =>
        request<BackupSchedule>("/backup/schedules", { method: "POST", body: JSON.stringify(data) }),
    updateBackupSchedule: (id: string, data: UpdateBackupScheduleRequest) =>
        request<BackupSchedule>(`/backup/schedules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteBackupSchedule: (id: string) =>
        request<void>(`/backup/schedules/${id}`, { method: "DELETE" }),
    listBackupRuns: () => request<BackupRun[]>("/backup/runs"),
    createBackupRun: (targetId: string) =>
        request<BackupRun>("/backup/run", {
            method: "POST",
            body: JSON.stringify({ target_id: targetId }),
        }),
    listRestoreRuns: () => request<RestoreRun[]>("/backup/restore-runs"),
    createRestoreRun: (data: { target_id: string; backup_identifier: string }) =>
        request<RestoreRun>("/backup/restore", { method: "POST", body: JSON.stringify(data) }),
};
