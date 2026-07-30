"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Box, Check, Filter, Loader2, MapPin, Minus, Search, Tags } from "lucide-react";
import { Container, InventoryLabel, photoContentUrl } from "@/lib/api";
import { containerItemCount } from "@/lib/inventory-view";
import { matchesSelectedLabels } from "@/lib/labels";
import { formatLocation } from "@/lib/location";
import { cn } from "@/lib/utils";
import { LabelList } from "@/components/labels/label-chip";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "@/components/ui/dialog";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    containers: Container[];
    selectedContainerIds: Set<string>;
    onConfirm: (containerIds: string[]) => void;
    isLoading?: boolean;
    loadError?: string;
};

export function ContainerReportPickerDialog({
    open,
    onOpenChange,
    containers,
    selectedContainerIds,
    onConfirm,
    isLoading = false,
    loadError = "",
}: Props) {
    const [query, setQuery] = useState("");
    const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
    const [draftIds, setDraftIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (!open) return;
        setQuery("");
        setSelectedLabelIds([]);
        setDraftIds(new Set(selectedContainerIds));
    }, [open, selectedContainerIds]);

    const labels = useMemo(() => {
        const byId = new Map<string, InventoryLabel>();
        containers.forEach((container) => {
            (container.labels ?? []).forEach((label) => byId.set(label.id, label));
        });
        return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, "ru"));
    }, [containers]);

    const filteredContainers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return containers.filter((container) => {
            const searchableText = [
                container.name,
                container.package_code,
                formatLocation(container.location),
                ...(container.labels ?? []).map((label) => label.name),
            ].filter(Boolean).join(" ").toLowerCase();

            if (normalizedQuery && !searchableText.includes(normalizedQuery)) return false;
            return matchesSelectedLabels(container.labels, selectedLabelIds);
        });
    }, [containers, query, selectedLabelIds]);

    const allFilteredSelected = filteredContainers.length > 0
        && filteredContainers.every((container) => draftIds.has(container.id));

    const toggleContainer = (containerId: string) => {
        setDraftIds((current) => {
            const next = new Set(current);
            if (next.has(containerId)) next.delete(containerId);
            else next.add(containerId);
            return next;
        });
    };

    const selectAllFiltered = () => {
        setDraftIds((current) => {
            const next = new Set(current);
            filteredContainers.forEach((container) => next.add(container.id));
            return next;
        });
    };

    const toggleLabel = (labelId: string) => {
        setSelectedLabelIds((current) => current.includes(labelId)
            ? current.filter((id) => id !== labelId)
            : [...current, labelId]);
    };

    const confirm = () => {
        onConfirm(Array.from(draftIds));
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "bottom-0 left-0 top-auto flex h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-b-none rounded-t-[28px] border-x-0 border-b-0 p-0 shadow-[0_-24px_80px_rgba(15,23,42,0.18)]",
                    "sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[calc(100vh-4rem)] sm:max-h-[50rem] sm:w-[calc(100%-2rem)] sm:max-w-[56rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:border sm:shadow-[0_28px_90px_rgba(15,23,42,0.22)]",
                    "[&>button]:right-4 [&>button]:top-4 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-zinc-100 [&>button]:opacity-100 [&>button]:hover:bg-zinc-200 [&>button_svg]:h-5 [&>button_svg]:w-5",
                )}
            >
                <Minus
                    className="pointer-events-none absolute left-1/2 top-1 h-7 w-7 -translate-x-1/2 text-zinc-300 sm:hidden"
                    strokeWidth={4}
                    aria-hidden="true"
                />

                <div className="shrink-0 border-b border-border bg-white px-4 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
                    <DialogTitle className="pr-12 text-xl tracking-tight sm:text-2xl">
                        Выбрать коробки
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Поиск, фильтрация и множественный выбор коробок для отчёта.
                    </DialogDescription>

                    <label className="relative mt-5 block">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                        <span className="sr-only">Поиск коробок</span>
                        <input
                            autoFocus
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Поиск по названию, номеру, локации или label..."
                            className="h-12 w-full rounded-2xl border border-border bg-white pl-11 pr-4 text-base outline-none transition placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/15 sm:h-11 sm:text-sm"
                        />
                    </label>

                    {labels.length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-border bg-zinc-50/80 p-3.5">
                            <div className="flex items-center justify-between gap-3">
                                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                                    <Tags className="h-4 w-4" />
                                    Labels
                                </p>
                                {selectedLabelIds.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedLabelIds([])}
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        Clear filters
                                    </button>
                                ) : null}
                            </div>
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
                        </div>
                    ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4 sm:px-7 sm:py-5">
                    {isLoading ? (
                        <PickerMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Загружаем коробки..." />
                    ) : loadError ? (
                        <PickerMessage icon={<Box className="h-6 w-6" />} title="Не удалось загрузить коробки" detail={loadError} tone="error" />
                    ) : containers.length === 0 ? (
                        <PickerMessage icon={<Box className="h-6 w-6" />} title="Коробок пока нет" />
                    ) : filteredContainers.length === 0 ? (
                        <PickerMessage icon={<Filter className="h-6 w-6" />} title="Ничего не найдено" detail="Измените поиск или очистите фильтры." />
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Коробки">
                            {filteredContainers.map((container) => {
                                const selected = draftIds.has(container.id);
                                return (
                                    <button
                                        key={container.id}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={`${selected ? "Убрать" : "Выбрать"} ${container.name}`}
                                        onClick={() => toggleContainer(container.id)}
                                        className={cn(
                                            "group relative flex min-h-32 min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-border bg-white p-3 text-left outline-none transition",
                                            "hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                            "sm:min-h-56 sm:flex-col sm:items-stretch sm:gap-2 sm:p-2.5",
                                            selected && "border-emerald-500 shadow-[0_0_0_1px_rgba(34,197,94,0.12)] hover:border-emerald-500",
                                        )}
                                    >
                                        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100 sm:h-28 sm:w-full">
                                            {container.photos?.[0]?.url ? (
                                                <Image
                                                    src={photoContentUrl(container.photos[0])}
                                                    alt=""
                                                    fill
                                                    sizes="(min-width: 1024px) 180px, (min-width: 640px) 30vw, 96px"
                                                    className="object-contain p-1.5 transition duration-200 group-hover:scale-[1.02]"
                                                />
                                            ) : (
                                                <span className="flex h-full w-full items-center justify-center text-zinc-400">
                                                    <Box className="h-8 w-8" aria-hidden="true" />
                                                </span>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1 sm:w-full">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="line-clamp-2 font-semibold text-zinc-950">{container.name}</p>
                                                <span className={cn(
                                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white text-transparent",
                                                    selected && "border-emerald-500 bg-emerald-500 text-white",
                                                )}>
                                                    <Check className="h-4 w-4" aria-hidden="true" />
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {container.package_code || "Без номера"} · {containerItemCount(container)} шт.
                                            </p>
                                            <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">{formatLocation(container.location) || "Без локации"}</span>
                                            </p>
                                            <div className="mt-2">
                                                <LabelList labels={container.labels} />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <DialogFooter className="m-0 shrink-0 flex-col-reverse items-stretch border-t border-border bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:pb-5 sm:pt-4">
                    <p className="text-center text-sm text-muted-foreground sm:text-left">
                        Выбрано: <span className="font-semibold text-zinc-950">{draftIds.size}</span>
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                        <Button
                            variant="outline"
                            onClick={selectAllFiltered}
                            disabled={filteredContainers.length === 0 || allFilteredSelected}
                        >
                            Select all filtered
                        </Button>
                        <Button variant="ghost" onClick={() => setDraftIds(new Set())} disabled={draftIds.size === 0}>
                            Clear
                        </Button>
                        <Button onClick={confirm}>Готово</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
