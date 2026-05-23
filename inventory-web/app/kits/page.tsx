"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { CreateContainerDialog } from "@/components/forms/create-container-dialog";
import { ContainersTable } from "@/components/table/containers-table";

export default function KitsPage() {
    const [open, setOpen] = useState(false);
    const { data, isLoading } = useQuery({
        queryKey: ["containers"],
        queryFn: api.listContainers,
    });
    const containers = data ?? [];

    return (
        <PageShell>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Kits</h1>
                        <p className="text-sm text-gray-500">Boxes, shelves, rooms, and grouped assets.</p>
                    </div>
                    <Button onClick={() => setOpen(true)}>New kit</Button>
                </div>

                {isLoading ? (
                    <p className="text-gray-500">Loading...</p>
                ) : (
                    <ContainersTable containers={containers} />
                )}
            </div>

            <CreateContainerDialog open={open} onOpenChange={setOpen} />
        </PageShell>
    );
}
