"use client";

import Link from "next/link";
import { Item } from "@/lib/api";
import { effectiveItemLocation, formatLocation, isInheritedItemLocation } from "@/lib/location";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ItemsTableProps = {
    items: Item[];
    selectedItemIds: Set<string>;
    onToggleItem: (itemId: string) => void;
    onToggleItems: (itemIds: string[], checked: boolean) => void;
};

export function ItemsTable({ items, selectedItemIds, onToggleItem, onToggleItems }: ItemsTableProps) {
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
        <div className="floating-window overflow-hidden rounded-2xl">
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
                                        <img
                                            src={item.photos[0].url}
                                            className="w-full h-full object-cover transition-transform hover:scale-105"
                                        />
                                    ) : (

                                        <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                                            📦
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
                                <Link href={`/items/${item.id}`}>
                                    <Button size="sm" variant="outline">
                                        Open
                                    </Button>
                                </Link>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
