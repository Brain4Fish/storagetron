"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Box, Camera, Check, ChevronLeft, ChevronRight, Package, Printer, Sparkles, X } from "lucide-react";
import { api, InventoryLabel } from "@/lib/api";
import {
    ASSISTED_STEPS,
    completeAssistedStep,
    goToAssistedStep,
    initialAssistedEntryState,
    initialSaveItemProgress,
    photoFileKey,
    saveItemEntry,
    validatePhotoFile,
} from "@/lib/item-entry";
import { formatLocation } from "@/lib/location";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableLabelPicker } from "@/components/labels/searchable-label-picker";
import { PrintLabelDialog } from "@/components/print-label-dialog";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function CreateItemDialog({ open, onOpenChange }: Props) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [assisted, setAssisted] = useState(false);
    const [guide, setGuide] = useState(initialAssistedEntryState);
    const [progress, setProgress] = useState(initialSaveItemProgress);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [locationId, setLocationId] = useState("");
    const [containerId, setContainerId] = useState("");
    const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [photoProgress, setPhotoProgress] = useState<Record<string, number>>({});
    const [error, setError] = useState("");
    const [exitConfirm, setExitConfirm] = useState(false);
    const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: api.listLocations, enabled: open });
    const { data: containers = [] } = useQuery({ queryKey: ["containers"], queryFn: api.listContainers, enabled: open });
    const { data: labels = [] } = useQuery({ queryKey: ["labels"], queryFn: api.listLabels, enabled: open });

    const createLabelMutation = useMutation({
        mutationFn: api.createLabel,
        onSuccess: (label) => queryClient.setQueryData<InventoryLabel[]>(["labels"], (current = []) => [...current, label]),
    });

    const reset = (keepAssisted = assisted) => {
        setName(""); setDescription(""); setLocationId(""); setContainerId(""); setSelectedLabelIds([]); setFiles([]);
        setPhotoProgress({}); setProgress(initialSaveItemProgress()); setGuide(initialAssistedEntryState()); setError(""); setExitConfirm(false); setAssisted(keepAssisted);
    };
    const closeNow = () => { reset(false); onOpenChange(false); };
    const requestClose = () => progress.itemId ? setExitConfirm(true) : closeNow();
    const handleOpenChange = (next: boolean) => { if (next) onOpenChange(true); else requestClose(); };
    const invalidateInventory = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.invalidateQueries({ queryKey: ["containers"] }),
        progress.itemId ? queryClient.invalidateQueries({ queryKey: ["item", progress.itemId] }) : Promise.resolve(),
    ]);
    const input = { name, description, locationId, labelIds: selectedLabelIds, containerId, files };

    const save = async (options: { includePhotos?: boolean; includeContainer?: boolean } = {}) => {
        setError("");
        if (!name.trim()) { setError("Name is required."); return false; }
        const result = await saveItemEntry(api, input, progress, {
            ...options,
            onPhotoProgress: (key, value) => setPhotoProgress((current) => ({ ...current, [key]: value })),
        });
        setProgress(result.progress);
        if (result.errors.length) {
            setError(`${result.progress.itemId ? "The item card is saved. " : ""}${Array.from(new Set(result.errors)).join(" ")}`);
            await invalidateInventory();
            return false;
        }
        await invalidateInventory();
        return true;
    };

    const standardMutation = useMutation({ mutationFn: () => save(), onSuccess: (success) => { if (success) closeNow(); } });
    const stepMutation = useMutation({
        mutationFn: async (kind: "details" | "photos" | "container") => save({ includePhotos: kind === "photos", includeContainer: kind === "container" }),
        onSuccess: (success) => { if (success) setGuide((current) => completeAssistedStep(current)); },
    });
    const busy = standardMutation.isPending || stepMutation.isPending;

    const submitStandard = (event: FormEvent) => { event.preventDefault(); standardMutation.mutate(); };
    const completeCurrent = () => setGuide((current) => completeAssistedStep(current));
    const addAnother = () => reset(true);
    const viewItem = () => { const id = progress.itemId; reset(false); onOpenChange(false); router.push(`/items/${id}`); };

    return <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[calc(100vh-1rem)] max-w-6xl flex-col overflow-hidden p-0 [&>button]:right-6 [&>button]:top-6">
            <div className="flex flex-col items-stretch gap-3 border-b px-6 py-4 pr-16 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6">
                <DialogHeader className="flex-row items-center gap-4 space-y-0 text-left">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-zinc-50 text-muted-foreground"><Box className="h-6 w-6" /></span>
                    <div><DialogTitle className="whitespace-nowrap text-2xl">New Item</DialogTitle><DialogDescription className="mt-1">Add a new item to your inventory.</DialogDescription></div>
                </DialogHeader>
                <label className={cn("mr-1 flex items-center gap-3 self-end text-sm text-muted-foreground sm:mr-6 sm:mt-1 sm:self-auto", progress.itemId && "opacity-60")}>
                    <Sparkles className="h-4 w-4" /><span className="hidden sm:inline">Assisted entry</span>
                    <button type="button" role="switch" aria-label="Assisted entry" aria-checked={assisted} disabled={Boolean(progress.itemId)} onClick={() => setAssisted((value) => !value)} className={cn("relative h-7 w-12 rounded-full bg-zinc-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", assisted && "bg-primary")}>
                        <span className={cn("absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition", assisted && "translate-x-5")} />
                    </button>
                </label>
            </div>

            {assisted ? <div className="grid min-h-0 flex-1 md:grid-cols-[15rem_minmax(0,1fr)]">
                <nav aria-label="Assisted entry progress" className="overflow-x-auto border-b bg-zinc-50/70 p-4 md:overflow-y-auto md:border-b-0 md:border-r md:p-5">
                    <ol className="flex min-w-max gap-2 md:min-w-0 md:flex-col">{ASSISTED_STEPS.map((step, index) => {
                        const completed = guide.completed.includes(index); const active = guide.stepIndex === index;
                        const reachable = index === 0 || completed || index <= Math.max(...guide.completed, -1) + 1;
                        return <li key={step}><button type="button" disabled={!reachable || busy} onClick={() => setGuide((current) => goToAssistedStep(current, index))} aria-current={active ? "step" : undefined} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition", active && "bg-white font-medium text-primary shadow-sm", !active && reachable && "hover:bg-white", !reachable && "opacity-45")}>
                            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white text-xs", completed && "border-emerald-500 bg-emerald-500 text-white", active && !completed && "border-primary text-primary")}>{completed ? <Check className="h-4 w-4" /> : index + 1}</span><span>{step}</span>
                        </button></li>;
                    })}</ol>
                </nav>
                <div className="min-h-0 overflow-y-auto p-6 sm:p-8"><AssistedStepContent
                    step={guide.stepIndex} name={name} setName={setName} description={description} setDescription={setDescription}
                    locationId={locationId} setLocationId={setLocationId} containerId={containerId} setContainerId={setContainerId}
                    locations={locations} containers={containers} labels={labels} selectedLabelIds={selectedLabelIds} setSelectedLabelIds={setSelectedLabelIds}
                    createLabel={(data) => createLabelMutation.mutateAsync(data)} isCreatingLabel={createLabelMutation.isPending}
                    files={files} setFiles={setFiles} photoProgress={photoProgress} itemId={progress.itemId} busy={busy} error={error}
                    onDetails={() => stepMutation.mutate("details")} onPhotos={() => stepMutation.mutate("photos")} onContainer={() => stepMutation.mutate("container")}
                    onComplete={completeCurrent} onBack={() => setGuide((current) => goToAssistedStep(current, current.stepIndex - 1))}
                    onAddAnother={addAnother} onViewItem={viewItem} onClose={requestClose}
                /></div>
            </div> : <form onSubmit={submitStandard} className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-4 p-5 sm:p-6"><ItemDetailsFields compact name={name} setName={setName} description={description} setDescription={setDescription} locationId={locationId} setLocationId={setLocationId} containerId={containerId} setContainerId={setContainerId} locations={locations} containers={containers} labels={labels} selectedLabelIds={selectedLabelIds} setSelectedLabelIds={setSelectedLabelIds} createLabel={(data) => createLabelMutation.mutateAsync(data)} isCreatingLabel={createLabelMutation.isPending} photoSlot={<PhotoPicker compact files={files} onChange={setFiles} progress={photoProgress} />} />
                    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-destructive">{error}</p> : null}
                </div>
                <DialogFooter className="sticky bottom-0 mt-0 border-t bg-white px-6 py-3"><Button variant="outline" onClick={requestClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : progress.itemId ? "Retry setup" : "Create item"}</Button></DialogFooter>
            </form>}

            {exitConfirm ? <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 p-6 backdrop-blur-sm"><div role="alertdialog" aria-modal="true" aria-labelledby="exit-entry-title" className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-soft">
                <h2 id="exit-entry-title" className="text-lg font-semibold">Exit assisted entry?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The item card and completed work are already saved. You can continue from the item page later.</p>
                <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setExitConfirm(false)}>Keep working</Button><Button onClick={closeNow}>Exit and keep item</Button></div>
            </div></div> : null}
        </DialogContent>
    </Dialog>;
}

