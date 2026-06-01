"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, LayoutDashboard, MapPin, Package, PackageOpen, PanelLeftClose, QrCode, Settings } from "lucide-react";
import { VersionBadge } from "@/components/version-badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/items", label: "Assets", icon: Package },
    { href: "/kits", label: "Kits", icon: Box },
    { href: "/locations", label: "Locations", icon: MapPin },
    { href: "/scan", label: "Scan", icon: QrCode },
    { href: "/settings/backups", label: "Settings", icon: Settings },
];

type SidebarProps = {
    onHide: () => void;
};

export function Sidebar({ onHide }: SidebarProps) {
    const pathname = usePathname();

    return (
        <aside
            className="glass-panel sticky top-2 z-20 mx-2 mt-2 flex shrink-0 flex-col rounded-2xl p-2 transition-all duration-300 md:h-[calc(100dvh-1rem)] md:w-56"
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <Link
                    href="/"
                    className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-base font-semibold transition hover:bg-white/70"
                    aria-label="Shelf home"
                >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-white shadow-inner">
                        <PackageOpen className="h-4 w-4" />
                    </span>
                    <span className="truncate">Storagetron</span>
                </Link>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onHide}
                    className="h-8 w-8 shrink-0 rounded-full"
                    aria-label="Hide sidebar"
                    title="Hide sidebar"
                >
                    <PanelLeftClose className="h-4 w-4" />
                </Button>
            </div>

            <nav className="flex gap-1 overflow-x-auto text-sm md:block md:space-y-1 md:overflow-visible">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                        item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex min-w-max items-center gap-2 rounded-xl px-3 py-2 text-zinc-600 transition hover:bg-white/70 hover:text-zinc-950",
                                isActive && "bg-white text-zinc-950 shadow-sm ring-1 ring-black/5 hover:bg-white",
                            )}
                            title={item.label}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto hidden md:block">
                <VersionBadge />
            </div>
        </aside>
    );
}
