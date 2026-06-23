"use client";

import { FormEvent, useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, Location } from "@/lib/api";
import { formatLocation } from "@/lib/location";
import { formatDate } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LocationDraft = {
    country: string;
    city: string;
    room: string;
    shelf: string;
};

const emptyDraft: LocationDraft = {
    country: "",
    city: "",
    room: "",
    shelf: "",
};

export default function LocationsPage() {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<LocationDraft>(emptyDraft);
    const [error, setError] = useState("");
    const { data: locations = [], isLoading } = useQuery({
        queryKey: ["locations"],
        queryFn: api.listLocations,
    });

    const createMutation = useMutation({
        mutationFn: () => api.createLocation(draft),
        onSuccess: async () => {
            setDraft(emptyDraft);
            setError("");
            await queryClient.invalidateQueries({ queryKey: ["locations"] });
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create location"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.deleteLocation(id),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["locations"] }),
                queryClient.invalidateQueries({ queryKey: ["items"] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to delete location"),
    });

    const setField = (field: keyof LocationDraft, value: string) => {
        setDraft((current) => ({ ...current, [field]: value }));
    };

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (!draft.country.trim() && !draft.city.trim() && !draft.room.trim() && !draft.shelf.trim()) {
            setError("Fill at least one location field.");
            return;
        }
        createMutation.mutate();
    };

    return (
        <PageShell>
            <div className="space-y-3">
                <div>
                    <h1 className="text-2xl font-semibold">Locations</h1>
                    <p className="text-sm text-muted-foreground">Country, city, room, and shelf records for items and containers.</p>
                </div>

                <form onSubmit={onSubmit} className="floating-window grid gap-3 rounded-2xl p-3 md:grid-cols-5 md:items-end">
                    <LocationInput id="location-country" label="Country" value={draft.country} onChange={(value) => setField("country", value)} />
                    <LocationInput id="location-city" label="City" value={draft.city} onChange={(value) => setField("city", value)} />
                    <LocationInput id="location-room" label="Room" value={draft.room} onChange={(value) => setField("room", value)} />
                    <LocationInput id="location-shelf" label="Shelf" value={draft.shelf} onChange={(value) => setField("shelf", value)} />
                    <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Adding..." : "Add location"}
                    </Button>
                    {error ? <p className="text-sm text-destructive md:col-span-5">{error}</p> : null}
                </form>

                <div className="floating-window overflow-hidden rounded-2xl">
                    {isLoading ? (
                        <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                    ) : locations.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">No locations yet.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-white/45 text-muted-foreground">
                            <tr>
                                <th className="p-2.5 text-left">Location</th>
                                <th className="p-2.5 text-left">Created</th>
                                <th className="w-12 p-2.5 text-right"></th>
                            </tr>
                            </thead>
                            <tbody>
                            {locations.map((location: Location) => (
                                <tr key={location.id} className="border-t border-white/60 hover:bg-white/45">
                                    <td className="p-2.5 font-medium">{formatLocation(location)}</td>
                                    <td className="p-2.5 text-muted-foreground">{formatDate(location.created_at)}</td>
                                    <td className="p-2.5 text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Delete ${formatLocation(location)}`}
                                            disabled={deleteMutation.isPending}
                                            onClick={() => deleteMutation.mutate(location.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </PageShell>
    );
}

function LocationInput({
    id,
    label,
    value,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}
