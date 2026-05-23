"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, LayoutDashboard, Package, PackageOpen, QrCode } from "lucide-react";
import { VersionBadge } from "@/components/version-badge";
import { cn } from "@/lib/utils";

const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/items", label: "Assets", icon: Package },
    { href: "/kits", label: "Kits", icon: Box },
    { href: "/scan", label: "Scan", icon: QrCode },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="flex w-full shrink-0 flex-col border-b bg-white p-3 md:h-dvh md:w-64 md:border-b-0 md:border-r md:p-4">
            <Link href="/" className="mb-3 flex items-center gap-2 px-1 text-xl font-semibold md:mb-6">
                <PackageOpen className="h-6 w-6 text-orange-600" />
                <span>Shelf</span>
            </Link>

            <nav className="flex gap-2 overflow-x-auto text-sm md:block md:space-y-2 md:overflow-visible">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                        item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex min-w-max items-center gap-2 rounded-lg px-3 py-2 transition hover:bg-gray-100",
                                isActive && "bg-orange-100 text-orange-600 hover:bg-orange-100",
                            )}
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
