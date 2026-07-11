import { Container, Item } from "./api";
import { matchesSelectedLabels } from "./labels";
import { effectiveItemLocation, formatLocation } from "./location";

export type ItemAvailabilityFilter = "all" | "available" | "assigned";
export type ItemSortOrder = "newest" | "oldest";

export type ContainerItemPickerRow = {
    item: Item;
    container?: Container;
    isSelectable: boolean;
    containerStatus: string;
    searchableText: string;
};

export type ContainerItemPickerFilters = {
    query: string;
    availability: ItemAvailabilityFilter;
    selectedLabelIds: string[];
    sortOrder: ItemSortOrder;
};

export function buildContainerItemPickerRows(
    items: Item[],
    containers: Container[],
    targetContainerId: string,
): ContainerItemPickerRow[] {
    const containerByItemId = new Map<string, Container>();

    containers.forEach((container) => {
        (container.items ?? []).forEach((item) => {
            if (!containerByItemId.has(item.id)) {
                containerByItemId.set(item.id, container);
            }
        });
    });

    return items.map((item) => {
        const container = containerByItemId.get(item.id);
        const location = formatLocation(effectiveItemLocation(item));
        const containerStatus = container
            ? container.id === targetContainerId
                ? "Already here"
                : `In ${container.name}`
            : "Available";

        return {
            item,
            container,
            isSelectable: !container,
            containerStatus,
            searchableText: [
                item.name,
                location,
                ...(item.labels ?? []).map((label) => label.name),
            ].filter(Boolean).join(" ").toLowerCase(),
        };
    });
}

export function filterAndSortContainerItemRows(
    rows: ContainerItemPickerRow[],
    filters: ContainerItemPickerFilters,
) {
    const normalizedQuery = filters.query.trim().toLowerCase();

    return rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
            if (normalizedQuery && !row.searchableText.includes(normalizedQuery)) return false;
            if (filters.availability === "available" && !row.isSelectable) return false;
            if (filters.availability === "assigned" && row.isSelectable) return false;
            return matchesSelectedLabels(row.item.labels, filters.selectedLabelIds);
        })
        .sort((left, right) => {
            const leftTime = dateValue(left.row.item.created_at);
            const rightTime = dateValue(right.row.item.created_at);
            const dateComparison = filters.sortOrder === "newest"
                ? rightTime - leftTime
                : leftTime - rightTime;

            return dateComparison || left.index - right.index;
        })
        .map(({ row }) => row);
}

function dateValue(value: string) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 0 : timestamp;
}
