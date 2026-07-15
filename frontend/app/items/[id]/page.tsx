"use client";

import type React from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
    ArrowLeft,
    Box,
    Download,
    Edit3,
    MapPin,
    Package,
    Printer,
    Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, photoContentUrl } from "@/lib/api";
import { buildItemRows } from "@/lib/inventory-view";
import { downloadSelectedAssetsXlsx } from "@/lib/export-assets";
import { PageShell } from "@/components/page-shell";
import { formatDate } from "@/lib/utils";
import { UploadPhotoForm } from "@/components/forms/upload-photo-form";
import { ItemPhotos } from "@/components/item-photos";
import { QRCode } from "@/components/qr/qr-code";
import { PrintLabelDialog } from "@/components/print-label-dialog";
import { EditRecordDialog } from "@/components/forms/edit-record-dialog";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { LabelList } from "@/components/labels/label-chip";
import { labelSelectionDiff } from "@/lib/labels";

export default function ItemDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const id = params.id as string;
    const [editOpen, setEditOpen] = useState(false);
    const [editError, setEditError] = useState("");
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const [deletingPhotoId, setDeletingPhotoId] = useState("");
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["item", id],
        queryFn: () => api.getItem(id),
    });
    const { data: locations = [] } = useQuery({
        queryKey: ["locations"],
        queryFn: api.listLocations,
    });
    const { data: labels = [] } = useQuery({ queryKey: ["labels"], queryFn: api.listLabels });
    const { data: containers = [] } = useQuery({
        queryKey: ["containers"],
        queryFn: api.listContainers,
    });

    const row = useMemo(() => data ? buildItemRows([data], containers)[0] : null, [containers, data]);
    const selectedLabelIds = useMemo(() => (data?.labels ?? []).map((label) => label.id), [data?.labels]);

    const updateMutation = useMutation({
        mutationFn: async (payload: { name: string; description: string; location_id?: string | null; label_ids?: string[] }) => {
            const { label_ids = [], ...record } = payload;
            await api.updateItem(id, record);
            const diff = labelSelectionDiff(data?.labels ?? [], label_ids);
            const results = await Promise.allSettled([
                ...diff.attach.map((labelId) => api.attachItemLabel(id, labelId)),
                ...diff.detach.map((labelId) => api.detachItemLabel(id, labelId)),
            ]);
            if (results.some((result) => result.status === "rejected")) throw new Error("Item details were saved, but some label changes failed. Try saving again.");
        },
        onSuccess: async () => {
            setEditError("");
            setEditOpen(false);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["item", id] }),
                queryClient.invalidateQueries({ queryKey: ["items"] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
        },
        onError: (err) => setEditError(err instanceof Error ? err.message : "Failed to update item"),
        onSettled: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["item", id] }),
                queryClient.invalidateQueries({ queryKey: ["items"] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
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

    const deleteMutation = useMutation({
        mutationFn: () => api.deleteItem(id),
        onSuccess: async () => {
            setDeleteError("");
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["items"] }),
                queryClient.invalidateQueries({ queryKey: ["containers"] }),
            ]);
            router.push("/items");
        },
        onError: (err) => {
            setDeleteError(err instanceof ApiError ? err.message : "Failed to delete item");
        },
    });

    if (isLoading) return <PageShell><div className="pt-16 text-sm text-muted-foreground md:pt-0">Loading item...</div></PageShell>;
    if (!data || !row) return <PageShell><div className="pt-16 text-sm text-muted-foreground md:pt-0">Not found</div></PageShell>;

    const firstPhoto = data.photos?.[0] ? photoContentUrl(data.photos[0]) : undefined;
    const itemUrl = `${window.location.origin}/scan/${data.id}`;
    const downloadXlsx = async () => {
        setIsExporting(true);
        setExportError("");

        try {
            await downloadSelectedAssetsXlsx([data.id], `${data.name}-item.xlsx`);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to export item.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <PageShell>
            <div className="space-y-5 pt-16 md:pt-0">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Link href="/items" className="inline-flex items-center gap-1 hover:text-zinc-950">
                                <ArrowLeft className="h-4 w-4" />
                                Items
                            </Link>
                            <span>/</span>
                            <span className="truncate text-zinc-950">{data.name}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => window.print()}>
                            <Printer className="h-4 w-4" />
                            Print
                        </Button>
                        <Button onClick={() => setEditOpen(true)}>
                            <Edit3 className="h-4 w-4" />
                            Edit Item
                        </Button>
                    </div>
                </header>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
                    <section className="apple-card rounded-2xl p-4">
                        <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1fr)]">
                            <div className="overflow-hidden rounded-2xl border border-border bg-zinc-100">
                                <div className="relative aspect-[4/3]">
                                    {firstPhoto ? (
                                        <Image src={firstPhoto} alt={`${data.name} photo`} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                            <Package className="h-16 w-16" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col justify-center">
                                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{data.name}</h1>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <span className="status-pill bg-indigo-50 text-primary">Item</span>
                                    <span className={row.status === "stored" ? "status-pill bg-emerald-50 text-emerald-700" : "status-pill bg-amber-50 text-amber-700"}>
                                        {row.status === "stored" ? "In Storage" : "No Container"}
                                    </span>
                                </div>
                                <div className="mt-4">
                                    <p className="mb-2 text-sm font-medium">Labels</p>
                                    <LabelList labels={data.labels} empty="No labels" />
                                </div>
                                <div className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
                                    <InfoLink icon={MapPin} label="Location" value={row.locationLabel} />
                                    <InfoLink icon={Box} label="Container" value={row.containerLabel} href={row.container ? `/containers/${row.container.id}` : undefined} />
                                </div>
                                <div className="mt-5">
                                    <h2 className="text-sm font-semibold">Notes</h2>
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-700">
                                        {data.description || "No notes yet."}
                                    </p>
                                </div>
                                <div className="mt-6 flex flex-wrap gap-2">
                                    <PrintLabelDialog
                                        name={data.name}
                                        qrValue={itemUrl}
                                        detail={data.description || "No description"}
                                        detailLabel="Description"
                                        onDownloadXlsx={downloadXlsx}
                                        isDownloadingXlsx={isExporting}
                                    />
                                    <Button variant="outline" onClick={downloadXlsx} disabled={isExporting}>
                                        <Download className="h-4 w-4" />
                                        {isExporting ? "Preparing..." : "Download XLSX"}
                                    </Button>
                                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                                        <Edit3 className="h-4 w-4" />
                                        Edit
                                    </Button>
                                </div>
                                {exportError ? <p className="mt-3 text-sm text-destructive">{exportError}</p> : null}
                            </div>
                        </div>
                    </section>

                    <aside className="space-y-4">
                        <section className="apple-card rounded-2xl p-5">
                            <h2 className="mb-4 text-lg font-semibold">QR Code</h2>
                            <div className="flex flex-col items-center gap-4">
                                <div className="rounded-2xl border border-border bg-white p-4">
                                    <QRCode value={itemUrl} />
                                </div>
                                <p className="text-lg font-semibold">{data.name}</p>
                                <PrintLabelDialog
                                    name={data.name}
                                    qrValue={itemUrl}
                                    detail={data.description || "No description"}
                                    detailLabel="Description"
                                    onDownloadXlsx={downloadXlsx}
                                    isDownloadingXlsx={isExporting}
                                />
                            </div>
                        </section>

                        <section className="apple-card rounded-2xl p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Photos</h2>
                                <span className="text-sm text-muted-foreground">{data.photos?.length ?? 0}</span>
                            </div>
                            <UploadPhotoForm itemId={id} queryKey={["item", id]} />
                            <div className="mt-4">
                                <ItemPhotos
                                    photos={data.photos}
                                    onDelete={(photoId) => {
                                        if (window.confirm("Remove this photo from the item?")) {
                                            deletePhotoMutation.mutate(photoId);
                                        }
                                    }}
                                    deletingPhotoId={deletingPhotoId}
                                    variant="compact"
                                />
                            </div>
                        </section>

                        <section className="apple-card rounded-2xl p-5">
                            <h2 className="text-lg font-semibold">Identity</h2>
                            <dl className="mt-4 grid gap-3 text-sm">
                                <MetaRow label="Item ID" value={data.id} />
                                <MetaRow label="Created" value={formatDate(data.created_at)} />
                                <MetaRow label="Photos" value={`${data.photos?.length ?? 0}`} />
                            </dl>
                            <Button
                                variant="destructive"
                                className="mt-5 w-full"
                                onClick={() => {
                                    setDeleteError("");
                                    setDeleteOpen(true);
                                }}
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete Item
                            </Button>
                        </section>
                    </aside>
                </div>
            </div>

            <EditRecordDialog
                open={editOpen}
                title="Edit item"
                description="Rename this item or update its description."
                name={data.name}
                details={data.description}
                locationId={data.location_id ?? ""}
                locations={locations}
                labels={labels}
                selectedLabelIds={selectedLabelIds}
                isSaving={updateMutation.isPending}
                error={editError}
                onOpenChange={setEditOpen}
                onSave={(payload) => updateMutation.mutate(payload)}
            />
            <DeleteConfirmationDialog
                open={deleteOpen}
                title="Delete item"
                isDeleting={deleteMutation.isPending}
                error={deleteError}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !deleteMutation.isPending) setDeleteOpen(false);
                }}
                onConfirm={() => deleteMutation.mutate()}
            >
                This permanently deletes <span className="font-semibold text-zinc-950">{data.name}</span>, including photos and label assignments.
            </DeleteConfirmationDialog>
        </PageShell>
    );
}

function InfoLink({
    icon: Icon,
    label,
    value,
    href,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    href?: string;
}) {
    const content = (
        <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{value}</p>
            </div>
        </div>
    );

    if (href) {
        return <Link href={href} className="rounded-xl transition hover:text-primary">{content}</Link>;
    }

    return content;
}

function MetaRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="max-w-[12rem] truncate text-right font-medium">{value}</dd>
        </div>
    );
}
