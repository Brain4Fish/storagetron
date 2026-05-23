"use client";

import { ChangeEvent, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, uploadFileToPresignedUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Props = {
    itemId?: string;
    containerId?: string;
    queryKey?: unknown[];
};

export function UploadPhotoForm({ itemId, containerId, queryKey }: Props) {
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [error, setError] = useState("");
    const [progress, setProgress] = useState<number | null>(null);

    const mutation = useMutation({
        mutationFn: async (file: File) => {
            const payload = {
                file_name: file.name,
                content_type: file.type || "application/octet-stream",
            };
            const upload = itemId
                ? await api.createPhotoUpload(itemId, payload)
                : await api.createContainerPhotoUpload(containerId || "", payload);

            await uploadFileToPresignedUrl(upload.upload_url, file, setProgress);
        },
        onSuccess: async () => {
            setError("");
            setProgress(null);
            await queryClient.invalidateQueries({ queryKey: queryKey ?? ["item", itemId] });
        },
        onError: (err) => {
            setProgress(null);
            setError(err instanceof ApiError ? err.message : "Upload failed");
        },
    });

    const onSelectFile = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!itemId && !containerId) {
            setError("Upload target is missing");
            return;
        }

        setError("");
        setProgress(0);
        mutation.mutate(file);
        e.target.value = "";
    };

    return (
        <div className="space-y-3">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onSelectFile}
                disabled={mutation.isPending}
            />

            <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => inputRef.current?.click()}
            >
                {mutation.isPending ? "Uploading..." : "Upload photo"}
            </Button>

            {progress !== null && (
                <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-muted">
                        <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">{progress}%</p>
                </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
