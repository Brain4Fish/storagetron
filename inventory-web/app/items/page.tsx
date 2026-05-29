"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { downloadSelectedAssetsXlsx } from "@/lib/export-assets";
import { PageShell } from "@/components/page-shell";
import { ItemsTable } from "@/components/table/items-table";
import { CreateItemDialog } from "@/components/forms/create-item-dialog";
import { Button } from "@/components/ui/button";

const ITEMS_PAGE_SIZE = 25;

export default function ItemsPage() {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");

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
                            <Button variant="outline" onClick={clearSelection}>
                                Clear selection
                            </Button>
                        </div>
                        {exportError ? <p className="text-sm text-destructive sm:basis-full">{exportError}</p> : null}
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
        </PageShell>
    );
}
