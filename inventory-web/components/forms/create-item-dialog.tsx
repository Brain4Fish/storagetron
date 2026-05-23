"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
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
    onOpenChange: (open: boolean) => void;
};

export function CreateItemDialog({ open, onOpenChange }: Props) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState("");

    const mutation = useMutation({
        mutationFn: () => api.createItem({ name, description }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["items"] });
            setName("");
            setDescription("");
            setError("");
            onOpenChange(false);
        },
        onError: (err) => {
            setError(err instanceof ApiError ? err.message : "Failed to create item");
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