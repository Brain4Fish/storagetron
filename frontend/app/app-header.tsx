import Link from "next/link";

export function AppHeader() {
    return (
        <header className="no-print border-b bg-white/80 backdrop-blur">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-6">
                <Link href="/" className="text-lg font-semibold tracking-tight">
                    Inventory
                </Link>

                <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                    <Link href="/items" className="hover:text-foreground">
                        Items
                    </Link>
                    <Link href="/containers" className="hover:text-foreground">
                        Containers
                    </Link>
                    <Link href="/scan" className="hover:text-foreground">
                        Scan
                    </Link>
                    <Link href="/print/items" className="hover:text-foreground">
                        Print
                    </Link>
                </nav>
            </div>
        </header>
    );
}