type SharedFields = {
    name: string; setName: (value: string) => void; description: string; setDescription: (value: string) => void;
    locationId: string; setLocationId: (value: string) => void; containerId: string; setContainerId: (value: string) => void;
    locations: Awaited<ReturnType<typeof api.listLocations>>; containers: Awaited<ReturnType<typeof api.listContainers>>; labels: InventoryLabel[];
    selectedLabelIds: string[]; setSelectedLabelIds: (value: string[]) => void; createLabel: (data: Parameters<typeof api.createLabel>[0]) => Promise<InventoryLabel>; isCreatingLabel: boolean;
};

function ItemDetailsFields(props: SharedFields & { photoSlot?: ReactNode; compact?: boolean }) {
    return <div className={props.compact ? "space-y-4" : "space-y-6"}><div className={props.compact ? "space-y-1.5" : "space-y-2"}><Label htmlFor="new-item-name">Name <span className="text-destructive">*</span></Label><Input id="new-item-name" autoFocus value={props.name} onChange={(event) => props.setName(event.target.value)} placeholder="e.g. MacBook Pro" className={cn("rounded-xl", props.compact ? "h-10" : "h-12")} /></div>
        {props.photoSlot}
        <div className={props.compact ? "space-y-1.5" : "space-y-2"}><div className="flex justify-between"><Label htmlFor="new-item-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><span className="text-xs text-muted-foreground">{props.description.length}/500</span></div><Textarea id="new-item-description" value={props.description} onChange={(event) => props.setDescription(event.target.value)} maxLength={500} placeholder="Add details about this item..." className={cn("rounded-xl", props.compact ? "min-h-20" : "min-h-28")} /></div>
        <div className={cn("grid sm:grid-cols-2", props.compact ? "gap-4" : "gap-5")}><SelectField compact={props.compact} id="new-item-location" label="Location" value={props.locationId} onChange={props.setLocationId}><option value="">No location</option>{props.locations.map((location) => <option key={location.id} value={location.id}>{formatLocation(location)}</option>)}</SelectField><SelectField compact={props.compact} id="new-item-container" label="Container" value={props.containerId} onChange={props.setContainerId}><option value="">No container</option>{props.containers.map((container) => <option key={container.id} value={container.id}>{container.name}</option>)}</SelectField></div>
        <div className={props.compact ? "space-y-1.5" : "space-y-2"}><Label>Labels <span className="font-normal text-muted-foreground">(optional)</span></Label><SearchableLabelPicker compact={props.compact} labels={props.labels} selectedIds={props.selectedLabelIds} onChange={props.setSelectedLabelIds} onCreate={props.createLabel} isCreating={props.isCreatingLabel} /></div>
    </div>;
}

