"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
    containerSelection?: {
        currentId?: string;
        options?: Pick<Container, "id" | "name">[];
        loadError?: boolean;
    };
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
    containerSelection,
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
    const [draftContainerId, setDraftContainerId] = useState<string>();
    const [localError, setLocalError] = useState("");
    const [draftLabelIds, setDraftLabelIds] = useState(selectedLabelIds);
    const [itemDocumentData, setItemDocumentData] = useState<ItemDocumentDraft>(initialItemDocumentDraft);
    const [containerDocumentData, setContainerDocumentData] = useState<ContainerDocumentDraft>(initialContainerDocumentDraft);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [viewport, setViewport] = useState<{ height: number; center: number }>();

    useEffect(() => {
        const visibleViewport = window.visualViewport;
        if (!open || !visibleViewport) return;

        // The software keyboard can shrink and pan the visual viewport without resizing the layout viewport.
        const updateViewport = () => {
            setViewport(visibleViewport.scale === 1 ? {
                height: visibleViewport.height,
                center: visibleViewport.offsetTop + visibleViewport.height / 2,
            } : undefined);
        };
        updateViewport();
        visibleViewport.addEventListener("resize", updateViewport);
        visibleViewport.addEventListener("scroll", updateViewport);
        return () => {
            visibleViewport.removeEventListener("resize", updateViewport);
            visibleViewport.removeEventListener("scroll", updateViewport);
        };
    }, [open]);

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

    useEffect(() => {
        if (!open) setDraftContainerId(undefined);
    }, [open]);

    const currentContainerId = containerSelection?.currentId ?? "";
    const containerOptions = containerSelection?.options;
    const selectedContainerId = draftContainerId !== undefined &&
        (draftContainerId === "" || containerOptions?.some(({ id }) => id === draftContainerId))
        ? draftContainerId
        : currentContainerId;

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
            ...(containerOptions && selectedContainerId !== currentContainerId
                ? { container_id: selectedContainerId || null }
                : {}),
            ...(documentRecord?.kind === "item" ? itemDocumentPayload(itemDocumentData) : {}),
            ...(documentRecord?.kind === "container" ? containerDocumentPayload(containerDocumentData) : {}),
            ...(labels ? { label_ids: draftLabelIds } : {}),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 transition-none"
                style={viewport ? { top: viewport.center, maxHeight: `calc(${viewport.height}px - 2rem)` } : undefined}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    titleRef.current?.focus({ preventScroll: true });
                }}
            >
                <DialogHeader className="shrink-0 px-4 pb-1 pr-10 pt-4 sm:px-6 sm:pr-12 sm:pt-6">
                    <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 [@media(pointer:coarse)]:[&_:is(input,select,textarea)]:text-base">
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

                        {containerSelection ? (
                            <div className="space-y-2">
                                <Label htmlFor="edit-container">Container</Label>
                                <select
                                    id="edit-container"
                                    value={selectedContainerId}
                                    onChange={(event) => setDraftContainerId(event.target.value)}
                                    disabled={!containerOptions || isSaving}
                                    className="h-9 w-full rounded-full border border-input bg-white/80 px-3 text-sm disabled:opacity-60"
                                >
                                    {containerOptions ? (
                                        <>
                                            <option value="">No container</option>
                                            {containerOptions.map((container) => (
                                                <option key={container.id} value={container.id}>{container.name}</option>
                                            ))}
                                        </>
                                    ) : (
                                        <option value="">{containerSelection.loadError ? "Could not load containers" : "Loading containers..."}</option>
                                    )}
                                </select>
                            </div>
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
                    </div>

                    <DialogFooter className="mt-0 shrink-0 flex-col border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                        {localError || error ? (
                            <p role="alert" className="max-h-16 overflow-y-auto break-words text-sm text-destructive">{localError || error}</p>
                        ) : null}
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="outline" className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" className="h-11 flex-1 sm:h-9 sm:flex-none" disabled={isSaving}>
                                {isSaving ? "Saving..." : "Save changes"}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
