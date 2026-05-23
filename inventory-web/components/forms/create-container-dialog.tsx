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

export function CreateContainerDialog({ open, onOpenChange }: Props) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState("");

    const mutation = useMutation({
        mutationFn: () => api.createContainer({ name, description }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["containers"] });
            setName("");
            setDescription("");
            setError("");
            onOpenChange(false);
        },
        onError: (err) => {
            setError(err instanceof ApiError ? err.message : "Failed to create kit");
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
                    <DialogTitle>Create kit</DialogTitle>
                    <DialogDescription>Add a box, shelf, room, or other container.</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="container-name">Name</Label>
                        <Input
                            id="container-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Shelf A, Photo kit, Storage room"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="container-description">Location or notes</Label>
                        <Textarea
                            id="container-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional location, type, or contents note"
                        />
                    </div>

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Creating..." : "Create kit"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

