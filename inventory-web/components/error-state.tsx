"use client";

import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ErrorState({ message }: { message: string }) {
    return (
        <Card className="rounded-2xl border-destructive/20 bg-destructive/5 shadow-soft">
            <CardContent className="flex min-w-0 items-start gap-3 p-4 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="min-w-0 break-words">{message}</p>
            </CardContent>
        </Card>
    );
}
