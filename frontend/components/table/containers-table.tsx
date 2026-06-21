"use client";

import Link from "next/link";
import { Box, ChevronRight, Trash2 } from "lucide-react";
import { Container } from "@/lib/api";
import { formatLocation } from "@/lib/location";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImagePreview } from "@/components/image-preview";

type ContainersTableProps = {
    containers: Container[];
    selectedContainerIds?: Set<string>;
    onToggleContainer?: (containerId: string) => void;
    onToggleContainers?: (containerIds: string[], checked: boolean) => void;
    onDeleteContainer?: (container: Container) => void;
};

export function ContainersTable({
    containers,
    selectedContainerIds,
    onToggleContainer,
    onToggleContainers,
    onDeleteContainer,
}: ContainersTableProps) {
    if (containers.length === 0) {
        return (
            <div className="floating-window rounded-2xl p-5 text-sm text-muted-foreground">
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
        <>
        <div className="space-y-3 md:hidden">
            {canSelect ? (
                <label className="floating-window flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
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
                    <span>{allVisibleSelected ? "All visible kits selected" : "Select visible kits"}</span>
                </label>
            ) : null}

            {containers.map((container) => (
                <article key={container.id} className="floating-window rounded-2xl p-3">
                    <div className="flex gap-3">
                        {canSelect ? (
                            <input
                                type="checkbox"
                                aria-label={`Select ${container.name}`}
                                checked={selectedContainerIds?.has(container.id) ?? false}
                                onChange={() => onToggleContainer?.(container.id)}
                                className="mt-2 h-4 w-4 shrink-0 rounded border-gray-300 accent-orange-600"
                            />
                        ) : null}
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/75 text-zinc-700 shadow-inner">
                            {container.photos?.[0]?.url ? (
                                <ImagePreview
                                    src={container.photos[0].url}
                                    alt={container.name}
                                    className="rounded-xl"
                                />
                            ) : (
                                <Box className="h-7 w-7" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <Link href={`/kits/${container.id}`} className="line-clamp-2 font-semibold text-zinc-950">
                                    {container.name}
                                </Link>
                                {onDeleteContainer ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                        aria-label={`Delete ${container.name}`}
                                        onClick={() => onDeleteContainer(container)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                            {container.description ? (
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{container.description}</p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="soft-bubble rounded-full px-2 py-1 text-xs text-zinc-700">
                                    {container.items_count ?? container.items?.length ?? 0} items
                                </span>
                                {formatLocation(container.location) ? (
                                    <span className="soft-bubble rounded-full px-2 py-1 text-xs text-zinc-700">
                                        {formatLocation(container.location)}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Added {formatDate(container.created_at)}
                            </div>
                        </div>
                    </div>
                </article>
            ))}
        </div>

        <div className="floating-window hidden overflow-hidden rounded-2xl md:block">
            <table className="w-full text-sm">
                <thead className="bg-white/45 text-muted-foreground">
                <tr>
                    {canSelect ? (
                        <th className="w-11 p-2.5 text-left">
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
                    <th className="p-2.5 text-left">Kit</th>
                    <th className="p-2.5 text-left">Location</th>
                    <th className="p-2.5 text-left">Items</th>
                    <th className="p-2.5 text-left">Created</th>
                    <th className="p-2.5 text-right"></th>
                </tr>
                </thead>
                <tbody>
                {containers.map((container) => (
                    <tr key={container.id} className="border-t border-white/60 hover:bg-white/45">
                        {canSelect ? (
                            <td className="p-2.5">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${container.name}`}
                                    checked={selectedContainerIds?.has(container.id) ?? false}
                                    onChange={() => onToggleContainer?.(container.id)}
                                    className="h-4 w-4 rounded border-gray-300 accent-orange-600"
                                />
                            </td>
                        ) : null}
                        <td className="p-2.5">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/70 text-zinc-700 shadow-inner">
                                    {container.photos?.[0]?.url ? (
                                        <ImagePreview
                                            src={container.photos[0].url}
                                            alt={container.name}
                                            className="rounded-full"
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
                        <td className="p-2.5">
                            {formatLocation(container.location) ? (
                                <span className="soft-bubble rounded-full px-2 py-1 text-xs text-zinc-700">
                                    {formatLocation(container.location)}
                                </span>
                            ) : (
                                <span className="text-xs text-muted-foreground">No location</span>
                            )}
                        </td>
                        <td className="p-2.5">
                            <span className="soft-bubble rounded-full px-2 py-1 text-xs text-zinc-700">
                                {container.items_count ?? container.items?.length ?? 0} items
                            </span>
                        </td>
                        <td className="p-2.5 text-muted-foreground">{formatDate(container.created_at)}</td>
                        <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-2">
                                {onDeleteContainer ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        aria-label={`Delete ${container.name}`}
                                        onClick={() => onDeleteContainer(container)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                                <Link href={`/kits/${container.id}`}>
                                    <Button size="sm" variant="outline">
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
        </>
    );
}
