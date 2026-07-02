"use client";

import Link from "next/link";
import { Box, Building2, MoreHorizontal, Package, Trash2 } from "lucide-react";
import { Item } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ItemRowView, itemStatusLabel } from "@/lib/inventory-view";
import { Button } from "@/components/ui/button";
import { ImagePreview } from "@/components/image-preview";
import { LabelList } from "@/components/labels/label-chip";

type ItemsTableProps = {
    rows: ItemRowView[];
    selectedItemIds: Set<string>;
    onToggleItem: (itemId: string) => void;
    onToggleItems: (itemIds: string[], checked: boolean) => void;
    onDeleteItem?: (item: Item) => void;
};

export function ItemsTable({ rows, selectedItemIds, onToggleItem, onToggleItems, onDeleteItem }: ItemsTableProps) {
    if (rows.length === 0) {
        return (
            <div className="apple-card rounded-2xl p-6 text-sm text-muted-foreground">
                No items match this view.
            </div>
        );
    }

    const visibleItemIds = rows.map((row) => row.item.id);
    const selectedVisibleCount = visibleItemIds.filter((id) => selectedItemIds.has(id)).length;
    const allVisibleSelected = selectedVisibleCount === visibleItemIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

    return (
        <>
            <div className="space-y-3 md:hidden">
                {rows.map((row) => (
                    <article key={row.item.id} className="apple-card rounded-2xl p-3">
                        <div className="flex gap-3">
                            <div className="h-[7.25rem] w-[7.25rem] shrink-0 overflow-hidden rounded-2xl bg-zinc-100">
                                {row.item.photos?.[0]?.url ? (
                                    <ImagePreview
                                        src={row.item.photos[0].url}
                                        alt={row.item.name}
                                        className="rounded-2xl"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                        <Package className="h-8 w-8" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <Link href={`/items/${row.item.id}`} className="line-clamp-2 text-lg font-semibold tracking-tight text-zinc-950">
                                        {row.item.name}
                                    </Link>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground"
                                        aria-label={`Select ${row.item.name}`}
                                        onClick={() => onToggleItem(row.item.id)}
                                    >
                                        <MoreHorizontal className="h-5 w-5" />
                                    </Button>
                                </div>
                                {row.item.description ? (
                                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{row.item.description}</p>
                                ) : null}
                                <div className="mt-2"><LabelList labels={row.item.labels} /></div>
                                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Building2 className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{row.locationLabel}</span>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Box className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{row.containerLabel}</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <span className={statusClass(row.status)}>{itemStatusLabel(row.status)}</span>
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            aria-label={`Select ${row.item.name}`}
                                            checked={selectedItemIds.has(row.item.id)}
                                            onChange={() => onToggleItem(row.item.id)}
                                            className="h-4 w-4 rounded border-gray-300 accent-primary"
                                        />
                                        Select
                                    </label>
                                </div>
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            <div className="apple-card hidden overflow-hidden rounded-2xl md:block">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-sm">
                        <thead className="bg-zinc-50 text-xs font-medium text-muted-foreground">
                            <tr>
                                <th className="w-12 px-4 py-3 text-left">
                                    <input
                                        type="checkbox"
                                        aria-label="Select all visible items"
                                        checked={allVisibleSelected}
                                        ref={(input) => {
                                            if (input) input.indeterminate = someVisibleSelected;
                                        }}
                                        onChange={(event) => onToggleItems(visibleItemIds, event.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left">Item</th>
                                <th className="px-4 py-3 text-left">Location</th>
                                <th className="px-4 py-3 text-left">Container</th>
                                <th className="px-4 py-3 text-left">Labels</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Added</th>
                                <th className="w-24 px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {rows.map((row) => (
                                <tr key={row.item.id} className="transition hover:bg-zinc-50">
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            aria-label={`Select ${row.item.name}`}
                                            checked={selectedItemIds.has(row.item.id)}
                                            onChange={() => onToggleItem(row.item.id)}
                                            className="h-4 w-4 rounded border-gray-300 accent-primary"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 overflow-hidden rounded-xl bg-zinc-100">
                                                {row.item.photos?.[0]?.url ? (
                                                    <ImagePreview
                                                        src={row.item.photos[0].url}
                                                        alt={row.item.name}
                                                        className="rounded-xl"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                                        <Package className="h-5 w-5" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <Link href={`/items/${row.item.id}`} className="font-semibold text-zinc-950 hover:text-primary">
                                                    {row.item.name}
                                                </Link>
                                                <p className="truncate text-xs text-muted-foreground">{row.item.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-zinc-700">{row.locationLabel}</td>
                                    <td className="px-4 py-3">
                                        {row.container ? (
                                            <Link href={`/containers/${row.container.id}`} className="font-medium text-primary hover:underline">
                                                {row.containerLabel}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">{row.containerLabel}</span>
                                        )}
                                    </td>
                                    <td className="max-w-64 px-4 py-3"><LabelList labels={row.item.labels} empty="—" /></td>
                                    <td className="px-4 py-3">
                                        <span className={statusClass(row.status)}>{itemStatusLabel(row.status)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{formatDate(row.item.created_at)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            {onDeleteItem ? (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    aria-label={`Delete ${row.item.name}`}
                                                    onClick={() => onDeleteItem(row.item)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            ) : null}
                                            <Link href={`/items/${row.item.id}`}>
                                                <Button size="sm" variant="outline">Open</Button>
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function statusClass(status: ItemRowView["status"]) {
    if (status === "stored") {
        return "status-pill bg-emerald-50 text-emerald-700";
    }

    return "status-pill bg-amber-50 text-amber-700";
}
