"use client";

import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Archive,
    Box,
    ChevronDown,
    Home,
    MapPin,
    Package,
    PackageOpen,
    Plus,
    QrCode,
    Settings,
    Tags,
} from "lucide-react";
import { VersionBadge } from "@/components/version-badge";
import { cn } from "@/lib/utils";

const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/items", label: "Items", icon: Package },
    { href: "/containers", label: "Containers", icon: Box },
    { href: "/locations", label: "Locations", icon: MapPin },
    { href: "/labels", label: "Labels", icon: Tags },
    { href: "/scan", label: "Scan", icon: QrCode },
];

const systemItems = [
    { href: "/settings/backups", label: "Backups", icon: Archive },
    { href: "/settings/backups", label: "Settings", icon: Settings },
];

const mobileItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/items", label: "Inventory", icon: Box },
    { href: "/scan", label: "Scan", icon: QrCode },
    { href: "/labels", label: "Labels", icon: Tags },
    { href: "/settings/backups", label: "Settings", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/containers") return pathname.startsWith("/containers") || pathname.startsWith("/kits");
    return pathname.startsWith(href);
}

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside
            className="glass-panel fixed inset-y-0 left-0 z-30 hidden w-64 shrink-0 flex-col px-4 py-5 md:flex"
        >
            <div className="mb-6 flex items-center justify-between gap-3">
                <Link
                    href="/"
                    className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-lg font-semibold tracking-tight text-zinc-950"
                    aria-label="Storagetron home"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm">
                        <PackageOpen className="h-5 w-5" />
                    </span>
                    <span className="truncate">Storagetron</span>
                </Link>
            </div>

            <nav className="space-y-6 text-sm">
                <NavSection items={navItems} pathname={pathname} />
                <div className="border-t border-border pt-5">
                    <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">System</p>
                    <NavSection items={systemItems} pathname={pathname} />
                </div>
            </nav>

            <div className="mt-auto space-y-3">
                <div className="rounded-2xl border border-border bg-white p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600">
                            U
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-950">User Name</p>
                            <p className="truncate text-xs text-muted-foreground">Account role</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                </div>
                <VersionBadge />
            </div>
        </aside>
    );
}

function NavSection({
    items,
    pathname,
}: {
    items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
    pathname: string;
}) {
    return (
        <div className="space-y-1">
            {items.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(pathname, item.href);

                return (
                    <Link
                        key={`${item.href}-${item.label}`}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950",
                            isActive && "bg-indigo-50 text-primary hover:bg-indigo-50",
                        )}
                        title={item.label}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </div>
    );
}

export function MobileNav() {
    const pathname = usePathname();

    return (
        <>
            <div className="fixed inset-x-0 top-0 z-20 border-b border-border bg-white/85 px-4 py-3 backdrop-blur md:hidden">
                <div className="flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                        <PackageOpen className="h-6 w-6" />
                        Storagetron
                    </Link>
                    <Link
                        href="/items"
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-primary shadow-sm"
                        aria-label="Add or manage items"
                    >
                        <Plus className="h-6 w-6" />
                    </Link>
                </div>
            </div>
            <nav className="fixed inset-x-0 bottom-0 z-30 rounded-t-[1.75rem] border border-border bg-white/92 px-3 pb-4 pt-2 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
                <div className="grid grid-cols-5 items-end gap-1">
                    {mobileItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = isActivePath(pathname, item.href);
                        const isScan = item.href === "/scan";

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs text-zinc-600",
                                    isActive && "text-primary",
                                    isScan && "-mt-6",
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex h-8 w-8 items-center justify-center rounded-xl",
                                        isActive && "bg-indigo-50",
                                        isScan && "h-14 w-14 rounded-full border border-border bg-white text-zinc-800 shadow-soft",
                                    )}
                                >
                                    <Icon className={cn("h-5 w-5", isScan && "h-6 w-6")} />
                                </span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}
