"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Box, Download, Edit3, MapPin, Plus, Trash2 } from "lucide-react";
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
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";

export default function KitDetailsPage() {
    const params = useParams();
    const router = useRouter();
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
    const [deleteKitOpen, setDeleteKitOpen] = useState(false);
    const [deleteAssetsOpen, setDeleteAssetsOpen] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [isDeletingAssets, setIsDeletingAssets] = useState(false);
    const [actionError, setActionError] = useState("");

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
            setEditError(err instanceof ApiError ? err.message : "Failed to update container");
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

    const deleteKitMutation = useMutation({
        mutationFn: () => api.deleteContainer(id),
        onSuccess: async () => {
            setDeleteError("");
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["container", id] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
                queryClient.invalidateQueries({ queryKey: ["items"] }),
            ]);
            router.push("/containers");
        },
        onError: (err) => {
            setDeleteError(err instanceof ApiError ? err.message : "Failed to delete container");
        },
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
        setActionError("");
        setSelectedItemIds(new Set());
    };

    const downloadSelectedXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedAssetsXlsx(selectedItemIds, `${containerQuery.data?.name || "container"}-items.xlsx`);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export selected items.");
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
                throw new Error("Container data is not loaded.");
            }

            downloadInventoryRowsXlsx(
                [
                    {
                        name: kit.name,
                        id: kit.id,
                        link: `${window.location.origin}/containers/${kit.id}`,
                        location: formatLocation(kit.location),
                    },
                ],
                `${kit.name}-container.xlsx`,
            );
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export container.");
        } finally {
            setIsExportingKit(false);
        }
    };

    const openDeleteSelectedAssets = () => {
        setDeleteError("");
        setActionError("");
        setDeleteAssetsOpen(true);
    };

    const confirmDeleteSelectedAssets = async () => {
        const ids = Array.from(selectedItemIds);
        if (ids.length === 0) return;

        setIsDeletingAssets(true);
        setDeleteError("");
        setActionError("");

        const results = await Promise.allSettled(ids.map((itemId) => api.deleteItem(itemId)));
        const deletedIds = ids.filter((_, index) => results[index].status === "fulfilled");
        const failedCount = ids.length - deletedIds.length;

        if (deletedIds.length > 0) {
            setSelectedItemIds((current) => {
                const next = new Set(current);
                deletedIds.forEach((itemId) => next.delete(itemId));
                return next;
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["container", id] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
                queryClient.invalidateQueries({ queryKey: ["items"] }),
            ]);
        }

        setIsDeletingAssets(false);

        if (failedCount === 0) {
            setDeleteAssetsOpen(false);
            return;
        }

        const message = deletedIds.length > 0
            ? `Deleted ${deletedIds.length} of ${ids.length}. ${failedCount} failed.`
            : `Could not delete ${ids.length === 1 ? "this item" : "these items"}.`;

        if (deletedIds.length > 0) {
            setDeleteAssetsOpen(false);
            setActionError(message);
        } else {
            setDeleteError(message);
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
            <div className="space-y-5 pt-16 md:pt-0">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link href="/containers" className="inline-flex items-center gap-1 hover:text-zinc-950">
                            <ArrowLeft className="h-4 w-4" />
                            Containers
                        </Link>
                        <span>/</span>
                        <span className="truncate text-zinc-950">{container.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setEditOpen(true)}>
                            <Edit3 className="h-4 w-4" />
                            Edit
                        </Button>
                        <Button onClick={downloadKitXlsx} disabled={isExportingKit}>
                            <Download className="h-4 w-4" />
                            {isExportingKit ? "Preparing..." : "Export"}
                        </Button>
                    </div>
                </header>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
                    <div className="space-y-4">
                        <section className="apple-card rounded-2xl p-4">
                            <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1fr)]">
                                <div className="overflow-hidden rounded-2xl border border-border bg-zinc-100">
                                    <div className="aspect-[4/3]">
                                        {firstPhoto ? (
                                            <img src={firstPhoto} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                                <Box className="h-16 w-16" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{container.name}</h1>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <span className="status-pill bg-indigo-50 text-primary">Container</span>
                                        <span className="status-pill bg-emerald-50 text-emerald-700">{kitItems.length} items</span>
                                    </div>
                                    <div className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
                                        <div className="flex items-start gap-3">
                                            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-sm font-medium">Location</p>
                                                <p className="mt-1 text-sm text-muted-foreground">{formatLocation(container.location) || "No location"}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <Box className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-sm font-medium">Contents</p>
                                                <p className="mt-1 text-sm text-muted-foreground">{kitItems.length} item{kitItems.length === 1 ? "" : "s"}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-5">
                                        <h2 className="text-sm font-semibold">Notes</h2>
                                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-700">
                                            {container.description || "No notes yet."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="apple-card rounded-2xl p-4">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold">Contents</h2>
                                    <p className="text-sm text-muted-foreground">{kitItems.length} items in this container</p>
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        value={selectedItemId}
                                        onChange={(event) => setSelectedItemId(event.target.value)}
                                        className="h-10 min-w-0 rounded-xl border border-border bg-white px-3 text-sm"
                                    >
                                        <option value="">Choose item</option>
                                        {availableItems.map((item: Item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                    <Button onClick={addSelectedItem} disabled={addMutation.isPending}>
                                        <Plus className="h-4 w-4" />
                                        {addMutation.isPending ? "Adding..." : "Add"}
                                    </Button>
                                </div>
                            </div>
                            {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
                            <div className="space-y-3">
                        {selectedCount > 0 ? (
                            <div className="apple-card flex flex-col gap-3 rounded-2xl p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <span className="font-medium">{selectedCount} selected</span>
                                    {selectedKitItems.length > 0 ? (
                                        <span className="text-muted-foreground"> / {selectedKitItems.length} in this container</span>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button onClick={downloadSelectedXlsx} disabled={isExporting}>
                                        <Download className="h-4 w-4" />
                                        {isExporting ? "Preparing..." : "Download XLSX"}
                                    </Button>
                                    <Button variant="destructive" onClick={openDeleteSelectedAssets} disabled={isDeletingAssets}>
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                    </Button>
                                    <Button variant="outline" onClick={clearSelection}>
                                        Clear selection
                                    </Button>
                                </div>
                                {exportError || actionError ? (
                                    <p className="text-sm text-destructive sm:basis-full">{exportError || actionError}</p>
                                ) : null}
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
                        </section>
                    </div>

                    <aside className="space-y-4">
                    <section className="apple-card rounded-2xl p-5">
                        <h2 className="mb-4 text-lg font-semibold">Container Label</h2>
                        <div className="flex flex-col items-center gap-4">
                            <div className="rounded-2xl border border-border bg-white p-4">
                                <QRCode value={kitUrl} />
                            </div>
                            <p className="text-lg font-semibold">{container.name}</p>
                        <PrintLabelDialog
                            name={container.name}
                            qrValue={kitUrl}
                            detail={`${kitItems.length}`}
                            detailLabel="Items"
                            onDownloadXlsx={downloadKitXlsx}
                            isDownloadingXlsx={isExportingKit}
                        />
                        </div>
                    </section>

                    <section className="apple-card rounded-2xl p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Photos</h2>
                            <span className="text-sm text-muted-foreground">{container.photos?.length ?? 0}</span>
                        </div>
                        <UploadPhotoForm containerId={id} queryKey={["container", id]} />
                        <div className="mt-4">
                            <ItemPhotos
                                photos={container.photos}
                                onDelete={(photoId) => {
                                    if (window.confirm("Remove this photo from the container?")) {
                                        deletePhotoMutation.mutate(photoId);
                                    }
                                }}
                                deletingPhotoId={deletingPhotoId}
                                variant="compact"
                            />
                        </div>
                    </section>

                    <section className="apple-card rounded-2xl p-5">
                        <h2 className="text-lg font-semibold">Identity</h2>
                        <dl className="mt-4 grid gap-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Created</dt>
                                <dd className="text-right font-medium">{container.created_at ? new Date(container.created_at).toLocaleDateString() : "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Photos</dt>
                                <dd className="font-medium">{container.photos?.length ?? 0}</dd>
                            </div>
                        </dl>
                        <Button
                            variant="destructive"
                            className="mt-5 w-full"
                            onClick={() => {
                                setDeleteError("");
                                setDeleteKitOpen(true);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete Container
                        </Button>
                    </section>
                </aside>
            </div>
            </div>

            <EditRecordDialog
                open={editOpen}
                title="Edit container"
                description="Rename this container or update its location and notes."
                name={container.name}
                details={container.description}
                locationId={container.location_id ?? ""}
                locations={locations}
                isSaving={updateMutation.isPending}
                error={editError}
                onOpenChange={setEditOpen}
                onSave={(payload) => updateMutation.mutate(payload)}
            />
            <DeleteConfirmationDialog
                open={deleteKitOpen}
                title="Delete container"
                isDeleting={deleteKitMutation.isPending}
                error={deleteError}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !deleteKitMutation.isPending) setDeleteKitOpen(false);
                }}
                onConfirm={() => deleteKitMutation.mutate()}
            >
                This permanently deletes <span className="font-semibold text-zinc-950">{container.name}</span>. Items inside this container stay in inventory.
            </DeleteConfirmationDialog>
            <DeleteConfirmationDialog
                open={deleteAssetsOpen}
                title="Delete selected items"
                isDeleting={isDeletingAssets}
                error={deleteError}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !isDeletingAssets) setDeleteAssetsOpen(false);
                }}
                onConfirm={confirmDeleteSelectedAssets}
            >
                This permanently deletes <span className="font-semibold text-zinc-950">{selectedCount} selected item{selectedCount === 1 ? "" : "s"}</span>, including photos and labels.
            </DeleteConfirmationDialog>
        </PageShell>
    );
}
