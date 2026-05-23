"use client";

import Link from "next/link";
import { Box, ChevronRight } from "lucide-react";
import { Container } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ContainersTable({ containers }: { containers: Container[] }) {
    if (containers.length === 0) {
        return (
            <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
                No kits yet.
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                <tr>
                    <th className="p-3 text-left">Kit</th>
                    <th className="p-3 text-left">Items</th>
                    <th className="p-3 text-left">Created</th>
                    <th className="p-3 text-right"></th>
                </tr>
                </thead>
                <tbody>
                {containers.map((container) => (
                    <tr key={container.id} className="border-t hover:bg-gray-50">
                        <td className="p-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-orange-50 text-orange-600">
                                    {container.photos?.[0]?.url ? (
                                        <img
                                            src={container.photos[0].url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <Box className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <Link href={`/kits/${container.id}`} className="font-medium">
                                        {container.name}
                                    </Link>
                                    {container.description ? (
                                        <p className="text-xs text-gray-500">{container.description}</p>
                                    ) : null}
                                </div>
                            </div>
                        </td>
                        <td className="p-3">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                {container.items_count ?? container.items?.length ?? 0} items
                            </span>
                        </td>
                        <td className="p-3 text-gray-500">{formatDate(container.created_at)}</td>
                        <td className="p-3 text-right">
                            <Link href={`/kits/${container.id}`}>
                                <Button size="sm" variant="outline">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </Link>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}
