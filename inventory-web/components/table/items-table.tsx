"use client";

import Link from "next/link";
import { Item } from "@/lib/api";
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
            <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
                No assets yet.
            </div>
        );
    }

    const visibleItemIds = items.map((item) => item.id);
    const selectedVisibleCount = visibleItemIds.filter((id) => selectedItemIds.has(id)).length;
    const allVisibleSelected = selectedVisibleCount === visibleItemIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

    return (
        <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                    <tr>
                        <th className="w-12 p-3 text-left">
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
                        <th className="p-3 text-left">Name</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-left">Created</th>
                        <th className="p-3 text-right"></th>
                    </tr>
                    </thead>

                    <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-t hover:bg-gray-50">
                            <td className="p-3">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${item.name}`}
                                    checked={selectedItemIds.has(item.id)}
                                    onChange={() => onToggleItem(item.id)}
                                    className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                                />
                            </td>
                            <td className="p-3 flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-200 rounded-lg overflow-hidden">
                                    {item.photos?.[0]?.url ? (
                                        <img
                                            src={item.photos[0].url}
                                            className="w-full h-full object-cover transition-transform hover:scale-105"
                                        />
                                    ) : (

                                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
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

                            <td className="p-3">
                                <span className="text-green-600 bg-green-100 px-2 py-1 rounded-full text-xs">
                                    Available
                                </span>
                            </td>

                            <td className="p-3 text-gray-500">
                                {formatDate(item.created_at)}
                            </td>

                            <td className="p-3 text-right">
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
