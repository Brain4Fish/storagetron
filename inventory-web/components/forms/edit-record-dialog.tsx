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

type Props = {
    open: boolean;
    title: string;
    description: string;
    name: string;
    details?: string;
    isSaving?: boolean;
    error?: string;
    onOpenChange: (open: boolean) => void;
    onSave: (data: { name: string; description: string }) => void;
};

export function EditRecordDialog({
    open,
    title,
    description,
    name,
    details = "",
    isSaving,
    error,
    onOpenChange,
    onSave,
}: Props) {
    const [draftName, setDraftName] = useState(name);
    const [draftDescription, setDraftDescription] = useState(details);
    const [localError, setLocalError] = useState("");

    useEffect(() => {
        if (open) {
            setDraftName(name);
            setDraftDescription(details);
            setLocalError("");
        }
    }, [details, name, open]);

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError("");

        if (!draftName.trim()) {
            setLocalError("Name is required");
            return;
        }

        onSave({ name: draftName.trim(), description: draftDescription.trim() });
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

