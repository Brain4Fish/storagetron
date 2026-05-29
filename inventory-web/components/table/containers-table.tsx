"use client";

import Link from "next/link";
import { Box, ChevronRight } from "lucide-react";
import { Container } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ContainersTableProps = {
    containers: Container[];
    selectedContainerIds?: Set<string>;
    onToggleContainer?: (containerId: string) => void;
    onToggleContainers?: (containerIds: string[], checked: boolean) => void;
};

export function ContainersTable({
    containers,
    selectedContainerIds,
    onToggleContainer,
    onToggleContainers,
}: ContainersTableProps) {
    if (containers.length === 0) {
        return (
            <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
                No kits yet.
            </div>
        );
    }

    const canSelect = Boolean(selectedContainerIds && onToggleContainer && onToggleContainers);
    const visibleContainerIds = containers.map((container) => container.id);
    const selectedVisibleCount = canSelect
        ? visibleContainerIds.filter((id) => selectedContainerIds?.has(id)).length
        : 0;
    const allVisibleSelected = canSelect && selectedVisibleCount === visibleContainerIds.length;
    const someVisibleSelected = canSelect && selectedVisibleCount > 0 && !allVisibleSelected;

    return (
        <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                <tr>
                    {canSelect ? (
                        <th className="w-12 p-3 text-left">
                            <input
                                type="checkbox"
                                aria-label="Select all visible kits"
                                checked={allVisibleSelected}
                                ref={(input) => {
                                    if (input) input.indeterminate = someVisibleSelected;
                                }}
                                onChange={(event) => onToggleContainers?.(visibleContainerIds, event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                            />
                        </th>
                    ) : null}
                    <th className="p-3 text-left">Kit</th>
                    <th className="p-3 text-left">Items</th>
                    <th className="p-3 text-left">Created</th>
                    <th className="p-3 text-right"></th>
                </tr>
                </thead>
                <tbody>
                {containers.map((container) => (
                    <tr key={container.id} className="border-t hover:bg-gray-50">
                        {canSelect ? (
                            <td className="p-3">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${container.name}`}
                                    checked={selectedContainerIds?.has(container.id) ?? false}
                                    onChange={() => onToggleContainer?.(container.id)}
                                    className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                                />
                            </td>
                        ) : null}
                        <td className="p-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-orange-50 text-orange-600">
                                    {container.photos?.[0]?.url ? (
                                        <img
                                            src={container.photos[0].url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <Box className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <Link href={`/kits/${container.id}`} className="font-medium">
                                        {container.name}
                                    </Link>
                                    {container.description ? (
                                        <p className="text-xs text-gray-500">{container.description}</p>
                                    ) : null}
                                </div>
                            </div>
                        </td>
                        <td className="p-3">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                {container.items_count ?? container.items?.length ?? 0} items
                            </span>
                        </td>
                        <td className="p-3 text-gray-500">{formatDate(container.created_at)}</td>
                        <td className="p-3 text-right">
                            <Link href={`/kits/${container.id}`}>
                                <Button size="sm" variant="outline">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </Link>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}
