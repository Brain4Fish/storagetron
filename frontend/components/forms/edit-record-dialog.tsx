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
import {
    Container,
    InventoryLabel,
    Item,
    Location,
    UpdateContainerRequest,
    UpdateItemRequest,
} from "@/lib/api";
import { LocationSelect } from "@/components/forms/location-select";
import { LabelPicker } from "@/components/labels/label-picker";
import {
    ContainerDocumentDraft,
    ContainerDocumentFields,
    containerDocumentPayload,
    initialContainerDocumentDraft,
    initialItemDocumentDraft,
    ItemDocumentDraft,
    ItemDocumentFields,
    itemDocumentPayload,
    validateContainerDocumentDraft,
    validateItemDocumentDraft,
} from "@/components/forms/document-fields";

type DocumentRecord =
    | { kind: "item"; value: Item }
    | { kind: "container"; value: Container };

type EditRecordPayload = UpdateItemRequest & UpdateContainerRequest & { label_ids?: string[] };
const EMPTY_LABEL_IDS: string[] = [];

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
    documentRecord?: DocumentRecord;
    isSaving?: boolean;
    error?: string;
    onOpenChange: (open: boolean) => void;
    onSave: (data: EditRecordPayload) => void;
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
    selectedLabelIds = EMPTY_LABEL_IDS,
    documentRecord,
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
    const [itemDocumentData, setItemDocumentData] = useState<ItemDocumentDraft>(initialItemDocumentDraft);
    const [containerDocumentData, setContainerDocumentData] = useState<ContainerDocumentDraft>(initialContainerDocumentDraft);

    useEffect(() => {
        if (open) {
            setDraftName(name);
            setDraftDescription(details);
            setDraftLocationId(locationId);
            setLocalError("");
            setDraftLabelIds(selectedLabelIds);
            if (documentRecord?.kind === "item") {
                setItemDocumentData(initialItemDocumentDraft(documentRecord.value));
            }
            if (documentRecord?.kind === "container") {
                setContainerDocumentData(initialContainerDocumentDraft(documentRecord.value));
            }
        }
    }, [details, documentRecord, locationId, name, open, selectedLabelIds]);

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError("");

        if (!draftName.trim()) {
            setLocalError("Name is required");
            return;
        }
        const documentError = documentRecord?.kind === "item"
            ? validateItemDocumentDraft(itemDocumentData)
            : documentRecord?.kind === "container"
                ? validateContainerDocumentDraft(containerDocumentData)
                : "";
        if (documentError) {
            setLocalError(documentError);
            return;
        }

        onSave({
            name: draftName.trim(),
            description: draftDescription.trim(),
            ...(locations ? { location_id: draftLocationId || null } : {}),
            ...(documentRecord?.kind === "item" ? itemDocumentPayload(itemDocumentData) : {}),
            ...(documentRecord?.kind === "container" ? containerDocumentPayload(containerDocumentData) : {}),
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

                    {documentRecord?.kind === "item" ? (
                        <ItemDocumentFields
                            value={itemDocumentData}
                            onChange={setItemDocumentData}
                            idPrefix="edit-item-document"
                        />
                    ) : null}

                    {documentRecord?.kind === "container" ? (
                        <ContainerDocumentFields
                            value={containerDocumentData}
                            onChange={setContainerDocumentData}
                            idPrefix="edit-container-document"
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
