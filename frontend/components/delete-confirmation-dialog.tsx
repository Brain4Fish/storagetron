"use client";

import { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type DeleteConfirmationDialogProps = {
    open: boolean;
    title: string;
    children: ReactNode;
    isDeleting?: boolean;
    error?: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
};

export function DeleteConfirmationDialog({
    open,
    title,
    children,
    isDeleting,
    error,
    onOpenChange,
    onConfirm,
}: DeleteConfirmationDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                    <div className="text-muted-foreground">{children}</div>
                    {error ? <p className="text-destructive">{error}</p> : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={isDeleting}
                        onClick={onConfirm}
                    >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
