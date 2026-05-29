"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Box, Download } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, Item } from "@/lib/api";
import { downloadInventoryRowsXlsx, downloadSelectedAssetsXlsx } from "@/lib/export-assets";
import { formatLocation } from "@/lib/location";
import { PageShell } from "@/components/page-shell";
import { QRCode } from "@/components/qr/qr-code";
import { KitItemsTable } from "@/components/table/kit-items-table";
import { ItemPhotos } from "@/components/item-photos";
import { UploadPhotoForm } from "@/components/forms/upload-photo-form";
import { Button } from "@/components/ui/button";
import { PrintLabelDialog } from "@/components/print-label-dialog";
import { EditRecordDialog } from "@/components/forms/edit-record-dialog";

export default function KitDetailsPage() {
    const params = useParams();
    const queryClient = useQueryClient();
    const id = params.id as string;
    const [selectedItemId, setSelectedItemId] = useState("");
    const [error, setError] = useState("");
    const [editOpen, setEditOpen] = useState(false);
    const [editError, setEditError] = useState("");
    const [removingItemId, setRemovingItemId] = useState("");
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [isExportingKit, setIsExportingKit] = useState(false);
    const [exportError, setExportError] = useState("");
    const [deletingPhotoId, setDeletingPhotoId] = useState("");

    const containerQuery = useQuery({
        queryKey: ["container", id],
        queryFn: () => api.getContainer(id),
    });

    const itemsQuery = useQuery({
        queryKey: ["items"],
        queryFn: api.listItems,
    });

    const containersQuery = useQuery({
        queryKey: ["containers"],
        queryFn: api.listContainers,
    });
    const { data: locations = [] } = useQuery({
        queryKey: ["locations"],
        queryFn: api.listLocations,
    });

    const kitItems = useMemo(() => {
        const containerItems = containerQuery.data?.items ?? [];
        const itemById = new Map((itemsQuery.data ?? []).map((item) => [item.id, item]));

        return containerItems.map((item) => itemById.get(item.id) ?? item);
    }, [containerQuery.data?.items, itemsQuery.data]);
    const selectedKitItems = useMemo(
        () => kitItems.filter((item) => selectedItemIds.has(item.id)),
        [kitItems, selectedItemIds],
    );
    const selectedCount = selectedItemIds.size;

    const availableItems = useMemo(() => {
        const assignedItems = new Set(
            (containersQuery.data ?? []).flatMap((container) =>
                (container.items ?? []).map((item) => item.id),
            ),
        );

        return (itemsQuery.data ?? []).filter((item) => !assignedItems.has(item.id));
    }, [itemsQuery.data, containersQuery.data]);

    const addMutation = useMutation({
        mutationFn: (itemId: string) => api.addItemToContainer(id, itemId),
        onSuccess: async () => {
            setSelectedItemId("");
            setError("");
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["container", id] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
        },
        onError: (err) => {
            setError(err instanceof ApiError ? err.message : "Failed to add item");
        },
    });

    const updateMutation = useMutation({
        mutationFn: (payload: { name: string; description: string; location_id?: string | null }) => api.updateContainer(id, payload),
        onSuccess: async () => {
            setEditError("");
            setEditOpen(false);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["container", id] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
        },
        onError: (err) => {
            setEditError(err instanceof ApiError ? err.message : "Failed to update kit");
        },
    });

    const removeMutation = useMutation({
        mutationFn: (itemId: string) => api.removeItemFromContainer(id, itemId),
        onMutate: (itemId) => setRemovingItemId(itemId),
        onSuccess: async () => {
            setError("");
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["container", id] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
        },
        onError: (err) => {
            setError(err instanceof ApiError ? err.message : "Failed to remove item");
        },
        onSettled: () => setRemovingItemId(""),
    });

    const deletePhotoMutation = useMutation({
        mutationFn: (photoId: string) => api.deleteContainerPhoto(id, photoId),
        onMutate: (photoId) => setDeletingPhotoId(photoId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["container", id] });
        },
        onError: (err) => {
            setError(err instanceof ApiError ? err.message : "Failed to remove photo");
        },
        onSettled: () => setDeletingPhotoId(""),
    });

    const addSelectedItem = () => {
        if (!selectedItemId) {
            setError("Choose an item to add");
            return;
        }
        setError("");
        addMutation.mutate(selectedItemId);
    };

    const toggleKitItem = (itemId: string) => {
        setSelectedItemIds((current) => {
            const next = new Set(current);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const toggleKitItems = (itemIds: string[], checked: boolean) => {
        setSelectedItemIds((current) => {
            const next = new Set(current);
            itemIds.forEach((itemId) => {
                if (checked) {
                    next.add(itemId);
                } else {
                    next.delete(itemId);
                }
            });
            return next;
        });
    };

    const clearSelection = () => {
        setExportError("");
        setSelectedItemIds(new Set());
    };

    const downloadSelectedXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedAssetsXlsx(selectedItemIds, `${containerQuery.data?.name || "kit"}-assets.xlsx`);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export selected assets.");
        } finally {
            setIsExporting(false);
        }
    };

    const downloadKitXlsx = async () => {
        setIsExportingKit(true);
        setExportError("");

        try {
            const kit = containerQuery.data;
            if (!kit) {
                throw new Error("Kit data is not loaded.");
            }

            downloadInventoryRowsXlsx(
                [
                    {
                        name: kit.name,
                        id: kit.id,
                        link: `${window.location.origin}/kits/${kit.id}`,
                        location: formatLocation(kit.location),
                    },
                ],
                `${kit.name}-kit.xlsx`,
            );
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export kit.");
        } finally {
            setIsExportingKit(false);
        }
    };

    const container = containerQuery.data;

    if (containerQuery.isLoading) {
        return <PageShell>Loading...</PageShell>;
    }

    if (!container) {
        return <PageShell>Not found</PageShell>;
    }

    const kitUrl = `${window.location.origin}/scan/${container.id}`;
    const firstPhoto = container.photos?.[0]?.url;

    return (
        <PageShell>
            <div className="grid min-h-full gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-orange-50 text-orange-600">
                            {firstPhoto ? (
                                <img src={firstPhoto} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Box className="h-7 w-7" />
                                </div>
                            )}
                        </div>
                        <div>
                            <Link href="/kits" className="text-sm text-gray-500 hover:text-gray-900">
                                Kits
                            </Link>
                            <h1 className="mt-1 text-2xl font-semibold">{container.name}</h1>
                            {container.description ? (
                                <p className="mt-1 text-sm text-gray-500">{container.description}</p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                                <span className="inline-flex rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-700">
                                    {kitItems.length} items
                                </span>
                                {formatLocation(container.location) ? (
                                    <span className="soft-bubble inline-flex rounded-full px-2 py-1 text-xs text-zinc-700">
                                        {formatLocation(container.location)}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {selectedCount > 0 ? (
                            <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 text-sm shadow-soft sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <span className="font-medium">{selectedCount} selected</span>
                                    {selectedKitItems.length > 0 ? (
                                        <span className="text-muted-foreground"> · {selectedKitItems.length} in this kit</span>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button onClick={downloadSelectedXlsx} disabled={isExporting}>
                                        <Download className="h-4 w-4" />
                                        {isExporting ? "Preparing..." : "Download XLSX"}
                                    </Button>
                                    <Button variant="outline" onClick={clearSelection}>
                                        Clear selection
                                    </Button>
                                </div>
                                {exportError ? <p className="text-sm text-destructive sm:basis-full">{exportError}</p> : null}
                            </div>
                        ) : null}

                        <KitItemsTable
                            items={kitItems}
                            selectedItemIds={selectedItemIds}
                            onToggleItem={toggleKitItem}
                            onToggleItems={toggleKitItems}
                            onRemove={(itemId) => removeMutation.mutate(itemId)}
                            removingItemId={removingItemId}
                        />
                    </div>
                </div>

                <aside className="space-y-3 lg:sticky lg:top-6 lg:min-h-[calc(100dvh-3rem)] lg:self-start">
                    <div className="space-y-3 rounded-xl border bg-white p-4">
                        <QRCode value={kitUrl} />
                        <Button variant="outline" className="w-full" onClick={() => setEditOpen(true)}>
                            Edit kit
                        </Button>
                        <PrintLabelDialog
                            name={container.name}
                            qrValue={kitUrl}
                            detail={`${kitItems.length}`}
                            detailLabel="Assets"
                            onDownloadXlsx={downloadKitXlsx}
                            isDownloadingXlsx={isExportingKit}
                        />
                    </div>

                    <div className="space-y-2 rounded-xl border bg-white p-3">
                        <label htmlFor="kit-item" className="text-sm font-medium">
                            Add asset
                        </label>
                        <div className="flex gap-2">
                            <select
                                id="kit-item"
                                value={selectedItemId}
                                onChange={(event) => setSelectedItemId(event.target.value)}
                                className="h-8 min-w-0 flex-1 rounded-full border border-input bg-white px-3 text-sm"
                            >
                                <option value="">Choose asset</option>
                                {availableItems.map((item: Item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                            <Button size="sm" onClick={addSelectedItem} disabled={addMutation.isPending}>
                                {addMutation.isPending ? "Adding..." : "Add"}
                            </Button>
                        </div>
                        {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    </div>

                    <div className="space-y-4 rounded-xl border bg-white p-4">
                        <div className="space-y-1">
                            <h2 className="font-medium">Photos</h2>
                            <p className="text-sm text-muted-foreground">Images that identify this kit.</p>
                        </div>
                        <UploadPhotoForm containerId={id} queryKey={["container", id]} />
                        <ItemPhotos
                            photos={container.photos}
                            onDelete={(photoId) => {
                                if (window.confirm("Remove this photo from the kit?")) {
                                    deletePhotoMutation.mutate(photoId);
                                }
                            }}
                            deletingPhotoId={deletingPhotoId}
                            variant="compact"
                        />
                    </div>
                </aside>
            </div>

            <EditRecordDialog
                open={editOpen}
                title="Edit kit"
                description="Rename this kit or update its location and notes."
                name={container.name}
                details={container.description}
                locationId={container.location_id ?? ""}
                locations={locations}
                isSaving={updateMutation.isPending}
                error={editError}
                onOpenChange={setEditOpen}
                onSave={(payload) => updateMutation.mutate(payload)}
            />
        </PageShell>
    );
}
