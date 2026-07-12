"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { InventoryLabel, LabelColor } from "@/lib/api";
import { LABEL_COLORS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchableLabelPicker({ labels, selectedIds, onChange, onCreate, isCreating, compact = false }: {
    labels: InventoryLabel[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    onCreate: (data: { name: string; color: LabelColor }) => Promise<InventoryLabel>;
    isCreating?: boolean;
    compact?: boolean;
}) {
    const [query, setQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const [color, setColor] = useState<LabelColor>("blue");
    const [error, setError] = useState("");
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const matches = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return labels.filter((label) => !normalized || label.name.toLowerCase().includes(normalized));
    }, [labels, query]);
    const chosen = labels.filter((label) => selected.has(label.id));

    const toggle = (id: string) => onChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
    const create = async () => {
        const name = query.trim();
        if (!name || name.length > 64) {
            setError("Label name must be between 1 and 64 characters.");
            return;
        }
        try {
            const label = await onCreate({ name, color });
            onChange([...selectedIds, label.id]);
            setQuery("");
            setCreating(false);
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not create label.");
        }
    };

    return (
        <div className={cn("relative", compact ? "space-y-2" : "space-y-3")}>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search or create labels..." className={cn("rounded-xl pl-10", compact ? "h-10 pr-28" : "h-12")} />
                {!creating && compact ? <Button type="button" variant="outline" size="sm" className="absolute right-1 top-1 border-dashed" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add label</Button> : null}
            </div>
            {chosen.length ? <div className="flex flex-wrap gap-2">{chosen.map((label) => {
                const option = LABEL_COLORS.find((candidate) => candidate.value === label.color);
                return <button key={label.id} type="button" onClick={() => toggle(label.id)} className="inline-flex items-center gap-2 rounded-xl border bg-zinc-50 px-3 py-2 text-sm">
                    <span className={cn("h-2.5 w-2.5 rounded-full", option?.dot ?? "bg-blue-500")} />{label.name}<X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>;
            })}</div> : null}
            {query.trim() ? <div className="max-h-36 overflow-y-auto rounded-xl border bg-white p-1">
                {matches.length ? matches.map((label) => <button key={label.id} type="button" onClick={() => toggle(label.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50">
                    <span className={cn("h-2.5 w-2.5 rounded-full", LABEL_COLORS.find((option) => option.value === label.color)?.dot ?? "bg-blue-500")} />
                    <span className="flex-1 truncate">{label.name}</span>{selected.has(label.id) ? <Check className="h-4 w-4 text-primary" /> : null}
                </button>) : <p className="px-3 py-2 text-sm text-muted-foreground">No matching labels.</p>}
            </div> : null}
            {!creating && !compact ? <Button type="button" variant="outline" className="border-dashed" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add label</Button> : null}
            {creating ? <div className="rounded-xl border bg-zinc-50 p-3">
                <p className="mb-2 text-sm font-medium">Create “{query.trim() || "new label"}”</p>
                <div className="flex flex-wrap gap-2">{LABEL_COLORS.map((option) => <button key={option.value} type="button" aria-label={`${option.label} label`} aria-pressed={color === option.value} onClick={() => setColor(option.value)} className={cn("h-7 w-7 rounded-full border-4 border-white shadow-sm ring-offset-1", option.dot, color === option.value && "ring-2 ring-primary")} />)}</div>
                <div className="mt-3 flex gap-2"><Button size="sm" onClick={create} disabled={isCreating}>Create</Button><Button size="sm" variant="ghost" onClick={() => { setCreating(false); setError(""); }}>Cancel</Button></div>
            </div> : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
    );
}