function SelectField({ id, label, value, onChange, children, compact = false }: { id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode; compact?: boolean }) {
    return <div className={compact ? "space-y-1.5" : "space-y-2"}><Label htmlFor={id}>{label} <span className="font-normal text-muted-foreground">(optional)</span></Label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={cn("w-full rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring", compact ? "h-10" : "h-12")}>{children}</select></div>;
}

function PhotoPicker({ files, onChange, progress, compact = false }: { files: File[]; onChange: (files: File[]) => void; progress: Record<string, number>; compact?: boolean }) {
    const inputRef = useRef<HTMLInputElement>(null); const [error, setError] = useState(""); const [previews, setPreviews] = useState<string[]>([]);
    useEffect(() => { const urls = files.map((file) => URL.createObjectURL(file)); setPreviews(urls); return () => urls.forEach((url) => URL.revokeObjectURL(url)); }, [files]);
    const select = (event: ChangeEvent<HTMLInputElement>) => { const next = Array.from(event.target.files ?? []); const invalid = next.map(validatePhotoFile).find(Boolean); if (invalid) setError(invalid); else { setError(""); onChange([...files, ...next]); } event.target.value = ""; };
    return <div className={compact ? "space-y-2" : "space-y-3"}><div className={cn(compact && "flex flex-wrap items-center gap-x-3 gap-y-1")}><Label>Photos <span className="font-normal text-muted-foreground">(optional)</span></Label><p className={cn("text-sm text-muted-foreground", !compact && "mt-1")}>JPG, PNG, HEIC or HEIF, max 10 MB each.</p></div><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" className="hidden" onChange={select} />
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => inputRef.current?.click()} className={cn("flex items-center justify-center rounded-xl border border-dashed bg-zinc-50 text-sm hover:border-primary hover:text-primary", compact ? "h-10 gap-2 px-4" : "h-28 w-36 flex-col gap-2")}><Camera className={compact ? "h-4 w-4" : "h-6 w-6"} />Add photos</button>{files.map((file, index) => <div key={`${photoFileKey(file)}:${index}`} className={cn("group relative overflow-hidden rounded-xl border bg-zinc-100", compact ? "h-10 w-10" : "h-28 w-28")}>{previews[index] ? <Image src={previews[index]} alt={file.name} fill sizes={compact ? "40px" : "112px"} unoptimized className="object-cover" /> : null}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, candidate) => candidate !== index))} className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5 opacity-80 shadow"><X className="h-3.5 w-3.5" /></button>{progress[photoFileKey(file)] !== undefined ? <div className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-[10px] text-white">{progress[photoFileKey(file)]}%</div> : null}</div>)}</div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>;
}

