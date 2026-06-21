"use client";

import Link from "next/link";
import { Package, Trash2 } from "lucide-react";
import { Item } from "@/lib/api";
import { effectiveItemLocation, formatLocation, isInheritedItemLocation } from "@/lib/location";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImagePreview } from "@/components/image-preview";

type ItemsTableProps = {
    items: Item[];
    selectedItemIds: Set<string>;
    onToggleItem: (itemId: string) => void;
    onToggleItems: (itemIds: string[], checked: boolean) => void;
    onDeleteItem?: (item: Item) => void;
};

export function ItemsTable({ items, selectedItemIds, onToggleItem, onToggleItems, onDeleteItem }: ItemsTableProps) {
    if (items.length === 0) {
        return (
            <div className="floating-window rounded-2xl p-5 text-sm text-muted-foreground">
                No assets yet.
            </div>
        );
    }

    const visibleItemIds = items.map((item) => item.id);
    const selectedVisibleCount = visibleItemIds.filter((id) => selectedItemIds.has(id)).length;
    const allVisibleSelected = selectedVisibleCount === visibleItemIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

    return (
        <>
        <div className="space-y-3 md:hidden">
            <label className="floating-window flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                <input
                    type="checkbox"
                    aria-label="Select all visible assets"
                    checked={allVisibleSelected}
                    ref={(input) => {
                        if (input) input.indeterminate = someVisibleSelected;
                    }}
                    onChange={(event) => onToggleItems(visibleItemIds, event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                />
                <span>{allVisibleSelected ? "All visible assets selected" : "Select visible assets"}</span>
            </label>

            {items.map((item) => (
                <article key={item.id} className="floating-window rounded-2xl p-3">
                    <div className="flex gap-3">
                        <input
                            type="checkbox"
                            aria-label={`Select ${item.name}`}
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => onToggleItem(item.id)}
                            className="mt-2 h-4 w-4 shrink-0 rounded border-gray-300 accent-orange-600"
                        />
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/75 shadow-inner">
                            {item.photos?.[0]?.url ? (
                                <ImagePreview
                                    src={item.photos[0].url}
                                    alt={item.name}
                                    className="rounded-xl"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <Package className="h-7 w-7" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <Link href={`/items/${item.id}`} className="line-clamp-2 font-semibold text-zinc-950">
                                    {item.name}
                                </Link>
                                {onDeleteItem ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                        aria-label={`Delete ${item.name}`}
                                        onClick={() => onDeleteItem(item)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="soft-bubble rounded-full px-2 py-1 text-xs text-emerald-700">
                                    Available
                                </span>
                                {formatLocation(effectiveItemLocation(item)) ? (
                                    <span className="soft-bubble rounded-full px-2 py-1 text-xs text-zinc-700">
                                        {formatLocation(effectiveItemLocation(item))}
                                        {isInheritedItemLocation(item) ? " (kit)" : ""}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Added {formatDate(item.created_at)}
                            </div>
                        </div>
                    </div>
                </article>
            ))}
        </div>

        <div className="floating-window hidden overflow-hidden rounded-2xl md:block">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-white/45 text-muted-foreground">
                    <tr>
                        <th className="w-11 p-2.5 text-left">
                            <input
                                type="checkbox"
                                aria-label="Select all visible assets"
                                checked={allVisibleSelected}
                                ref={(input) => {
                                    if (input) input.indeterminate = someVisibleSelected;
                                }}
                                onChange={(event) => onToggleItems(visibleItemIds, event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                            />
                        </th>
                        <th className="p-2.5 text-left">Name</th>
                        <th className="p-2.5 text-left">Location</th>
                        <th className="p-2.5 text-left">Status</th>
                        <th className="p-2.5 text-left">Created</th>
                        <th className="p-2.5 text-right"></th>
                    </tr>
                    </thead>

                    <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-t border-white/60 hover:bg-white/45">
                            <td className="p-2.5">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${item.name}`}
                                    checked={selectedItemIds.has(item.id)}
                                    onChange={() => onToggleItem(item.id)}
                                    className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                                />
                            </td>
                            <td className="flex items-center gap-2.5 p-2.5">
                                <div className="h-9 w-9 overflow-hidden rounded-full bg-white/70 shadow-inner">
                                    {item.photos?.[0]?.url ? (
                                        <ImagePreview
                                            src={item.photos[0].url}
                                            alt={item.name}
                                            className="rounded-full"
                                        />
                                    ) : (

                                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                                            <Package className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <Link href={`/items/${item.id}`} className="font-medium">
                                        {item.name}
                                    </Link>
                                </div>
                            </td>

                            <td className="p-2.5">
                                {formatLocation(effectiveItemLocation(item)) ? (
                                    <span className="soft-bubble rounded-full px-2 py-1 text-xs text-zinc-700">
                                        {formatLocation(effectiveItemLocation(item))}
                                        {isInheritedItemLocation(item) ? " (kit)" : ""}
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">No location</span>
                                )}
                            </td>

                            <td className="p-2.5">
                                <span className="soft-bubble rounded-full px-2 py-1 text-xs text-emerald-700">
                                    Available
                                </span>
                            </td>

                            <td className="p-2.5 text-muted-foreground">
                                {formatDate(item.created_at)}
                            </td>

                            <td className="p-2.5 text-right">
                                <div className="flex justify-end gap-2">
                                    {onDeleteItem ? (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            aria-label={`Delete ${item.name}`}
                                            onClick={() => onDeleteItem(item)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    ) : null}
                                    <Link href={`/items/${item.id}`}>
                                        <Button size="sm" variant="outline">
                                            Open
                                        </Button>
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
