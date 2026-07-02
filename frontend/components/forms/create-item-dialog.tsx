"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LocationSelect } from "@/components/forms/location-select";
import { LabelPicker } from "@/components/labels/label-picker";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function CreateItemDialog({ open, onOpenChange }: Props) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [locationId, setLocationId] = useState("");
    const [error, setError] = useState("");
    const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
    const [createdItemId, setCreatedItemId] = useState("");
    const [attachedLabelIds, setAttachedLabelIds] = useState<string[]>([]);
    const { data: locations = [] } = useQuery({
        queryKey: ["locations"],
        queryFn: api.listLocations,
    });
    const { data: labels = [] } = useQuery({ queryKey: ["labels"], queryFn: api.listLabels });

    const mutation = useMutation({
        mutationFn: async () => {
            let itemId = createdItemId;
            if (!itemId) {
                const item = await api.createItem({ name, description, location_id: locationId || null });
                itemId = item.id;
                setCreatedItemId(item.id);
            }
            const attached = new Set(attachedLabelIds);
            const selected = new Set(selectedLabelIds);
            const operations = [
                ...selectedLabelIds.filter((id) => !attached.has(id)).map((id) => ({ id, attach: true, run: api.attachItemLabel(itemId, id) })),
                ...attachedLabelIds.filter((id) => !selected.has(id)).map((id) => ({ id, attach: false, run: api.detachItemLabel(itemId, id) })),
            ];
            const results = await Promise.allSettled(operations.map((operation) => operation.run));
            results.forEach((result, index) => {
                if (result.status !== "fulfilled") return;
                if (operations[index].attach) attached.add(operations[index].id);
                else attached.delete(operations[index].id);
            });
            setAttachedLabelIds(Array.from(attached));
            if (results.some((result) => result.status === "rejected")) throw new Error("Item was created, but some labels could not be attached. Try saving again.");
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["items"] });
            setName("");
            setDescription("");
            setLocationId("");
            setSelectedLabelIds([]);
            setCreatedItemId("");
            setAttachedLabelIds([]);
            setError("");
            onOpenChange(false);
        },
        onError: (err) => {
            setError(err instanceof Error ? err.message : "Failed to create item");
        },
    });

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");

        if (!name.trim()) {
            setError("Name is required");
            return;
        }

        mutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create item</DialogTitle>
                    <DialogDescription>Add a new item to the inventory.</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="item-name">Name</Label>
                        <Input
                            id="item-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="MacBook Pro"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="item-description">Description</Label>
                        <Textarea
                            id="item-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description"
                        />
                    </div>

                    <LocationSelect
                        id="item-location"
                        locations={locations}
                        value={locationId}
                        onChange={setLocationId}
                    />

                    <div className="space-y-2">
                        <Label>Labels</Label>
                        <LabelPicker labels={labels} selectedIds={selectedLabelIds} onChange={setSelectedLabelIds} />
                    </div>

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Creating..." : "Create item"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
