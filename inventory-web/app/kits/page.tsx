"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { downloadSelectedKitsXlsx } from "@/lib/export-assets";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { CreateContainerDialog } from "@/components/forms/create-container-dialog";
import { ContainersTable } from "@/components/table/containers-table";

const SELECTED_KITS_STORAGE_KEY = "storagetron:selected-kits";

function getSavedSelectedContainerIds() {
    try {
        const saved = window.localStorage.getItem(SELECTED_KITS_STORAGE_KEY);
        if (!saved) {
            return new Set<string>();
        }

        const containerIds = JSON.parse(saved);
        if (!Array.isArray(containerIds)) {
            return new Set<string>();
        }

        return new Set(containerIds.filter((id) => typeof id === "string"));
    } catch {
        return new Set<string>();
    }
}

export default function KitsPage() {
    const [open, setOpen] = useState(false);
    const [selectionReady, setSelectionReady] = useState(false);
    const [selectedContainerIds, setSelectedContainerIds] = useState<Set<string>>(() => new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const { data, isLoading } = useQuery({
        queryKey: ["containers"],
        queryFn: api.listContainers,
    });
    const containers = data ?? [];
    const selectedCount = selectedContainerIds.size;

    useEffect(() => {
        setSelectedContainerIds(getSavedSelectedContainerIds());
        setSelectionReady(true);
    }, []);

    useEffect(() => {
        if (!selectionReady) {
            return;
        }

        window.localStorage.setItem(
            SELECTED_KITS_STORAGE_KEY,
            JSON.stringify(Array.from(selectedContainerIds)),
        );
    }, [selectedContainerIds, selectionReady]);

    const selectedContainers = useMemo(
        () => containers.filter((container) => selectedContainerIds.has(container.id)),
        [containers, selectedContainerIds],
    );

    const toggleContainer = (containerId: string) => {
        setSelectedContainerIds((current) => {
            const next = new Set(current);
            if (next.has(containerId)) {
                next.delete(containerId);
            } else {
                next.add(containerId);
            }
            return next;
        });
    };

    const toggleContainers = (containerIds: string[], checked: boolean) => {
        setSelectedContainerIds((current) => {
            const next = new Set(current);
            containerIds.forEach((containerId) => {
                if (checked) {
                    next.add(containerId);
                } else {
                    next.delete(containerId);
                }
            });
            return next;
        });
    };

    const clearSelection = () => {
        setExportError("");
        setSelectedContainerIds(new Set());
    };

    const downloadSelectedXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedKitsXlsx(selectedContainerIds);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export selected kits.");
        } finally {
            setIsExporting(false);
        }
    };

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

                {selectedCount > 0 ? (
                    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 text-sm shadow-soft sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <span className="font-medium">{selectedCount} selected</span>
                            {selectedContainers.length > 0 ? (
                                <span className="text-muted-foreground"> · {selectedContainers.length} loaded</span>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={downloadSelectedXlsx} disabled={isExporting}>
                                <Download className="h-4 w-4" />
                                {isExporting ? "Preparing..." : "Download XLSX"}
                            </Button>
                            <Button variant="outline" onClick={clearSelection}>
                                Clear selection
                            </Button>
                        </div>
                        {exportError ? <p className="text-sm text-destructive sm:basis-full">{exportError}</p> : null}
                    </div>
                ) : null}

                {isLoading ? (
                    <p className="text-gray-500">Loading...</p>
                ) : (
                    <ContainersTable
                        containers={containers}
                        selectedContainerIds={selectedContainerIds}
                        onToggleContainer={toggleContainer}
                        onToggleContainers={toggleContainers}
                    />
                )}
            </div>

            <CreateContainerDialog open={open} onOpenChange={setOpen} />
        </PageShell>
    );
}
