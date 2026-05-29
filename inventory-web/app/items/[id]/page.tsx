"use client";

import { useState } from "react";
import { Download, Package } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { downloadSelectedAssetsXlsx } from "@/lib/export-assets";
import { PageShell } from "@/components/page-shell";
import { formatDate } from "@/lib/utils";
import { effectiveItemLocation, formatLocation, isInheritedItemLocation } from "@/lib/location";
import { UploadPhotoForm } from "@/components/forms/upload-photo-form";
import { ItemPhotos } from "@/components/item-photos";
import { QRCode } from "@/components/qr/qr-code";
import { PrintLabelDialog } from "@/components/print-label-dialog";
import { EditRecordDialog } from "@/components/forms/edit-record-dialog";
import { Button } from "@/components/ui/button";

export default function ItemDetailsPage() {
    const params = useParams();
    const queryClient = useQueryClient();
    const id = params.id as string;
    const [editOpen, setEditOpen] = useState(false);
    const [editError, setEditError] = useState("");
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const [deletingPhotoId, setDeletingPhotoId] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["item", id],
        queryFn: () => api.getItem(id),
    });
    const { data: locations = [] } = useQuery({
        queryKey: ["locations"],
        queryFn: api.listLocations,
    });

    const updateMutation = useMutation({
        mutationFn: (payload: { name: string; description: string; location_id?: string | null }) => api.updateItem(id, payload),
        onSuccess: async () => {
            setEditError("");
            setEditOpen(false);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["item", id] }),
                queryClient.invalidateQueries({ queryKey: ["items"] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
        },
        onError: (err) => {
            setEditError(err instanceof ApiError ? err.message : "Failed to update item");
        },
    });

    const deletePhotoMutation = useMutation({
        mutationFn: (photoId: string) => api.deleteItemPhoto(id, photoId),
        onMutate: (photoId) => setDeletingPhotoId(photoId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["item", id] });
        },
        onSettled: () => setDeletingPhotoId(""),
    });

    if (isLoading) return <PageShell>Loading...</PageShell>;
    if (!data) return <PageShell>Not found</PageShell>;

    const firstPhoto = data.photos?.[0]?.url;
    const itemUrl = `${window.location.origin}/scan/${data.id}`;
    const downloadXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedAssetsXlsx([data.id], `${data.name}-asset.xlsx`);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export asset.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <PageShell>
            <div className="grid min-h-full gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-200">
                            {firstPhoto ? (
                                <img src={firstPhoto} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-400">
                                    <Package className="h-7 w-7" />
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="text-sm text-gray-400">
                                Assets <span className="mx-1">›</span> {data.name}
                            </div>
                            <h1 className="mt-1 text-2xl font-semibold">{data.name}</h1>
                            <span className="mt-2 inline-block rounded-full bg-green-100 px-2 py-1 text-xs text-green-600">
                                Available
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-6 border-b text-sm">
                        <span className="border-b-2 border-orange-500 pb-2 text-orange-600">
                            Overview
                        </span>
                        <span className="pb-2 text-gray-400">Activity</span>
                        <span className="pb-2 text-gray-400">Bookings</span>
                    </div>

                    <div className="rounded-xl border bg-white">
                        <div className="border-b p-4 font-medium">Overview</div>

                        <div className="grid grid-cols-2 gap-y-4 p-4 text-sm">
                            <div className="text-gray-500">ID</div>
                            <div className="font-mono text-xs">{data.id}</div>

                            <div className="text-gray-500">Created</div>
                            <div>{formatDate(data.created_at)}</div>

                            <div className="text-gray-500">Location</div>
                            <div>
                                {formatLocation(effectiveItemLocation(data)) || "No location"}
                                {isInheritedItemLocation(data) ? (
                                    <span className="ml-2 text-xs text-muted-foreground">Inherited from kit</span>
                                ) : null}
                            </div>

                            <div className="text-gray-500">Description</div>
                            <div>{data.description || "-"}</div>
                        </div>
                    </div>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-6 lg:min-h-[calc(100dvh-3rem)] lg:self-start">
                    <div className="space-y-3 rounded-xl border bg-white p-4">
                        <QRCode value={itemUrl} />
                        <Button variant="outline" className="w-full" onClick={() => setEditOpen(true)}>
                            Edit asset
                        </Button>
                        <PrintLabelDialog
                            name={data.name}
                            qrValue={itemUrl}
                            detail={data.description || "No description"}
                            detailLabel="Description"
                            onDownloadXlsx={downloadXlsx}
                            isDownloadingXlsx={isExporting}
                        />
                        <Button variant="outline" className="w-full" onClick={downloadXlsx} disabled={isExporting}>
                            <Download className="h-4 w-4" />
                            {isExporting ? "Preparing..." : "Download XLSX"}
                        </Button>
                        {exportError ? <p className="text-sm text-destructive">{exportError}</p> : null}
                        <button
                            onClick={() => window.print()}
                            className="w-full rounded-lg border py-2 text-sm hover:bg-gray-50"
                        >
                            Print
                        </button>
                    </div>

                    <div className="space-y-4 rounded-xl border bg-white p-4">
                        <div className="space-y-1">
                            <h2 className="font-medium">Photos</h2>
                            <p className="text-sm text-muted-foreground">Images that identify this asset.</p>
                        </div>
                        <UploadPhotoForm itemId={id} queryKey={["item", id]} />
                        <ItemPhotos
                            photos={data.photos}
                            onDelete={(photoId) => {
                                if (window.confirm("Remove this photo from the asset?")) {
                                    deletePhotoMutation.mutate(photoId);
                                }
                            }}
                            deletingPhotoId={deletingPhotoId}
                            variant="compact"
                        />
                    </div>
                </aside>
            </div>

            <EditRecordDialog
                open={editOpen}
                title="Edit asset"
                description="Rename this asset or update its description."
                name={data.name}
                details={data.description}
                locationId={data.location_id ?? ""}
                locations={locations}
                isSaving={updateMutation.isPending}
                error={editError}
                onOpenChange={setEditOpen}
                onSave={(payload) => updateMutation.mutate(payload)}
            />
        </PageShell>
    );
}
