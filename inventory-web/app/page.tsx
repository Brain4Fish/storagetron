import Link from "next/link";
import { Box, Package, QrCode, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";

export default function HomePage() {
    return (
        <PageShell>
            <div className="grid gap-6 md:grid-cols-4">
                <Link href="/items">
                    <Card className="h-full rounded-2xl shadow-soft transition hover:-translate-y-0.5">
                        <CardHeader>
                            <Package className="h-6 w-6" />
                            <CardTitle>Items</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Browse inventory, create new items, and manage records.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/kits">
                    <Card className="h-full rounded-2xl shadow-soft transition hover:-translate-y-0.5">
                        <CardHeader>
                            <Box className="h-6 w-6" />
                            <CardTitle>Kits</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Group assets into boxes, shelves, rooms, and working kits.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/scan">
                    <Card className="h-full rounded-2xl shadow-soft transition hover:-translate-y-0.5">
                        <CardHeader>
                            <QrCode className="h-6 w-6" />
                            <CardTitle>Scan</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Scan a QR code with your camera and jump to the linked item.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/print/items">
                    <Card className="h-full rounded-2xl shadow-soft transition hover:-translate-y-0.5">
                        <CardHeader>
                            <Printer className="h-6 w-6" />
                            <CardTitle>Print</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Open a clean printable list of all items.
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </PageShell>
    );
}
