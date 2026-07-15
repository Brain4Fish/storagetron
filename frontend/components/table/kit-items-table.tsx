"use client";

import Link from "next/link";
import { Loader2, Package, X } from "lucide-react";
import { Item, photoContentUrl } from "@/lib/api";
import { effectiveItemLocation, formatLocation, isInheritedItemLocation } from "@/lib/location";
import { formatDate } from "@/lib/utils";
import { ImagePreview } from "@/components/image-preview";

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
            <div className="apple-card rounded-2xl p-6 text-sm text-muted-foreground">
                No items in this container yet.
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
            <label className="apple-card flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                <input
                    type="checkbox"
                    aria-label="Select all visible container items"
                    checked={allVisibleSelected}
                    ref={(input) => {
                        if (input) input.indeterminate = someVisibleSelected;
                    }}
                    onChange={(event) => onToggleItems(visibleItemIds, event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                />
                <span>{allVisibleSelected ? "All visible container items selected" : "Select visible container items"}</span>
            </label>

            {items.map((item) => (
                <article key={item.id} className="apple-card rounded-2xl p-3">
                    <div className="flex gap-3">
                        <input
                            type="checkbox"
                            aria-label={`Select ${item.name}`}
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => onToggleItem(item.id)}
                            className="mt-2 h-4 w-4 shrink-0 rounded border-gray-300 accent-primary"
                        />
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-muted-foreground">
                            {item.photos?.[0]?.url ? (
                                <ImagePreview
                                    src={photoContentUrl(item.photos[0])}
                                    alt={item.name}
                                    className="rounded-xl"
                                    sizes="80px"
                                />
                            ) : (
                                <Package className="h-7 w-7" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <Link href={`/items/${item.id}`} className="line-clamp-2 font-semibold text-zinc-950">
                                    {item.name}
                                </Link>
                                {onRemove ? (
                                    <button
                                        type="button"
                                        aria-label={`Remove ${item.name} from container`}
                                        disabled={removingItemId === item.id}
                                        onClick={() => onRemove(item.id)}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
                                    >
                                        {removingItemId === item.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <X className="h-4 w-4" />
                                        )}
                                    </button>
                                ) : null}
                            </div>
                            {item.description ? (
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {formatLocation(effectiveItemLocation(item)) ? (
                                    <span className="status-pill bg-zinc-100 text-zinc-700">
                                        {formatLocation(effectiveItemLocation(item))}
                                        {isInheritedItemLocation(item) ? " (container)" : ""}
                                    </span>
                                ) : (
                                    <span className="status-pill bg-zinc-100 text-muted-foreground">No location</span>
                                )}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Added {formatDate(item.created_at)}
                            </div>
                        </div>
                    </div>
                </article>
            ))}
        </div>

        <div className="apple-card hidden overflow-hidden rounded-2xl md:block">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-zinc-50 text-xs font-medium text-muted-foreground">
                    <tr>
                        <th className="w-12 p-3 text-left">
                            <input
                                type="checkbox"
                                aria-label="Select all visible container items"
                                checked={allVisibleSelected}
                                ref={(input) => {
                                    if (input) input.indeterminate = someVisibleSelected;
                                }}
                                onChange={(event) => onToggleItems(visibleItemIds, event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 accent-primary"
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
                        <tr key={item.id} className="group border-t border-border hover:bg-zinc-50">
                            <td className="p-3">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${item.name}`}
                                    checked={selectedItemIds.has(item.id)}
                                    onChange={() => onToggleItem(item.id)}
                                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                                />
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-gray-200">
                                        {item.photos?.[0]?.url ? (
                                            <ImagePreview
                                                src={photoContentUrl(item.photos[0])}
                                                alt={item.name}
                                                className="rounded-lg"
                                                sizes="48px"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-gray-400">
                                                <Package className="h-5 w-5" />
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
                                    <span className="status-pill bg-zinc-100 text-zinc-700">
                                        {formatLocation(effectiveItemLocation(item))}
                                        {isInheritedItemLocation(item) ? " (container)" : ""}
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
                                        aria-label={`Remove ${item.name} from container`}
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
        </>
    );
}
