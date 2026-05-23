"use client";

import Link from "next/link";

export function AppHeader() {
    return (
        <header className="border-b bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
                <Link href="/" className="text-lg font-semibold">
                    Inventory
                </Link>

                <nav className="flex gap-4 text-sm text-muted-foreground">
                    <Link href="/items" className="hover:text-black">
                        Items
                    </Link>
                    <Link href="/scan" className="hover:text-black">
                        Scan
                    </Link>
                    <Link href="/print/items" className="hover:text-black">
                        Print
                    </Link>
                </nav>
            </div>
        </header>
    );
}