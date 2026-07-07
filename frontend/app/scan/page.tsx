"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

function getCameraAccessErrorMessage(error: unknown) {
    if (typeof window !== "undefined" && !window.isSecureContext) {
        return "Camera scanning requires HTTPS on phones. Open this app with an https:// URL, or use localhost during local development.";
    }

    if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
        return "This browser does not expose camera access for this page. Use a modern browser over HTTPS.";
    }

    if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
            return "Camera permission was denied. Allow camera access in your browser settings and try again.";
        }

        if (error.name === "NotFoundError") {
            return "No camera was found on this device.";
        }

        if (error.name === "NotReadableError") {
            return "The camera is already in use by another app or browser tab.";
        }
    }

    return "Unable to access camera. Please allow camera permission.";
}

export default function ScanPage() {
    const router = useRouter();
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const lastCodeRef = useRef("");
    const pendingScanRef = useRef(false);
    const [scannerReady, setScannerReady] = useState(false);
    const [cameraError, setCameraError] = useState("");

    const scanMutation = useMutation({
        mutationFn: (code: string) => api.scanCode(code),
        onSuccess: async (data) => {
            pendingScanRef.current = false;
            if (data.type === "item" && data.item?.id) {
                router.push(`/items/${data.item.id}`);
            } else if (data.type === "container" && data.container?.id) {
                router.push(`/containers/${data.container.id}`);
            } else {
                setCameraError("Scanned code is not linked to an item or container.");
            }
        },
        onError: (err) => {
            pendingScanRef.current = false;
            setCameraError(err instanceof ApiError ? err.message : "Failed to resolve scanned code.");
        },
    });
    const resolveScan = scanMutation.mutate;

    useEffect(() => {
        let active = true;

        async function startScanner() {
            try {
                const scanner = new Html5Qrcode("scanner");
                scannerRef.current = scanner;

                await scanner.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        qrbox: { width: 240, height: 240 },
                    },
                    async (decodedText) => {
                        if (!active || decodedText === lastCodeRef.current || pendingScanRef.current) {
                            return;
                        }
                        lastCodeRef.current = decodedText;
                        pendingScanRef.current = true;
                        if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
                            try {
                                scanner.pause(true);
                            } catch {}
                        }
                        resolveScan(decodedText);
                    },
                    () => {},
                );

                setScannerReady(true);
            } catch (error) {
                setCameraError(getCameraAccessErrorMessage(error));
            }
        }

        startScanner();

        return () => {
            active = false;
            const scanner = scannerRef.current;
            if (scanner) {
                const state = scanner.getState();
                if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
                    void scanner
                        .stop()
                        .catch(() => undefined)
                        .finally(() => {
                            try {
                                scanner.clear();
                            } catch {}
                        });
                } else {
                    try {
                        scanner.clear();
                    } catch {}
                }
            }
        };
    }, [resolveScan]);

    const handleResume = async () => {
        const scanner = scannerRef.current;
        if (!scanner) {
            return;
        }
        setCameraError("");
        lastCodeRef.current = "";
        pendingScanRef.current = false;
        try {
            await scanner.resume();
        } catch {
            setCameraError("Unable to resume scanner.");
        }
    };

    return (
        <PageShell>
            <div className="mx-auto w-full max-w-3xl space-y-6">
                <Card className="overflow-hidden rounded-2xl">
                    <CardHeader className="p-4 sm:p-6">
                        <CardTitle>Scan QR code</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Use your device camera to scan an inventory code.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
                        <div
                            id="scanner"
                            className="min-h-64 overflow-hidden rounded-2xl border bg-black/5 [&_video]:w-full"
                        />

                        {!scannerReady && !cameraError ? (
                            <p className="text-sm text-muted-foreground">Starting camera...</p>
                        ) : null}

                        {cameraError ? <ErrorState message={cameraError} /> : null}

                        {scanMutation.isPending ? (
                            <p className="text-sm text-muted-foreground">Resolving scanned code...</p>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" className="w-full sm:w-auto" onClick={handleResume}>
                                Resume scan
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </PageShell>
    );
}
