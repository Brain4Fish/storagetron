import { InventoryLabel } from "@/lib/api";
import { labelChipClasses } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function LabelChip({ label, inherited = false }: { label: InventoryLabel; inherited?: boolean }) {
    return (
        <span
            className={cn(
                "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                inherited && "border-dashed",
                labelChipClasses[label.color][inherited ? "inherited" : "direct"],
            )}
            title={inherited ? `${label.name} (inherited from contained items)` : label.name}
            aria-label={inherited ? `${label.name}, inherited` : label.name}
        >
            <span className="truncate">{label.name}</span>
        </span>
    );
}

export function LabelList({ labels, inherited = false, empty }: { labels?: InventoryLabel[]; inherited?: boolean; empty?: string }) {
    if (!labels?.length) return empty ? <span className="text-xs text-muted-foreground">{empty}</span> : null;
    return <div className="flex flex-wrap gap-1.5">{labels.map((label) => <LabelChip key={label.id} label={label} inherited={inherited} />)}</div>;
}
