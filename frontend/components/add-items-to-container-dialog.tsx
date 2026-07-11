"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Check, Filter, Loader2, Minus, Package, Search, SlidersHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, Container, InventoryLabel, Item } from "@/lib/api";
import {
    buildContainerItemPickerRows,
    filterAndSortContainerItemRows,
    ItemAvailabilityFilter,
    ItemSortOrder,
} from "@/lib/container-item-picker";
import { cn } from "@/lib/utils";
import { LabelList } from "@/components/labels/label-chip";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    containerId: string;
    containerName: string;
    items: Item[];
    containers: Container[];
    isLoading?: boolean;
    loadError?: string;
};

const availabilityOptions: Array<{ value: ItemAvailabilityFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "available", label: "Available" },
    { value: "assigned", label: "In a container" },
];

const sortOptions: Array<{ value: ItemSortOrder; label: string }> = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
];

export function AddItemsToContainerDialog({
    open,
    onOpenChange,
    containerId,
    containerName,
    items,
    containers,
    isLoading = false,
    loadError = "",
}: Props) {
    const queryClient = useQueryClient();
    const [query, setQuery] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [availability, setAvailability] = useState<ItemAvailabilityFilter>("available");
    const [sortOrder, setSortOrder] = useState<ItemSortOrder>("newest");
    const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    const rows = useMemo(
        () => buildContainerItemPickerRows(items, containers, containerId),
        [containerId, containers, items],
    );
    const filteredRows = useMemo(
        () => filterAndSortContainerItemRows(rows, { query, availability, selectedLabelIds, sortOrder }),
        [availability, query, rows, selectedLabelIds, sortOrder],
    );
    const labels = useMemo(() => {
        const labelById = new Map<string, InventoryLabel>();
        items.forEach((item) => (item.labels ?? []).forEach((label) => labelById.set(label.id, label)));
        return Array.from(labelById.values()).sort((left, right) => left.name.localeCompare(right.name));
    }, [items]);
    const selectedCount = selectedItemIds.size;
    const activeFilterCount = (availability === "available" ? 0 : 1)
        + (sortOrder === "newest" ? 0 : 1)
        + selectedLabelIds.length;

    const resetDialog = () => {
        setQuery("");
        setFiltersOpen(false);
        setAvailability("available");
        setSortOrder("newest");
        setSelectedLabelIds([]);
        setSelectedItemIds(new Set());
        setSubmitError("");
    };

    useEffect(() => {
        if (!open) resetDialog();
    }, [open]);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && isSubmitting) return;
        if (!nextOpen) resetDialog();
        onOpenChange(nextOpen);
    };

    const clearFilters = () => {
        setAvailability("available");
        setSortOrder("newest");
        setSelectedLabelIds([]);
    };

    const toggleLabel = (labelId: string) => {
        setSelectedLabelIds((current) => current.includes(labelId)
            ? current.filter((id) => id !== labelId)
            : [...current, labelId]);
    };

    const toggleItem = (itemId: string) => {
        setSubmitError("");
        setSelectedItemIds((current) => {
            const next = new Set(current);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const addSelectedItems = async () => {
        const itemIds = Array.from(selectedItemIds);
        if (itemIds.length === 0) return;

        setIsSubmitting(true);
        setSubmitError("");

        const results = await Promise.allSettled(
            itemIds.map((itemId) => api.addItemToContainer(containerId, itemId)),
        );
        const failedIds = itemIds.filter((_, index) => results[index].status === "rejected");
        const addedCount = itemIds.length - failedIds.length;

        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["container", containerId] }),
            queryClient.invalidateQueries({ queryKey: ["containers"] }),
            queryClient.invalidateQueries({ queryKey: ["items"] }),
        ]);

        setIsSubmitting(false);

        if (failedIds.length === 0) {
            resetDialog();
            onOpenChange(false);
            return;
        }

        setSelectedItemIds(new Set(failedIds));
        setSubmitError(`Added ${addedCount} of ${itemIds.length}; ${failedIds.length} failed.`);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                aria-describedby="add-items-description"
                onEscapeKeyDown={(event) => {
                    if (isSubmitting) event.preventDefault();
                }}
                onPointerDownOutside={(event) => {
                    if (isSubmitting) event.preventDefault();
                }}
                className={cn(
                    "bottom-0 left-0 top-auto flex h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-b-none rounded-t-[28px] border-x-0 border-b-0 p-0 shadow-[0_-24px_80px_rgba(15,23,42,0.18)]",
                    "sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[calc(100vh-4rem)] sm:max-h-[50rem] sm:w-[calc(100%-2rem)] sm:max-w-[56rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:border sm:shadow-[0_28px_90px_rgba(15,23,42,0.22)]",
                    "[&>button]:right-4 [&>button]:top-4 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-zinc-100 [&>button]:opacity-100 [&>button]:hover:bg-zinc-200 [&>button_svg]:h-5 [&>button_svg]:w-5",
                    isSubmitting && "[&>button]:pointer-events-none [&>button]:opacity-40",
                )}
            >
                <Minus
                    className="pointer-events-none absolute left-1/2 top-1 h-7 w-7 -translate-x-1/2 text-zinc-300 sm:hidden"
                    strokeWidth={4}
                    aria-hidden="true"
                />
                <div className="shrink-0 border-b border-border bg-white px-4 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
                    <DialogTitle className="pr-12 text-xl tracking-tight sm:text-2xl">
                        Add items to {containerName}
                    </DialogTitle>
                    <DialogDescription id="add-items-description" className="sr-only">
                        Search, filter, and select available inventory items to add to {containerName}.
                    </DialogDescription>

                    <div className="mt-5 flex gap-2.5">
                        <label className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                            <span className="sr-only">Search inventory</span>
                            <input
                                autoFocus
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search by name, label, or location..."
                                className="h-12 w-full rounded-2xl border border-border bg-white pl-11 pr-4 text-base outline-none transition placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/15 sm:h-11 sm:text-sm"
                            />
                        </label>
                        <button
                            type="button"
                            aria-label={filtersOpen ? "Hide item filters" : "Show item filters"}
                            aria-expanded={filtersOpen}
                            aria-controls="container-item-filters"
                            onClick={() => setFiltersOpen((current) => !current)}
                            className={cn(
                                "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-white text-zinc-700 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-ring sm:h-11 sm:w-11 sm:rounded-xl",
                                filtersOpen && "border-primary bg-indigo-50 text-primary",
                            )}
                        >
                            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
                            {activeFilterCount > 0 ? (
                                <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-semibold leading-4 text-white">
                                    {activeFilterCount}
                                </span>
                            ) : null}
                        </button>
                    </div>

                    {filtersOpen ? (
                        <div id="container-item-filters" className="mt-3 rounded-2xl border border-border bg-zinc-50/80 p-3.5 sm:p-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FilterButtonGroup
                                    label="Availability"
                                    value={availability}
                                    options={availabilityOptions}
                                    onChange={setAvailability}
                                />
                                <FilterButtonGroup
                                    label="Added"
                                    value={sortOrder}
                                    options={sortOptions}
                                    onChange={setSortOrder}
                                />
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Labels</p>
                                {activeFilterCount > 0 ? (
                                    <button type="button" onClick={clearFilters} className="text-xs font-medium text-primary hover:underline">
                                        Clear filters
                                    </button>
                                ) : null}
                            </div>
                            {labels.length > 0 ? (
                                <div className="mt-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                                    {labels.map((label) => {
                                        const selected = selectedLabelIds.includes(label.id);
                                        return (
                                            <button
                                                key={label.id}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => toggleLabel(label.id)}
                                                className={cn(
                                                    "rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-ring",
                                                    selected && "border-primary bg-indigo-50 text-primary ring-1 ring-primary/20",
                                                )}
                                            >
                                                {label.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="mt-2 text-sm text-muted-foreground">No item labels available.</p>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4 sm:px-7 sm:py-5">
                    {isLoading ? (
                        <PickerMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Loading inventory..." />
                    ) : loadError ? (
                        <PickerMessage icon={<Package className="h-6 w-6" />} title="Inventory could not be loaded" detail={loadError} tone="error" />
                    ) : items.length === 0 ? (
                        <PickerMessage icon={<Package className="h-6 w-6" />} title="No items yet" detail="Create an item before adding it to this container." />
                    ) : filteredRows.length === 0 ? (
                        <PickerMessage icon={<Filter className="h-6 w-6" />} title="No matching items" detail="Try another search or clear your filters." />
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Inventory items">
                            {filteredRows.map((row) => {
                                const selected = selectedItemIds.has(row.item.id);
                                const visibleLabels = (row.item.labels ?? []).slice(0, 2);

                                return (
                                    <button
                                        key={row.item.id}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={row.isSelectable
                                            ? `${selected ? "Deselect" : "Select"} ${row.item.name}`
                                            : `${row.item.name}, ${row.containerStatus}`}
                                        disabled={!row.isSelectable || isSubmitting}
                                        onClick={() => toggleItem(row.item.id)}
                                        className={cn(
                                            "group relative flex min-h-28 min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-border bg-white p-3 text-left outline-none transition",
                                            "hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                            "sm:min-h-44 sm:flex-col sm:items-stretch sm:gap-2 sm:p-2.5",
                                            selected && "border-emerald-500 shadow-[0_0_0_1px_rgba(34,197,94,0.12)] hover:border-emerald-500",
                                            !row.isSelectable && "cursor-not-allowed bg-zinc-50/80 opacity-65 hover:translate-y-0 hover:border-border hover:shadow-none",
                                        )}
                                    >
                                        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100 sm:h-24 sm:w-full">
                                            {row.item.photos?.[0]?.url ? (
                                                <Image
                                                    src={row.item.photos[0].url}
                                                    alt=""
                                                    fill
                                                    sizes="(min-width: 1024px) 180px, (min-width: 640px) 30vw, 96px"
                                                    unoptimized
                                                    className="object-contain p-1.5 transition duration-200 group-hover:scale-[1.02]"
                                                />
                                            ) : (
                                                <span className="flex h-full w-full items-center justify-center text-zinc-400">
                                                    <Package className="h-8 w-8" aria-hidden="true" />
                                                </span>
                                            )}
                                        </div>
                                        <span className="min-w-0 flex-1 sm:flex-none">
                                            <span className="block truncate text-[15px] font-semibold text-zinc-950 sm:text-sm">{row.item.name}</span>
                                            <span className="mt-2 block min-h-6">
                                                <LabelList labels={visibleLabels} />
                                            </span>
                                            {!row.isSelectable ? (
                                                <span className="mt-2 inline-flex max-w-full truncate rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
                                                    {row.containerStatus}
                                                </span>
                                            ) : null}
                                        </span>
                                        <span
                                            className={cn(
                                                "absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-transparent transition sm:right-2.5 sm:top-2.5 sm:translate-y-0",
                                                selected && "border-emerald-600 bg-emerald-600 text-white",
                                                !row.isSelectable && "hidden",
                                            )}
                                            aria-hidden="true"
                                        >
                                            <Check className="h-4 w-4" />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="shrink-0 border-t border-border bg-white px-4 py-4 sm:px-7 sm:py-5">
                    {submitError ? (
                        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
                    ) : null}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center justify-center gap-3 text-sm sm:justify-start">
                            <span className="font-semibold text-zinc-950">{selectedCount} item{selectedCount === 1 ? "" : "s"} selected</span>
                            {selectedCount > 0 ? (
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => setSelectedItemIds(new Set())}
                                    className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                                >
                                    Clear
                                </button>
                            ) : null}
                        </div>
                        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] gap-2.5 sm:flex sm:justify-end">
                            <Button
                                variant="outline"
                                className="h-12 rounded-2xl px-5 sm:h-10 sm:rounded-xl"
                                disabled={isSubmitting}
                                onClick={() => handleOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="h-12 rounded-2xl px-5 sm:h-10 sm:rounded-xl"
                                disabled={selectedCount === 0 || isSubmitting}
                                onClick={addSelectedItems}
                            >
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                                {isSubmitting ? "Adding..." : `Add Selected (${selectedCount})`}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function FilterButtonGroup<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
}) {
    return (
        <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{label}</legend>
            <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-200/70 p-1">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "min-w-0 flex-1 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 outline-none transition hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-ring",
                            value === option.value && "bg-white text-zinc-950 shadow-sm",
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </fieldset>
    );
}

function PickerMessage({
    icon,
    title,
    detail,
    tone = "neutral",
}: {
    icon: React.ReactNode;
    title: string;
    detail?: string;
    tone?: "neutral" | "error";
}) {
    return (
        <div className={cn(
            "flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-zinc-50 px-6 text-center text-muted-foreground",
            tone === "error" && "border-red-200 bg-red-50 text-red-700",
        )}>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">{icon}</span>
            <p className="font-semibold text-zinc-950">{title}</p>
            {detail ? <p className={cn("mt-1 max-w-sm text-sm", tone === "error" && "text-red-700")}>{detail}</p> : null}
        </div>
    );
}
