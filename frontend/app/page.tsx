"use client";

import type React from "react";
import Link from "next/link";
import Image from "next/image";
import {
    ArrowRight,
    Box,
    MapPin,
    Package,
    Plus,
    QrCode,
    Search,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, Container, Item } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { effectiveItemLocation, formatLocation } from "@/lib/location";
import { containerItemCount } from "@/lib/inventory-view";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export default function HomePage() {
    const itemsQuery = useQuery({ queryKey: ["items"], queryFn: api.listItems });
    const containersQuery = useQuery({ queryKey: ["containers"], queryFn: api.listContainers });
    const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: api.listLocations });

    const items = itemsQuery.data ?? [];
    const containers = containersQuery.data ?? [];
    const locations = locationsQuery.data ?? [];
    const containedItemIds = new Set(containers.flatMap((container) => (container.items ?? []).map((item) => item.id)));
    const looseItems = items.filter((item) => !containedItemIds.has(item.id)).length;
    const recentItems = [...items]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 4);
    const topContainers = [...containers]
        .sort((a, b) => containerItemCount(b) - containerItemCount(a))
        .slice(0, 3);
    const isLoading = itemsQuery.isLoading || containersQuery.isLoading || locationsQuery.isLoading;

    return (
        <PageShell>
            <div className="space-y-6 pt-16 md:pt-0">
                <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Home inventory</p>
                        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
                            Storage overview
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">Here is what is happening in your storage.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/scan">
                            <Button variant="outline">
                                <QrCode className="h-4 w-4" />
                                Scan
                            </Button>
                        </Link>
                        <Link href="/items">
                            <Button>
                                <Plus className="h-4 w-4" />
                                Add New
                            </Button>
                        </Link>
                    </div>
                </header>

                <Link
                    href="/items"
                    className="apple-card flex h-14 items-center justify-between rounded-2xl px-4 text-sm text-muted-foreground transition hover:bg-zinc-50"
                >
                    <span className="flex min-w-0 items-center gap-3">
                        <Search className="h-5 w-5 shrink-0" />
                        <span className="truncate">Search items, containers, locations, labels...</span>
                    </span>
                    <QrCode className="h-5 w-5 shrink-0" />
                </Link>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard icon={Package} label="Items" value={items.length} href="/items" color="text-primary bg-indigo-50" />
                    <StatCard icon={Box} label="Containers" value={containers.length} href="/containers" color="text-emerald-600 bg-emerald-50" />
                    <StatCard icon={MapPin} label="Locations" value={locations.length} href="/locations" color="text-amber-600 bg-amber-50" />
                    <StatCard icon={Package} label="Loose Items" value={looseItems} href="/items?status=loose" color="text-rose-600 bg-rose-50" />
                </section>

                {isLoading ? (
                    <div className="apple-card rounded-2xl p-5 text-sm text-muted-foreground">Loading inventory...</div>
                ) : (
                    <div className="grid items-stretch gap-4 xl:grid-cols-2">
                        <section className="apple-card rounded-2xl p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Containers</h2>
                                <Link href="/containers" className="flex items-center gap-1 text-sm font-medium text-primary">
                                    View all <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {topContainers.length > 0 ? topContainers.map((container) => (
                                    <Link
                                        key={container.id}
                                        href={`/containers/${container.id}`}
                                        className="rounded-2xl border border-border p-4 transition hover:bg-zinc-50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                                                <Box className="h-6 w-6" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{container.name}</p>
                                                <p className="text-sm text-muted-foreground">{containerItemCount(container)} items</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                                            <div
                                                className="h-full rounded-full bg-primary"
                                                style={{ width: `${Math.min(100, Math.max(8, containerItemCount(container) * 4))}%` }}
                                            />
                                        </div>
                                    </Link>
                                )) : (
                                    <p className="text-sm text-muted-foreground">No containers yet.</p>
                                )}
                            </div>
                        </section>

                        <section className="apple-card rounded-2xl p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Recently Added</h2>
                                <Link href="/items" className="flex items-center gap-1 text-sm font-medium text-primary">
                                    View all <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                            <div className="divide-y divide-border">
                                {recentItems.length > 0 ? recentItems.map((item) => (
                                    <RecentItem key={item.id} item={item} containers={containers} />
                                )) : (
                                    <p className="py-4 text-sm text-muted-foreground">No items yet.</p>
                                )}
                            </div>
                        </section>
                    </div>
                )}

            </div>
        </PageShell>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    href,
    color,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    href: string;
    color: string;
}) {
    return (
        <Link href={href} className="apple-card rounded-2xl p-5 transition hover:-translate-y-0.5 hover:bg-zinc-50">
            <div className="flex items-start justify-between gap-4">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}>
                    <Icon className="h-6 w-6" />
                </span>
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                    View all <ArrowRight className="h-4 w-4" />
                </span>
            </div>
            <div className="mt-5 text-3xl font-semibold tracking-tight">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
        </Link>
    );
}

function RecentItem({ item, containers }: { item: Item; containers: Container[] }) {
    const container = containers.find((candidate) => (candidate.items ?? []).some((candidateItem) => candidateItem.id === item.id));
    const firstPhoto = item.photos?.[0]?.url;

    return (
        <Link href={`/items/${item.id}`} className="flex items-center gap-3 py-3 transition hover:bg-zinc-50">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                {firstPhoto ? (
                    <Image src={firstPhoto} alt="" fill sizes="56px" unoptimized className="object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Package className="h-5 w-5" />
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                    {formatLocation(effectiveItemLocation(item)) || "No location"}
                    {container ? ` / ${container.name}` : ""}
                </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">{formatDate(item.created_at)}</div>
        </Link>
    );
}
