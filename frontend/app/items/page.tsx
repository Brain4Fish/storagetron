"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, Filter, Plus, Search, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, InventoryLabel, Item } from "@/lib/api";
import { buildItemRows } from "@/lib/inventory-view";
import { LABEL_COLORS, matchesSelectedLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
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
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [page, setPage] = useState(0);
    const [query, setQuery] = useState("");
    const [locationFilter, setLocationFilter] = useState("all");
    const [containerFilter, setContainerFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [actionError, setActionError] = useState("");

    const itemsQuery = useQuery({ queryKey: ["items"], queryFn: api.listItems });
    const containersQuery = useQuery({ queryKey: ["containers"], queryFn: api.listContainers });
    const labelsQuery = useQuery({ queryKey: ["labels"], queryFn: api.listLabels });
    const items = itemsQuery.data ?? [];
    const containers = containersQuery.data ?? [];
    const labels = labelsQuery.data ?? [];

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
            if (!matchesSelectedLabels(row.item.labels, selectedLabelIds)) return false;
            return true;
        });
    }, [containerFilter, locationFilter, query, rows, selectedLabelIds, statusFilter]);

    const totalItems = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PAGE_SIZE));
    const pageRows = filteredRows.slice(page * ITEMS_PAGE_SIZE, (page + 1) * ITEMS_PAGE_SIZE);
    const pageStart = totalItems === 0 ? 0 : page * ITEMS_PAGE_SIZE + 1;
    const pageEnd = Math.min((page + 1) * ITEMS_PAGE_SIZE, totalItems);
    const canGoPrevious = page > 0;
    const canGoNext = page + 1 < totalPages;
    const selectedCount = selectedItemIds.size;
    const activeFilterCount = [
        query.trim() !== "",
        locationFilter !== "all",
        containerFilter !== "all",
        statusFilter !== "all",
    ].filter(Boolean).length + selectedLabelIds.length;

    const selectedItems = useMemo(
        () => rows.filter((row) => selectedItemIds.has(row.item.id)),
        [rows, selectedItemIds],
    );

    useEffect(() => {
        setPage(0);
    }, [containerFilter, locationFilter, query, selectedLabelIds, statusFilter]);

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
        setSelectedLabelIds([]);
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

                <section className="apple-card overflow-visible rounded-2xl p-3">
                    <div className={cn("grid gap-3", filtersExpanded && "lg:grid-cols-[minmax(0,1fr)_auto]")}>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search items, containers, locations, or labels..."
                                className="h-10 w-full rounded-xl border border-border bg-white pl-10 pr-16 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                            <button
                                type="button"
                                className="absolute right-1 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg px-2 text-muted-foreground outline-none transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={filtersExpanded ? "Hide filters" : "Show filters"}
                                aria-expanded={filtersExpanded}
                                aria-controls="items-search-filters"
                                onClick={() => setFiltersExpanded((current) => !current)}
                            >
                                {activeFilterCount > 0 ? (
                                    <span className="min-w-5 rounded-md bg-indigo-50 px-1.5 py-0.5 text-center text-xs font-medium text-primary">
                                        {activeFilterCount}
                                    </span>
                                ) : null}
                                <ChevronDown className={cn("h-4 w-4 transition", filtersExpanded && "rotate-180")} aria-hidden="true" />
                            </button>
                        </div>
                        {filtersExpanded ? (
                            <Button variant="outline" className="h-10" onClick={clearFilters}>
                                <Filter className="h-4 w-4" />
                                Clear filters
                            </Button>
                        ) : null}
                    </div>
                    {filtersExpanded ? (
                        <div id="items-search-filters" className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <FilterSelect label="Location" value={locationFilter} onChange={setLocationFilter} options={locationOptions} />
                            <FilterSelect label="Container" value={containerFilter} onChange={setContainerFilter} options={containerOptions} />
                            <LabelFilter
                                labels={labels}
                                selectedIds={selectedLabelIds}
                                isLoading={labelsQuery.isLoading}
                                hasError={labelsQuery.isError}
                                onChange={setSelectedLabelIds}
                            />
                            <FilterSelect
                                label="Status"
                                value={statusFilter}
                                onChange={setStatusFilter}
                                options={["stored", "loose"]}
                                labels={{ stored: "In Storage", loose: "No Container" }}
                            />
                        </div>
                    ) : null}
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

function LabelFilter({
    labels,
    selectedIds,
    isLoading,
    hasError,
    onChange,
}: {
    labels: InventoryLabel[];
    selectedIds: string[];
    isLoading: boolean;
    hasError: boolean;
    onChange: (ids: string[]) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

    useEffect(() => {
        if (!isOpen) return;

        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsOpen(false);
        };

        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [isOpen]);

    const buttonLabel = isLoading
        ? "Loading..."
        : hasError
            ? "Unavailable"
            : selectedIds.length === 0
                ? "All"
                : `${selectedIds.length} selected`;
    const isDisabled = isLoading || hasError || labels.length === 0;

    const toggleLabel = (labelId: string) => {
        onChange(selected.has(labelId)
            ? selectedIds.filter((id) => id !== labelId)
            : [...selectedIds, labelId]);
    };

    return (
        <div ref={rootRef} className="relative grid gap-1 text-xs font-medium text-muted-foreground">
            <span>Labels</span>
            <button
                type="button"
                className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 text-left text-sm font-normal text-zinc-950 outline-none transition hover:bg-zinc-50 focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                disabled={isDisabled}
                onClick={() => setIsOpen((current) => !current)}
            >
                <span className="truncate">{labels.length === 0 && !isLoading && !hasError ? "No labels" : buttonLabel}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition", isOpen && "rotate-180")} aria-hidden="true" />
            </button>
            {isOpen ? (
                <div
                    role="listbox"
                    aria-label="Filter by labels"
                    aria-multiselectable="true"
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 min-w-56 overflow-y-auto rounded-xl border border-border bg-white p-1.5 shadow-lg"
                >
                    {labels.map((label) => {
                        const isSelected = selected.has(label.id);
                        const color = LABEL_COLORS.find((option) => option.value === label.color);
                        return (
                            <button
                                key={label.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => toggleLabel(label.id)}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-normal text-zinc-950 outline-none transition hover:bg-zinc-50 focus:bg-zinc-50 focus:ring-2 focus:ring-inset focus:ring-ring",
                                    isSelected && "bg-indigo-50",
                                )}
                            >
                                <span className={cn("h-3 w-3 shrink-0 rounded-full", color?.dot ?? "bg-blue-500")} />
                                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                                {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
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
