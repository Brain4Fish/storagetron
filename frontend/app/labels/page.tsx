"use client";

import { useMemo, useState } from "react";
import { Edit3, Plus, Search, Tags, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, InventoryLabel, LabelColor } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { LabelChip } from "@/components/labels/label-chip";
import { LabelDialog } from "@/components/labels/label-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";

export default function LabelsPage() {
    const queryClient = useQueryClient();
    const [query, setQuery] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<InventoryLabel | null>(null);
    const [deleting, setDeleting] = useState<InventoryLabel | null>(null);
    const [error, setError] = useState("");
    const labelsQuery = useQuery({ queryKey: ["labels"], queryFn: api.listLabels });
    const labels = useMemo(() => labelsQuery.data ?? [], [labelsQuery.data]);
    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return normalized ? labels.filter((label) => label.name.toLowerCase().includes(normalized)) : labels;
    }, [labels, query]);

    const refreshInventory = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["labels"] }),
            queryClient.invalidateQueries({ queryKey: ["items"] }),
            queryClient.invalidateQueries({ queryKey: ["containers"] }),
        ]);
    };
    const saveMutation = useMutation({
        mutationFn: (data: { name: string; color: LabelColor }) => editing ? api.updateLabel(editing.id, data) : api.createLabel(data),
        onSuccess: async () => {
            setDialogOpen(false);
            setEditing(null);
            setError("");
            await refreshInventory();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save label"),
    });
    const deleteMutation = useMutation({
        mutationFn: () => api.deleteLabel(deleting!.id),
        onSuccess: async () => {
            setDeleting(null);
            setError("");
            await refreshInventory();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Could not delete label"),
    });

    return (
        <PageShell>
            <div className="space-y-5 pt-16 md:pt-0">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-semibold tracking-tight">Labels</h1>
                            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-muted-foreground">{labels.length} labels</span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Reusable tags for organizing items and containers.</p>
                    </div>
                    <Button onClick={() => { setEditing(null); setError(""); setDialogOpen(true); }}><Plus className="h-4 w-4" />Add Label</Button>
                </header>

                <section className="apple-card rounded-2xl p-4">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search labels..." className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    </label>
                </section>

                {labelsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading labels...</p> : labelsQuery.isError ? <p className="text-sm text-destructive">Could not load labels.</p> : filtered.length === 0 ? (
                    <section className="apple-card flex flex-col items-center rounded-2xl px-6 py-14 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600"><Tags className="h-6 w-6" /></span>
                        <h2 className="mt-4 font-semibold">{labels.length ? "No matching labels" : "No labels yet"}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{labels.length ? "Try another search." : "Create a label, then attach it to items and containers."}</p>
                    </section>
                ) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {filtered.map((label) => <article key={label.id} className="apple-card flex items-center justify-between gap-3 rounded-2xl p-4"><div><LabelChip label={label} /><p className="mt-2 text-xs text-muted-foreground">Updated {formatDate(label.updated_at)}</p></div><Actions label={label} onEdit={() => { setEditing(label); setError(""); setDialogOpen(true); }} onDelete={() => { setError(""); setDeleting(label); }} /></article>)}
                        </div>
                        <div className="apple-card hidden overflow-hidden rounded-2xl md:block">
                            <table className="w-full text-sm"><thead className="bg-zinc-50 text-xs font-medium text-muted-foreground"><tr><th className="px-4 py-3 text-left">Label</th><th className="px-4 py-3 text-left">Updated</th><th className="w-28 px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border">{filtered.map((label) => <tr key={label.id} className="hover:bg-zinc-50"><td className="px-4 py-3"><LabelChip label={label} /></td><td className="px-4 py-3 text-muted-foreground">{formatDate(label.updated_at)}</td><td className="px-4 py-3"><Actions label={label} onEdit={() => { setEditing(label); setError(""); setDialogOpen(true); }} onDelete={() => { setError(""); setDeleting(label); }} /></td></tr>)}</tbody></table>
                        </div>
                    </>
                )}
            </div>

            <LabelDialog open={dialogOpen} label={editing} isSaving={saveMutation.isPending} error={error} onOpenChange={(open) => { if (!saveMutation.isPending) setDialogOpen(open); }} onSave={(data) => saveMutation.mutate(data)} />
            <DeleteConfirmationDialog open={deleting !== null} title="Delete label" isDeleting={deleteMutation.isPending} error={error} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleting(null); }} onConfirm={() => deleteMutation.mutate()}>
                Delete <span className="font-semibold text-zinc-950">{deleting?.name}</span>? Items and containers will remain; only this label and its assignments are removed.
            </DeleteConfirmationDialog>
        </PageShell>
    );
}

function Actions({ label, onEdit, onDelete }: { label: InventoryLabel; onEdit: () => void; onDelete: () => void }) {
    return <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${label.name}`} onClick={onEdit}><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${label.name}`} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></div>;
}
