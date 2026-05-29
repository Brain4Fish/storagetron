"use client";

import { Location } from "@/lib/api";
import { formatLocation } from "@/lib/location";
import { Label } from "@/components/ui/label";

type LocationSelectProps = {
    id: string;
    label?: string;
    locations: Location[];
    value: string;
    onChange: (value: string) => void;
    includeNone?: boolean;
};

export function LocationSelect({
    id,
    label = "Location",
    locations,
    value,
    onChange,
    includeNone = true,
}: LocationSelectProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-9 w-full rounded-full border border-input bg-white/80 px-3 text-sm"
            >
                {includeNone ? <option value="">No location</option> : null}
                {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                        {formatLocation(location)}
                    </option>
                ))}
            </select>
        </div>
    );
}