function AssistedStepContent(props: SharedFields & { step: number; files: File[]; setFiles: (files: File[]) => void; photoProgress: Record<string, number>; itemId: string; busy: boolean; error: string; onDetails: () => void; onPhotos: () => void; onContainer: () => void; onComplete: () => void; onBack: () => void; onAddAnother: () => void; onViewItem: () => void; onClose: () => void }) {
    const headings = ["Create the item card", "Take item photos", "Print the item label", "Attach the label", "Place the item in packaging", "Photograph the packaging", "Choose a container", "Item ready"];
    const descriptions = ["Start with a name and any details that will make this item easy to find.", "Add one or more clear views. You can skip this and add photos later.", "Print the QR label so the item can be found with a scan.", "Stick the printed label somewhere visible on the item.", "Protect the item in its final packaging before it goes into storage.", "Add a view of the packed item. It will appear in the same photo gallery.", "Put the item in an existing container, or keep it loose.", "Everything you completed has been saved."];
    return <div className="mx-auto max-w-3xl"><div className="mb-6"><p className="text-sm font-medium text-primary">Step {props.step + 1} of {ASSISTED_STEPS.length}</p><h2 className="mt-2 text-2xl font-semibold">{headings[props.step]}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{descriptions[props.step]}</p></div>
        {props.step === 0 ? <ItemDetailsFields {...props} /> : null}
        {props.step === 1 || props.step === 5 ? <PhotoPicker files={props.files} onChange={props.setFiles} progress={props.photoProgress} /> : null}
        {props.step === 2 ? <div className="rounded-2xl border bg-zinc-50 p-6 text-center"><Printer className="mx-auto h-10 w-10 text-primary" /><p className="mt-3 font-medium">{props.name}</p><div className="mx-auto mt-5 max-w-xs"><PrintLabelDialog name={props.name} qrValue={`${typeof window === "undefined" ? "" : window.location.origin}/scan/${props.itemId}`} detail={props.description || "No description"} detailLabel="Description" onPrint={props.onComplete} /></div></div> : null}
        {props.step === 3 || props.step === 4 ? <div className="rounded-2xl border bg-zinc-50 p-8 text-center"><Package className="mx-auto h-12 w-12 text-primary" /><p className="mt-4 font-medium">{props.step === 3 ? "Label attached" : "Item packed"}</p><p className="mt-1 text-sm text-muted-foreground">Confirm when the physical step is complete.</p></div> : null}
        {props.step === 6 ? <SelectField id="assisted-container" label="Container" value={props.containerId} onChange={props.setContainerId}><option value="">Keep item loose</option>{props.containers.map((container) => <option key={container.id} value={container.id}>{container.name}</option>)}</SelectField> : null}
        {props.step === 7 ? <div className="rounded-2xl border bg-emerald-50 p-8 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-7 w-7" /></span><h3 className="mt-4 text-xl font-semibold">{props.name} is ready</h3><p className="mt-2 text-sm text-muted-foreground">Add another item while the workflow is fresh, or open this item to review it.</p><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Button size="lg" onClick={props.onAddAnother}>Add another item</Button><Button size="lg" variant="outline" onClick={props.onViewItem}>View item</Button><Button size="lg" variant="ghost" onClick={props.onClose}>Close</Button></div></div> : null}
        {props.error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-destructive">{props.error}</p> : null}
        {props.step < 7 ? <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={props.onBack} disabled={props.step === 0 || props.busy}><ChevronLeft className="h-4 w-4" />Back</Button><div className="flex gap-2">{props.step > 0 ? <Button variant="outline" onClick={props.onComplete} disabled={props.busy}>Skip</Button> : null}<Button size="lg" disabled={props.busy} onClick={props.step === 0 ? props.onDetails : props.step === 1 || props.step === 5 ? props.onPhotos : props.step === 6 ? props.onContainer : props.onComplete}>{props.busy ? "Saving..." : props.step === 3 ? "Label attached" : props.step === 4 ? "Item packed" : props.step === 6 ? "Finish" : "Continue"}<ChevronRight className="h-4 w-4" /></Button></div></div> : null}
    </div>;
}
