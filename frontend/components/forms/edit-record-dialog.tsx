"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { InventoryLabel, Location } from "@/lib/api";
import { LocationSelect } from "@/components/forms/location-select";
import { LabelPicker } from "@/components/labels/label-picker";

type Props = {
    open: boolean;
    title: string;
    description: string;
    name: string;
    details?: string;
    locationId?: string;
    locations?: Location[];
    labels?: InventoryLabel[];
    selectedLabelIds?: string[];
    isSaving?: boolean;
    error?: string;
    onOpenChange: (open: boolean) => void;
    onSave: (data: { name: string; description: string; location_id?: string | null; label_ids?: string[] }) => void;
};

export function EditRecordDialog({
    open,
    title,
    description,
    name,
    details = "",
    locationId = "",
    locations,
    labels,
    selectedLabelIds = [],
    isSaving,
    error,
    onOpenChange,
    onSave,
}: Props) {
    const [draftName, setDraftName] = useState(name);
    const [draftDescription, setDraftDescription] = useState(details);
    const [draftLocationId, setDraftLocationId] = useState(locationId);
    const [localError, setLocalError] = useState("");
    const [draftLabelIds, setDraftLabelIds] = useState(selectedLabelIds);

    useEffect(() => {
        if (open) {
            setDraftName(name);
            setDraftDescription(details);
            setDraftLocationId(locationId);
            setLocalError("");
            setDraftLabelIds(selectedLabelIds);
        }
    }, [details, locationId, name, open, selectedLabelIds]);

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError("");

        if (!draftName.trim()) {
            setLocalError("Name is required");
            return;
        }

        onSave({
            name: draftName.trim(),
            description: draftDescription.trim(),
            ...(locations ? { location_id: draftLocationId || null } : {}),
            ...(labels ? { label_ids: draftLabelIds } : {}),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-name">Name</Label>
                        <Input
                            id="edit-name"
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-description">Description</Label>
                        <Textarea
                            id="edit-description"
                            value={draftDescription}
                            onChange={(event) => setDraftDescription(event.target.value)}
                        />
                    </div>

                    {locations ? (
                        <LocationSelect
                            id="edit-location"
                            locations={locations}
                            value={draftLocationId}
                            onChange={setDraftLocationId}
                        />
                    ) : null}

                    {labels ? (
                        <div className="space-y-2">
                            <Label>Labels</Label>
                            <LabelPicker labels={labels} selectedIds={draftLabelIds} onChange={setDraftLabelIds} />
                        </div>
                    ) : null}

                    {localError || error ? (
                        <p className="text-sm text-destructive">{localError || error}</p>
                    ) : null}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
