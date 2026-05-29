"use client";

import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { Item } from "@/lib/api";
import { effectiveItemLocation, formatLocation, isInheritedItemLocation } from "@/lib/location";
import { formatDate } from "@/lib/utils";

type Props = {
    items: Item[];
    selectedItemIds: Set<string>;
    onToggleItem: (itemId: string) => void;
    onToggleItems: (itemIds: string[], checked: boolean) => void;
    onRemove?: (itemId: string) => void;
    removingItemId?: string;
};

export function KitItemsTable({
                                  items,
                                  selectedItemIds,
                                  onToggleItem,
                                  onToggleItems,
                                  onRemove,
                                  removingItemId,
                              }: Props) {
    if (items.length === 0) {
        return (
            <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
                No items in this kit yet.
            </div>
        );
    }

    const visibleItemIds = items.map((item) => item.id);
    const selectedVisibleCount = visibleItemIds.filter((id) => selectedItemIds.has(id)).length;
    const allVisibleSelected = selectedVisibleCount === visibleItemIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

    return (
        <div className="overflow-hidden rounded-xl border bg-white">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                    <tr>
                        <th className="w-12 p-3 text-left">
                            <input
                                type="checkbox"
                                aria-label="Select all visible kit assets"
                                checked={allVisibleSelected}
                                ref={(input) => {
                                    if (input) input.indeterminate = someVisibleSelected;
                                }}
                                onChange={(event) => onToggleItems(visibleItemIds, event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                            />
                        </th>
                        <th className="p-3 text-left">Item</th>
                        <th className="p-3 text-left">Location</th>
                        <th className="p-3 text-left">Created</th>
                        <th className="w-12 p-3 text-right"></th>
                    </tr>
                    </thead>
                    <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="group border-t hover:bg-gray-50">
                            <td className="p-3">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${item.name}`}
                                    checked={selectedItemIds.has(item.id)}
                                    onChange={() => onToggleItem(item.id)}
                                    className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                                />
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-gray-200">
                                        {item.photos?.[0]?.url ? (
                                            <img
                                                src={item.photos[0].url}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                                                No image
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <Link href={`/items/${item.id}`} className="font-medium">
                                            {item.name}
                                        </Link>
                                        {item.description ? (
                                            <p className="text-xs text-gray-500">{item.description}</p>
                                        ) : null}
                                    </div>
                                </div>
                            </td>
                            <td className="p-3">
                                {formatLocation(effectiveItemLocation(item)) ? (
                                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                        {formatLocation(effectiveItemLocation(item))}
                                        {isInheritedItemLocation(item) ? " (kit)" : ""}
                                    </span>
                                ) : (
                                    <span className="text-xs text-gray-500">No location</span>
                                )}
                            </td>
                            <td className="p-3 text-gray-500">{formatDate(item.created_at)}</td>
                            <td className="p-3 text-right">
                                {onRemove ? (
                                    <button
                                        type="button"
                                        aria-label={`Remove ${item.name} from kit`}
                                        disabled={removingItemId === item.id}
                                        onClick={() => onRemove(item.id)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-70"
                                    >
                                        {removingItemId === item.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <X className="h-4 w-4" />
                                        )}
                                    </button>
                                ) : null}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
