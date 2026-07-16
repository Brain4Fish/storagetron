"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Container } from "@/lib/api";
import { downloadSelectedKitsXlsx } from "@/lib/export-assets";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { CreateContainerDialog } from "@/components/forms/create-container-dialog";
import { ContainersTable } from "@/components/table/containers-table";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";

type DeleteRequest = {
    ids: string[];
    title: string;
    subject: string;
};

export default function KitsPage() {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [selectedContainerIds, setSelectedContainerIds] = useState<Set<string>>(() => new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [actionError, setActionError] = useState("");
    const [query, setQuery] = useState("");
    const { data, isLoading } = useQuery({
        queryKey: ["containers"],
        queryFn: api.listContainers,
    });
    const containers = useMemo(() => data ?? [], [data]);
    const filteredContainers = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return containers;
        return containers.filter((container) => [
            container.name,
            container.description,
            ...(container.labels ?? []).map((label) => label.name),
            ...(container.inherited_labels ?? []).map((label) => label.name),
        ].filter(Boolean).join(" ").toLowerCase().includes(normalized));
    }, [containers, query]);
    const selectedCount = selectedContainerIds.size;
    const allFilteredContainersSelected = filteredContainers.length > 0
        && filteredContainers.every((container) => selectedContainerIds.has(container.id));

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

    const selectAllFilteredContainers = () => {
        setSelectedContainerIds((current) => {
            const next = new Set(current);
            filteredContainers.forEach((container) => next.add(container.id));
            return next;
        });
    };

    const clearSelection = () => {
        setExportError("");
        setActionError("");
        setSelectedContainerIds(new Set());
    };

    const downloadSelectedXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedKitsXlsx(selectedContainerIds);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export selected containers.");
        } finally {
            setIsExporting(false);
        }
    };

    const openDeleteKits = (ids: string[], subject: string) => {
        setDeleteError("");
        setActionError("");
        setDeleteRequest({
            ids,
            subject,
            title: ids.length === 1 ? "Delete container" : "Delete containers",
        });
    };

    const openDeleteKit = (container: Container) => {
        openDeleteKits([container.id], container.name);
    };

    const openDeleteSelected = () => {
        const ids = Array.from(selectedContainerIds);
        if (ids.length === 0) return;
        openDeleteKits(ids, `${ids.length} selected container${ids.length === 1 ? "" : "s"}`);
    };

    const confirmDelete = async () => {
        if (!deleteRequest) return;

        setIsDeleting(true);
        setDeleteError("");
        setActionError("");

        const ids = deleteRequest.ids;
        const results = await Promise.allSettled(ids.map((containerId) => api.deleteContainer(containerId)));
        const deletedIds = ids.filter((_, index) => results[index].status === "fulfilled");
        const failedCount = ids.length - deletedIds.length;

        if (deletedIds.length > 0) {
            setSelectedContainerIds((current) => {
                const next = new Set(current);
                deletedIds.forEach((containerId) => next.delete(containerId));
                return next;
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
                queryClient.invalidateQueries({ queryKey: ["items"] }),
            ]);
        }

        setIsDeleting(false);

        if (failedCount === 0) {
            setDeleteRequest(null);
            return;
        }

        const message = deletedIds.length > 0
            ? `Deleted ${deletedIds.length} of ${ids.length}. ${failedCount} failed.`
            : `Could not delete ${ids.length === 1 ? "this container" : "these containers"}.`;

        if (deletedIds.length > 0) {
            setDeleteRequest(null);
            setActionError(message);
        } else {
            setDeleteError(message);
        }
    };

    return (
        <PageShell>
            <div className="space-y-5 pt-16 md:pt-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-semibold tracking-tight">Containers</h1>
                            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-muted-foreground">{containers.length} containers</span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Boxes, shelves, rooms, and grouped items.</p>
                    </div>
                    <Button onClick={() => setOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Add Container
                    </Button>
                </div>

                <section className="apple-card rounded-2xl p-4">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search containers or labels..." className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    </label>
                </section>

                {selectedCount > 0 ? (
                    <div className="apple-card flex flex-col gap-3 rounded-2xl p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <span className="font-medium">{selectedCount} selected</span>
                            {selectedContainers.length > 0 ? (
                                <span className="text-muted-foreground"> · {selectedContainers.length} loaded</span>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                onClick={selectAllFilteredContainers}
                                disabled={filteredContainers.length === 0 || allFilteredContainersSelected}
                            >
                                Select all
                            </Button>
                            <Button variant="outline" onClick={clearSelection}>
                                Clear selection
                            </Button>
                            <Button onClick={downloadSelectedXlsx} disabled={isExporting}>
                                <Download className="h-4 w-4" />
                                {isExporting ? "Preparing..." : "Download XLSX"}
                            </Button>
                            <Button variant="destructive" onClick={openDeleteSelected} disabled={isDeleting}>
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </Button>
                        </div>
                        {exportError || actionError ? (
                            <p className="text-sm text-destructive sm:basis-full">{exportError || actionError}</p>
                        ) : null}
                    </div>
                ) : null}

                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading containers...</p>
                ) : (
                    <ContainersTable
                        containers={filteredContainers}
                        selectedContainerIds={selectedContainerIds}
                        onToggleContainer={toggleContainer}
                        onToggleContainers={toggleContainers}
                        onDeleteContainer={openDeleteKit}
                    />
                )}
            </div>

            <CreateContainerDialog open={open} onOpenChange={setOpen} />
            <DeleteConfirmationDialog
                open={deleteRequest !== null}
                title={deleteRequest?.title ?? "Delete containers"}
                isDeleting={isDeleting}
                error={deleteError}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !isDeleting) setDeleteRequest(null);
                }}
                onConfirm={confirmDelete}
            >
                This permanently deletes <span className="font-semibold text-zinc-950">{deleteRequest?.subject}</span>. Items inside deleted containers stay in inventory.
            </DeleteConfirmationDialog>
        </PageShell>
    );
}
