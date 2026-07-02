"use client";

import { FormEvent, useEffect, useState } from "react";
import { InventoryLabel, LabelColor } from "@/lib/api";
import { LABEL_COLORS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LabelDialog({ open, label, isSaving, error, onOpenChange, onSave }: {
    open: boolean;
    label?: InventoryLabel | null;
    isSaving?: boolean;
    error?: string;
    onOpenChange: (open: boolean) => void;
    onSave: (data: { name: string; color: LabelColor }) => void;
}) {
    const [name, setName] = useState("");
    const [color, setColor] = useState<LabelColor>("blue");
    const [localError, setLocalError] = useState("");

    useEffect(() => {
        if (open) {
            setName(label?.name ?? "");
            setColor(label?.color ?? "blue");
            setLocalError("");
        }
    }, [label, open]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || Array.from(trimmed).length > 64) {
            setLocalError("Name must be between 1 and 64 characters.");
            return;
        }
        onSave({ name: trimmed, color });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{label ? "Edit label" : "Create label"}</DialogTitle>
                    <DialogDescription>Labels help group related items and containers.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="label-name">Name</Label>
                        <Input id="label-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Electronics" maxLength={64} />
                    </div>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Color</legend>
                        <div className="grid grid-cols-4 gap-2">
                            {LABEL_COLORS.map((option) => (
                                <button key={option.value} type="button" onClick={() => setColor(option.value)} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition", color === option.value ? "border-primary bg-indigo-50 ring-1 ring-primary" : "bg-white hover:bg-zinc-50")} aria-pressed={color === option.value}>
                                    <span className={cn("h-3 w-3 rounded-full", option.dot)} />
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    {localError || error ? <p className="text-sm text-destructive">{localError || error}</p> : null}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : label ? "Save changes" : "Create label"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
