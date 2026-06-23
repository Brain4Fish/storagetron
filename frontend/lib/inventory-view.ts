import { Container, Item } from "@/lib/api";
import { effectiveItemLocation, formatLocation } from "@/lib/location";

export type ItemStatus = "stored" | "loose";

export type ItemRowView = {
    item: Item;
    container?: Container;
    locationLabel: string;
    containerLabel: string;
    status: ItemStatus;
    searchableText: string;
};

export function buildItemRows(items: Item[], containers: Container[]): ItemRowView[] {
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
        const locationLabel = formatLocation(effectiveItemLocation(item)) || "No location";
        const containerLabel = container?.name || "No container";
        const status: ItemStatus = container ? "stored" : "loose";

        return {
            item,
            container,
            locationLabel,
            containerLabel,
            status,
            searchableText: [
                item.name,
                item.description,
                item.id,
                locationLabel,
                containerLabel,
            ].filter(Boolean).join(" ").toLowerCase(),
        };
    });
}

export function containerItemCount(container: Container) {
    return container.items_count ?? container.items?.length ?? 0;
}

export function itemStatusLabel(status: ItemStatus) {
    return status === "stored" ? "In Storage" : "No Container";
}
