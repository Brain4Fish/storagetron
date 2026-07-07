import { InventoryLabel, LabelColor } from "./api";

export const LABEL_COLORS: Array<{ value: LabelColor; label: string; dot: string }> = [
    { value: "gray", label: "Gray", dot: "bg-zinc-500" },
    { value: "red", label: "Red", dot: "bg-red-500" },
    { value: "orange", label: "Orange", dot: "bg-orange-500" },
    { value: "yellow", label: "Yellow", dot: "bg-yellow-500" },
    { value: "green", label: "Green", dot: "bg-emerald-500" },
    { value: "blue", label: "Blue", dot: "bg-blue-500" },
    { value: "purple", label: "Purple", dot: "bg-purple-500" },
    { value: "pink", label: "Pink", dot: "bg-pink-500" },
];

export const labelChipClasses: Record<LabelColor, { direct: string; inherited: string }> = {
    gray: { direct: "border-zinc-200 bg-zinc-100 text-zinc-700", inherited: "border-zinc-300 bg-white text-zinc-600" },
    red: { direct: "border-red-200 bg-red-50 text-red-700", inherited: "border-red-300 bg-white text-red-700" },
    orange: { direct: "border-orange-200 bg-orange-50 text-orange-700", inherited: "border-orange-300 bg-white text-orange-700" },
    yellow: { direct: "border-yellow-200 bg-yellow-50 text-yellow-800", inherited: "border-yellow-300 bg-white text-yellow-800" },
    green: { direct: "border-emerald-200 bg-emerald-50 text-emerald-700", inherited: "border-emerald-300 bg-white text-emerald-700" },
    blue: { direct: "border-blue-200 bg-blue-50 text-blue-700", inherited: "border-blue-300 bg-white text-blue-700" },
    purple: { direct: "border-purple-200 bg-purple-50 text-purple-700", inherited: "border-purple-300 bg-white text-purple-700" },
    pink: { direct: "border-pink-200 bg-pink-50 text-pink-700", inherited: "border-pink-300 bg-white text-pink-700" },
};

export function labelSelectionDiff(current: InventoryLabel[], selectedIds: string[]) {
    const currentIds = new Set(current.map((label) => label.id));
    const selected = new Set(selectedIds);
    return {
        attach: selectedIds.filter((id) => !currentIds.has(id)),
        detach: current.filter((label) => !selected.has(label.id)).map((label) => label.id),
    };
}

export function matchesSelectedLabels(labels: InventoryLabel[] | undefined, selectedIds: string[]) {
    if (selectedIds.length === 0) return true;

    const labelIds = new Set((labels ?? []).map((label) => label.id));
    return selectedIds.every((id) => labelIds.has(id));
}
