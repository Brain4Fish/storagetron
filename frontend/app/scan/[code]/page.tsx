"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { normalizeScanCode } from "@/lib/scan";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/error-state";

export default function ScanCodePage() {
    const params = useParams();
    const router = useRouter();
    const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
    const code = normalizeScanCode(rawCode || "");

    const scanQuery = useQuery({
        queryKey: ["scan", code],
        queryFn: () => api.scanCode(code),
        enabled: Boolean(code),
        retry: false,
    });

    useEffect(() => {
        const result = scanQuery.data;

        if (result?.type === "item" && result.item?.id) {
            router.replace(`/items/${result.item.id}`);
        } else if (result?.type === "container" && result.container?.id) {
            router.replace(`/containers/${result.container.id}`);
        }
    }, [router, scanQuery.data]);

    return (
        <PageShell>
            <div className="mx-auto max-w-2xl">
                <Card>
                    <CardHeader>
                        <CardTitle>Opening scanned item</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {scanQuery.isLoading ? (
                            <p className="text-sm text-muted-foreground">Resolving scanned code...</p>
                        ) : null}

                        {scanQuery.isError ? (
                            <ErrorState
                                message={
                                    scanQuery.error instanceof ApiError
                                        ? scanQuery.error.message
                                        : "This scan code could not be found."
                                }
                            />
                        ) : null}

                        {scanQuery.data?.type && scanQuery.data.type !== "item" && scanQuery.data.type !== "container" ? (
                            <ErrorState message="This scan code is not linked to a page." />
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </PageShell>
    );
}
