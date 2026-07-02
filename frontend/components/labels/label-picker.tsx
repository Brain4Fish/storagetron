import Link from "next/link";
import { Check } from "lucide-react";
import { InventoryLabel } from "@/lib/api";
import { LABEL_COLORS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function LabelPicker({ labels, selectedIds, onChange }: {
    labels: InventoryLabel[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
}) {
    const selected = new Set(selectedIds);
    if (labels.length === 0) {
        return <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">No labels yet. <Link href="/labels" className="font-medium text-primary hover:underline">Create one first</Link>.</p>;
    }
    return (
        <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {labels.map((label) => {
                const isSelected = selected.has(label.id);
                const color = LABEL_COLORS.find((option) => option.value === label.color);
                return (
                    <button
                        key={label.id}
                        type="button"
                        onClick={() => onChange(isSelected ? selectedIds.filter((id) => id !== label.id) : [...selectedIds, label.id])}
                        className={cn(
                            "flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                            isSelected ? "border-primary bg-indigo-50 ring-1 ring-primary" : "bg-white hover:bg-zinc-50",
                        )}
                        aria-pressed={isSelected}
                    >
                        <span className={cn("h-3 w-3 shrink-0 rounded-full", color?.dot ?? "bg-blue-500")} />
                        <span className="min-w-0 flex-1 truncate">{label.name}</span>
                        {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                    </button>
                );
            })}
        </div>
    );
}
