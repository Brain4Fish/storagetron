import type { Location } from "./api";

export function formatLocation(location?: Location | null) {
    if (!location) {
        return "";
    }

    const parts = [location.country, location.city, location.room, location.shelf]
        .map((part) => part?.trim())
        .filter(Boolean);

    return parts.length > 0 ? parts.join(" / ") : location.name;
}

export function effectiveItemLocation(item: { location?: Location; inherited_location?: Location }) {
    return item.location ?? item.inherited_location;
}

export function isInheritedItemLocation(item: { location?: Location; inherited_location?: Location }) {
    return !item.location && Boolean(item.inherited_location);
}
