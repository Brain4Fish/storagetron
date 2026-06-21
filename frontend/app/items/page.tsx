"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Item } from "@/lib/api";
import { downloadSelectedAssetsXlsx } from "@/lib/export-assets";
import { PageShell } from "@/components/page-shell";
import { ItemsTable } from "@/components/table/items-table";
import { CreateItemDialog } from "@/components/forms/create-item-dialog";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";

const ITEMS_PAGE_SIZE = 25;

type DeleteRequest = {
    ids: string[];
    title: string;
    subject: string;
};

export default function ItemsPage() {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [actionError, setActionError] = useState("");

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ["items", page, ITEMS_PAGE_SIZE],
        queryFn: () => api.listItemsPage({ limit: ITEMS_PAGE_SIZE, offset: page * ITEMS_PAGE_SIZE }),
    });
    const items = data?.items ?? [];
    const totalItems = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PAGE_SIZE));
    const pageStart = totalItems === 0 ? 0 : page * ITEMS_PAGE_SIZE + 1;
    const pageEnd = Math.min((page + 1) * ITEMS_PAGE_SIZE, totalItems);
    const canGoPrevious = page > 0;
    const canGoNext = page + 1 < totalPages;
    const selectedCount = selectedItemIds.size;

    const selectedItems = useMemo(
        () => items.filter((item) => selectedItemIds.has(item.id)),
        [items, selectedItemIds],
    );

    const toggleItem = (itemId: string) => {
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

    const toggleItems = (itemIds: string[], checked: boolean) => {
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
    const goToPreviousPage = () => setPage((current) => Math.max(0, current - 1));
    const goToNextPage = () => setPage((current) => current + 1);
    const downloadSelectedXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedAssetsXlsx(selectedItemIds);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export selected assets.");
        } finally {
            setIsExporting(false);
        }
    };

    const openDeleteItems = (ids: string[], subject: string) => {
        setDeleteError("");
        setActionError("");
        setDeleteRequest({
            ids,
            subject,
            title: ids.length === 1 ? "Delete asset" : "Delete assets",
        });
    };

    const openDeleteItem = (item: Item) => {
        openDeleteItems([item.id], item.name);
    };

    const openDeleteSelected = () => {
        const ids = Array.from(selectedItemIds);
        if (ids.length === 0) return;
        openDeleteItems(ids, `${ids.length} selected asset${ids.length === 1 ? "" : "s"}`);
    };

    const confirmDelete = async () => {
        if (!deleteRequest) return;

        setIsDeleting(true);
        setDeleteError("");
        setActionError("");

        const ids = deleteRequest.ids;
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
                queryClient.invalidateQueries({ queryKey: ["items"] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
            if (page > 0 && deletedIds.length >= items.length) {
                setPage((current) => Math.max(0, current - 1));
            }
        }

        setIsDeleting(false);

        if (failedCount === 0) {
            setDeleteRequest(null);
            return;
        }

        const message = deletedIds.length > 0
            ? `Deleted ${deletedIds.length} of ${ids.length}. ${failedCount} failed.`
            : `Could not delete ${ids.length === 1 ? "this asset" : "these assets"}.`;

        if (deletedIds.length > 0) {
            setDeleteRequest(null);
            setActionError(message);
        } else {
            setDeleteError(message);
        }
    };

    return (
        <PageShell>
            <div className="space-y-3">
                {/* Header */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-semibold">Assets</h1>

                    <div className="flex flex-wrap gap-2">
                        <Link href="/kits">
                            <Button variant="outline">Kits</Button>
                        </Link>
                        <Button onClick={() => setOpen(true)}>
                            New asset
                        </Button>
                    </div>
                </div>

                {selectedCount > 0 ? (
                    <div className="floating-window flex flex-col gap-2 rounded-2xl p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <span className="font-medium">{selectedCount} selected</span>
                            {selectedItems.length > 0 ? (
                                <span className="text-muted-foreground"> · {selectedItems.length} loaded on this page</span>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={downloadSelectedXlsx} disabled={isExporting}>
                                <Download className="h-4 w-4" />
                                {isExporting ? "Preparing..." : "Download XLSX"}
                            </Button>
                            <Button variant="destructive" onClick={openDeleteSelected} disabled={isDeleting}>
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

                {/* Table */}
                {isLoading ? (
                    <p className="text-gray-500">Loading...</p>
                ) : (
                    <div className="space-y-2">
                        <ItemsTable
                            items={items}
                            selectedItemIds={selectedItemIds}
                            onToggleItem={toggleItem}
                            onToggleItems={toggleItems}
                            onDeleteItem={openDeleteItem}
                        />

                        <div className="floating-window flex flex-col gap-2 rounded-2xl p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                {totalItems === 0 ? "No assets" : `Showing ${pageStart}-${pageEnd} of ${totalItems}`}
                                {isFetching ? <span> · Updating...</span> : null}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" disabled={!canGoPrevious} onClick={goToPreviousPage}>
                                    Previous
                                </Button>
                                <Button variant="outline" disabled={!canGoNext} onClick={goToNextPage}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <CreateItemDialog open={open} onOpenChange={setOpen} />
            <DeleteConfirmationDialog
                open={deleteRequest !== null}
                title={deleteRequest?.title ?? "Delete assets"}
                isDeleting={isDeleting}
                error={deleteError}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !isDeleting) setDeleteRequest(null);
                }}
                onConfirm={confirmDelete}
            >
                This permanently deletes <span className="font-semibold text-zinc-950">{deleteRequest?.subject}</span>, including photos and labels.
            </DeleteConfirmationDialog>
        </PageShell>
    );
}
