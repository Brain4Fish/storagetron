import Link from "next/link";
import { Box, MapPin, Package, QrCode, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";

export default function HomePage() {
    return (
        <PageShell>
            <div className="grid gap-3 md:grid-cols-5">
                <Link href="/items">
                    <Card className="h-full transition hover:-translate-y-0.5">
                        <CardHeader>
                            <span className="soft-bubble flex h-10 w-10 items-center justify-center rounded-full">
                                <Package className="h-5 w-5" />
                            </span>
                            <CardTitle>Items</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Browse inventory, create new items, and manage records.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/kits">
                    <Card className="h-full transition hover:-translate-y-0.5">
                        <CardHeader>
                            <span className="soft-bubble flex h-10 w-10 items-center justify-center rounded-full">
                                <Box className="h-5 w-5" />
                            </span>
                            <CardTitle>Kits</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Group assets into boxes, shelves, rooms, and working kits.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/scan">
                    <Card className="h-full transition hover:-translate-y-0.5">
                        <CardHeader>
                            <span className="soft-bubble flex h-10 w-10 items-center justify-center rounded-full">
                                <QrCode className="h-5 w-5" />
                            </span>
                            <CardTitle>Scan</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Scan a QR code with your camera and jump to the linked item.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/locations">
                    <Card className="h-full transition hover:-translate-y-0.5">
                        <CardHeader>
                            <span className="soft-bubble flex h-10 w-10 items-center justify-center rounded-full">
                                <MapPin className="h-5 w-5" />
                            </span>
                            <CardTitle>Locations</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Manage country, city, room, and shelf records.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/print/items">
                    <Card className="h-full transition hover:-translate-y-0.5">
                        <CardHeader>
                            <span className="soft-bubble flex h-10 w-10 items-center justify-center rounded-full">
                                <Printer className="h-5 w-5" />
                            </span>
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
