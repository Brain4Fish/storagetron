"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Filter, Plus, Search, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Item } from "@/lib/api";
import { buildItemRows } from "@/lib/inventory-view";
import { downloadSelectedAssetsXlsx } from "@/lib/export-assets";
import { PageShell } from "@/components/page-shell";
import { ItemsTable } from "@/components/table/items-table";
import { CreateItemDialog } from "@/components/forms/create-item-dialog";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";

const ITEMS_PAGE_SIZE = 20;

type DeleteRequest = {
    ids: string[];
    title: string;
    subject: string;
};

export default function ItemsPage() {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [query, setQuery] = useState("");
    const [locationFilter, setLocationFilter] = useState("all");
    const [containerFilter, setContainerFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [actionError, setActionError] = useState("");

    const itemsQuery = useQuery({ queryKey: ["items"], queryFn: api.listItems });
    const containersQuery = useQuery({ queryKey: ["containers"], queryFn: api.listContainers });
    const items = itemsQuery.data ?? [];
    const containers = containersQuery.data ?? [];

    const rows = useMemo(() => buildItemRows(items, containers), [items, containers]);
    const locationOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.locationLabel))).sort(), [rows]);
    const containerOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.containerLabel))).sort(), [rows]);
    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return rows.filter((row) => {
            if (normalizedQuery && !row.searchableText.includes(normalizedQuery)) return false;
            if (locationFilter !== "all" && row.locationLabel !== locationFilter) return false;
            if (containerFilter !== "all" && row.containerLabel !== containerFilter) return false;
            if (statusFilter !== "all" && row.status !== statusFilter) return false;
            return true;
        });
    }, [containerFilter, locationFilter, query, rows, statusFilter]);

    const totalItems = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PAGE_SIZE));
    const pageRows = filteredRows.slice(page * ITEMS_PAGE_SIZE, (page + 1) * ITEMS_PAGE_SIZE);
    const pageStart = totalItems === 0 ? 0 : page * ITEMS_PAGE_SIZE + 1;
    const pageEnd = Math.min((page + 1) * ITEMS_PAGE_SIZE, totalItems);
    const canGoPrevious = page > 0;
    const canGoNext = page + 1 < totalPages;
    const selectedCount = selectedItemIds.size;

    const selectedItems = useMemo(
        () => rows.filter((row) => selectedItemIds.has(row.item.id)),
        [rows, selectedItemIds],
    );

    useEffect(() => {
        setPage(0);
    }, [containerFilter, locationFilter, query, statusFilter]);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("status") === "loose") {
            setStatusFilter("loose");
        }
    }, []);

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
    const clearFilters = () => {
        setQuery("");
        setLocationFilter("all");
        setContainerFilter("all");
        setStatusFilter("all");
    };
    const goToPreviousPage = () => setPage((current) => Math.max(0, current - 1));
    const goToNextPage = () => setPage((current) => Math.min(totalPages - 1, current + 1));
    const downloadSelectedXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedAssetsXlsx(selectedItemIds);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export selected items.");
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
            title: ids.length === 1 ? "Delete item" : "Delete items",
        });
    };

    const openDeleteItem = (item: Item) => {
        openDeleteItems([item.id], item.name);
    };

    const openDeleteSelected = () => {
        const ids = Array.from(selectedItemIds);
        if (ids.length === 0) return;
        openDeleteItems(ids, `${ids.length} selected item${ids.length === 1 ? "" : "s"}`);
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
            if (page > 0 && deletedIds.length >= pageRows.length) {
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
            : `Could not delete ${ids.length === 1 ? "this item" : "these items"}.`;

        if (deletedIds.length > 0) {
            setDeleteRequest(null);
            setActionError(message);
        } else {
            setDeleteError(message);
        }
    };

    return (
        <PageShell>
            <div className="space-y-5 pt-16 md:pt-0">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-semibold tracking-tight">Items</h1>
                            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-muted-foreground">{items.length} items</span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">All your items in one place. Search, filter, and organize.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={downloadSelectedXlsx} disabled={selectedCount === 0 || isExporting}>
                            <Download className="h-4 w-4" />
                            {isExporting ? "Preparing..." : "Export"}
                        </Button>
                        <Button onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add Item
                        </Button>
                    </div>
                </header>

                <section className="apple-card rounded-2xl p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search items by name, description, barcode, or note..."
                                className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                        </label>
                        <Button variant="outline" onClick={clearFilters}>
                            <Filter className="h-4 w-4" />
                            Clear filters
                        </Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <FilterSelect label="Location" value={locationFilter} onChange={setLocationFilter} options={locationOptions} />
                        <FilterSelect label="Container" value={containerFilter} onChange={setContainerFilter} options={containerOptions} />
                        <FilterSelect
                            label="Status"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={["stored", "loose"]}
                            labels={{ stored: "In Storage", loose: "No Container" }}
                        />
                        <div className="grid gap-1 text-xs font-medium text-muted-foreground">
                            Containers
                            <Link href="/containers">
                                <Button variant="outline" className="h-10 w-full">Browse Containers</Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {selectedCount > 0 ? (
                    <div className="apple-card flex flex-col gap-3 rounded-2xl p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <span className="font-medium">{selectedCount} selected</span>
                            {selectedItems.length > 0 ? (
                                <span className="text-muted-foreground"> / {selectedItems.length} loaded</span>
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

                {itemsQuery.isLoading || containersQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading items...</p>
                ) : (
                    <div className="space-y-3">
                        <ItemsTable
                            rows={pageRows}
                            selectedItemIds={selectedItemIds}
                            onToggleItem={toggleItem}
                            onToggleItems={toggleItems}
                            onDeleteItem={openDeleteItem}
                        />

                        <div className="apple-card flex flex-col gap-3 rounded-2xl p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                {totalItems === 0 ? "No items" : `Showing ${pageStart}-${pageEnd} of ${totalItems}`}
                                {itemsQuery.isFetching || containersQuery.isFetching ? <span> / Updating...</span> : null}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" disabled={!canGoPrevious} onClick={goToPreviousPage}>
                                    Previous
                                </Button>
                                <span className="rounded-lg border border-border px-3 py-2 text-zinc-950">{page + 1}</span>
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
                title={deleteRequest?.title ?? "Delete items"}
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

function FilterSelect({
    label,
    value,
    onChange,
    options,
    labels,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    labels?: Record<string, string>;
}) {
    return (
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            {label}
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-10 rounded-xl border border-border bg-white px-3 text-sm font-normal text-zinc-950 outline-none focus:ring-2 focus:ring-ring"
            >
                <option value="all">All</option>
                {options.map((option) => (
                    <option key={option} value={option}>{labels?.[option] ?? option}</option>
                ))}
            </select>
        </label>
    );
}
