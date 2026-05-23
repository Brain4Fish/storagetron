"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/error-state";

export default function PrintItemsPage() {
    const itemsQuery = useQuery({
        queryKey: ["print-items"],
        queryFn: api.listItems,
    });

    useEffect(() => {
        if (itemsQuery.isSuccess) {
            const id = window.setTimeout(() => {
                window.print();
            }, 300);

            return () => window.clearTimeout(id);
        }
    }, [itemsQuery.isSuccess]);

    return (
        <main className="mx-auto max-w-5xl px-6 py-8">
            <div className="no-print mb-6 flex justify-end">
                <Button onClick={() => window.print()}>Print</Button>
            </div>

            <section className="space-y-4 rounded-2xl bg-white p-8 shadow-soft print:shadow-none">
                <div className="border-b pb-4">
                    <h1 className="text-2xl font-semibold">Inventory Items</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Printable inventory list
                    </p>
                </div>

                {itemsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading items...</p>
                ) : itemsQuery.isError ? (
                    <ErrorState message="Failed to load printable data." />
                ) : (
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                        <tr className="border-b">
                            <th className="py-3 font-medium">Name</th>
                            <th className="py-3 font-medium">Created at</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(itemsQuery.data ?? []).map((item) => (
                            <tr key={item.id} className="border-b">
                                <td className="py-3">{item.name}</td>
                                <td className="py-3">{formatDate(item.created_at)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </section>
        </main>
    );
}