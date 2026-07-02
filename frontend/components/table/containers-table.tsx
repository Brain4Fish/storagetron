"use client";

import Link from "next/link";
import { Box, ChevronRight, MapPin, Trash2 } from "lucide-react";
import { Container } from "@/lib/api";
import { formatLocation } from "@/lib/location";
import { formatDate } from "@/lib/utils";
import { containerItemCount } from "@/lib/inventory-view";
import { Button } from "@/components/ui/button";
import { ImagePreview } from "@/components/image-preview";
import { LabelList } from "@/components/labels/label-chip";

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
            <div className="apple-card rounded-2xl p-6 text-sm text-muted-foreground">
                No containers yet.
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
                {containers.map((container) => (
                    <article key={container.id} className="apple-card rounded-2xl p-3">
                        <div className="flex gap-3">
                            {canSelect ? (
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${container.name}`}
                                    checked={selectedContainerIds?.has(container.id) ?? false}
                                    onChange={() => onToggleContainer?.(container.id)}
                                    className="mt-2 h-4 w-4 shrink-0 rounded border-gray-300 accent-primary"
                                />
                            ) : null}
                            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 text-zinc-700">
                                {container.photos?.[0]?.url ? (
                                    <ImagePreview
                                        src={container.photos[0].url}
                                        alt={container.name}
                                        className="rounded-2xl"
                                    />
                                ) : (
                                    <Box className="h-8 w-8" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <Link href={`/containers/${container.id}`} className="line-clamp-2 text-lg font-semibold tracking-tight text-zinc-950">
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
                                <div className="mt-2 space-y-1.5">
                                    <LabelList labels={container.labels} />
                                    <LabelList labels={container.inherited_labels} inherited />
                                </div>
                                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Box className="h-4 w-4" />
                                        <span>{containerItemCount(container)} items</span>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <MapPin className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{formatLocation(container.location) || "No location"}</span>
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                    Added {formatDate(container.created_at)}
                                </div>
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            <div className="apple-card hidden overflow-hidden rounded-2xl md:block">
                <table className="w-full min-w-[820px] text-sm">
                    <thead className="bg-zinc-50 text-xs font-medium text-muted-foreground">
                        <tr>
                            {canSelect ? (
                                <th className="w-12 px-4 py-3 text-left">
                                    <input
                                        type="checkbox"
                                        aria-label="Select all visible containers"
                                        checked={allVisibleSelected}
                                        ref={(input) => {
                                            if (input) input.indeterminate = someVisibleSelected;
                                        }}
                                        onChange={(event) => onToggleContainers?.(visibleContainerIds, event.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                                    />
                                </th>
                            ) : null}
                            <th className="px-4 py-3 text-left">Container</th>
                            <th className="px-4 py-3 text-left">Location</th>
                            <th className="px-4 py-3 text-left">Items</th>
                            <th className="px-4 py-3 text-left">Labels</th>
                            <th className="px-4 py-3 text-left">Created</th>
                            <th className="w-24 px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {containers.map((container) => (
                            <tr key={container.id} className="transition hover:bg-zinc-50">
                                {canSelect ? (
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            aria-label={`Select ${container.name}`}
                                            checked={selectedContainerIds?.has(container.id) ?? false}
                                            onChange={() => onToggleContainer?.(container.id)}
                                            className="h-4 w-4 rounded border-gray-300 accent-primary"
                                        />
                                    </td>
                                ) : null}
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-700">
                                            {container.photos?.[0]?.url ? (
                                                <ImagePreview
                                                    src={container.photos[0].url}
                                                    alt={container.name}
                                                    className="rounded-xl"
                                                />
                                            ) : (
                                                <Box className="h-5 w-5" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <Link href={`/containers/${container.id}`} className="font-semibold text-zinc-950 hover:text-primary">
                                                {container.name}
                                            </Link>
                                            {container.description ? (
                                                <p className="truncate text-xs text-muted-foreground">{container.description}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    {formatLocation(container.location) ? (
                                        <span>{formatLocation(container.location)}</span>
                                    ) : (
                                        <span className="text-muted-foreground">No location</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="status-pill bg-indigo-50 text-primary">
                                        {containerItemCount(container)} items
                                    </span>
                                </td>
                                <td className="max-w-72 px-4 py-3">
                                    <div className="space-y-1.5">
                                        <LabelList labels={container.labels} empty={(container.inherited_labels ?? []).length ? undefined : "—"} />
                                        <LabelList labels={container.inherited_labels} inherited />
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{formatDate(container.created_at)}</td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-1">
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
                                        <Link href={`/containers/${container.id}`}>
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
