"use client";

import type React from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, CheckCircle2, ChevronRight, Clock3, Edit3, HardDrive, Play, Plus, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    api,
    ApiError,
    BackupRun,
    BackupSchedule,
    BackupTarget,
    BackupJobStatus,
    RestoreRun,
} from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type TabKey = "targets" | "schedules" | "history" | "restore";
type AuthMode = "password" | "private_key";

const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "targets", label: "Targets" },
    { key: "schedules", label: "Schedules" },
    { key: "history", label: "History" },
    { key: "restore", label: "Restore" },
];

const cronPresets = [
    { label: "Hourly", value: "0 * * * *" },
    { label: "Daily", value: "0 2 * * *" },
    { label: "Weekly", value: "0 3 * * 0" },
    { label: "Monthly", value: "0 4 1 * *" },
];

type TargetDraft = {
    name: string;
    enabled: boolean;
    host: string;
    port: string;
    username: string;
    remotePath: string;
    authMode: AuthMode;
    password: string;
    privateKey: string;
    passphrase: string;
    hostKey: string;
    insecureSkipHostKeyCheck: boolean;
};

type ScheduleDraft = {
    targetId: string;
    name: string;
    enabled: boolean;
    cronExpression: string;
    keepLastBackups: string;
};

type DeleteRequest = {
    type: "target" | "schedule";
    id: string;
    name: string;
};

const emptyTargetDraft: TargetDraft = {
    name: "",
    enabled: true,
    host: "",
    port: "22",
    username: "",
    remotePath: "/backups",
    authMode: "password",
    password: "",
    privateKey: "",
    passphrase: "",
    hostKey: "",
    insecureSkipHostKeyCheck: false,
};

const emptyScheduleDraft: ScheduleDraft = {
    targetId: "",
    name: "",
    enabled: true,
    cronExpression: cronPresets[1].value,
    keepLastBackups: "30",
};

export default function BackupsPage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<TabKey>("targets");
    const [targetDraft, setTargetDraft] = useState<TargetDraft>(emptyTargetDraft);
    const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(emptyScheduleDraft);
    const [manualBackupTargetId, setManualBackupTargetId] = useState("");
    const [manualRestoreTargetId, setManualRestoreTargetId] = useState("");
    const [manualRestoreIdentifier, setManualRestoreIdentifier] = useState("");
    const [restoreRequest, setRestoreRequest] = useState<{ targetId: string; backupIdentifier: string } | null>(null);
    const [restoreConfirmText, setRestoreConfirmText] = useState("");
    const [editingTarget, setEditingTarget] = useState<{ target: BackupTarget; draft: TargetDraft } | null>(null);
    const [editingSchedule, setEditingSchedule] = useState<{ schedule: BackupSchedule; draft: ScheduleDraft } | null>(null);
    const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [error, setError] = useState("");

    const targetsQuery = useQuery({
        queryKey: ["backup-targets"],
        queryFn: api.listBackupTargets,
    });
    const schedulesQuery = useQuery({
        queryKey: ["backup-schedules"],
        queryFn: api.listBackupSchedules,
    });
    const backupRunsQuery = useQuery({
        queryKey: ["backup-runs"],
        queryFn: api.listBackupRuns,
        refetchInterval: 5000,
    });
    const restoreRunsQuery = useQuery({
        queryKey: ["restore-runs"],
        queryFn: api.listRestoreRuns,
        refetchInterval: 5000,
    });

    const targets = targetsQuery.data ?? [];
    const schedules = schedulesQuery.data ?? [];
    const backupRuns = backupRunsQuery.data ?? [];
    const restoreRuns = restoreRunsQuery.data ?? [];
    const targetByID = useMemo(() => new Map(targets.map((target) => [target.id, target])), [targets]);
    const scheduleByID = useMemo(() => new Map(schedules.map((schedule) => [schedule.id, schedule])), [schedules]);
    const enabledTargets = useMemo(() => targets.filter((target) => target.enabled), [targets]);

    const invalidateBackups = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["backup-targets"] }),
            queryClient.invalidateQueries({ queryKey: ["backup-schedules"] }),
            queryClient.invalidateQueries({ queryKey: ["backup-runs"] }),
            queryClient.invalidateQueries({ queryKey: ["restore-runs"] }),
        ]);
    };

    const createTargetMutation = useMutation({
        mutationFn: () => api.createBackupTarget(buildTargetPayload(targetDraft)),
        onSuccess: async () => {
            setTargetDraft(emptyTargetDraft);
            setError("");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to create backup target")),
    });

    const createScheduleMutation = useMutation({
        mutationFn: () => api.createBackupSchedule({
            target_id: scheduleDraft.targetId,
            name: scheduleDraft.name.trim(),
            cron_expression: scheduleDraft.cronExpression.trim(),
            enabled: scheduleDraft.enabled,
            retention_policy: {
                keep_last_backups: parsePositiveInt(scheduleDraft.keepLastBackups, 30),
            },
        }),
        onSuccess: async () => {
            setScheduleDraft({ ...emptyScheduleDraft, targetId: enabledTargets[0]?.id ?? "" });
            setError("");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to create backup schedule")),
    });

    const updateTargetMutation = useMutation({
        mutationFn: ({ id, draft }: { id: string; draft: TargetDraft }) =>
            api.updateBackupTarget(id, buildTargetUpdatePayload(draft)),
        onSuccess: async () => {
            setEditingTarget(null);
            setError("");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to update backup target")),
    });

    const deleteTargetMutation = useMutation({
        mutationFn: (id: string) => api.deleteBackupTarget(id),
        onSuccess: async () => {
            setDeleteRequest(null);
            setDeleteConfirmText("");
            setError("");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to delete backup target")),
    });

    const updateScheduleMutation = useMutation({
        mutationFn: ({ id, draft }: { id: string; draft: ScheduleDraft }) =>
            api.updateBackupSchedule(id, {
                target_id: draft.targetId,
                name: draft.name.trim(),
                cron_expression: draft.cronExpression.trim(),
                enabled: draft.enabled,
                retention_policy: {
                    keep_last_backups: parsePositiveInt(draft.keepLastBackups, 30),
                },
            }),
        onSuccess: async () => {
            setEditingSchedule(null);
            setError("");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to update backup schedule")),
    });

    const deleteScheduleMutation = useMutation({
        mutationFn: (id: string) => api.deleteBackupSchedule(id),
        onSuccess: async () => {
            setDeleteRequest(null);
            setDeleteConfirmText("");
            setError("");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to delete backup schedule")),
    });

    const createBackupMutation = useMutation({
        mutationFn: (targetId: string) => api.createBackupRun(targetId),
        onSuccess: async () => {
            setError("");
            setActiveTab("history");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to enqueue backup")),
    });

    const createRestoreMutation = useMutation({
        mutationFn: (request: { targetId: string; backupIdentifier: string }) =>
            api.createRestoreRun({ target_id: request.targetId, backup_identifier: request.backupIdentifier }),
        onSuccess: async () => {
            setRestoreRequest(null);
            setRestoreConfirmText("");
            setManualRestoreIdentifier("");
            setError("");
            setActiveTab("restore");
            await invalidateBackups();
        },
        onError: (err) => setError(errorMessage(err, "Failed to enqueue restore")),
    });

    const selectedManualBackupTarget = manualBackupTargetId || enabledTargets[0]?.id || "";
    const selectedManualRestoreTarget = manualRestoreTargetId || targets[0]?.id || "";
    const sortedBackupRuns = useMemo(
        () => [...backupRuns].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [backupRuns],
    );
    const latestSuccessfulBackup = sortedBackupRuns.find((run) => run.status === "completed");
    const latestFailedBackup = sortedBackupRuns.find((run) => run.status === "failed");
    const lastSuccessAgeHours = latestSuccessfulBackup
        ? (Date.now() - new Date(latestSuccessfulBackup.finished_at ?? latestSuccessfulBackup.updated_at ?? latestSuccessfulBackup.created_at).getTime()) / 36e5
        : Number.POSITIVE_INFINITY;
    const backupHealth = enabledTargets.length === 0 || schedules.length === 0
        ? "warning"
        : latestFailedBackup && (!latestSuccessfulBackup || new Date(latestFailedBackup.created_at) > new Date(latestSuccessfulBackup.created_at))
            ? "error"
            : lastSuccessAgeHours <= 26
                ? "protected"
                : "warning";
    const completedRuns = useMemo(
        () => backupRuns
            .filter((run) => run.status === "completed" && run.backup_path)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [backupRuns],
    );
    const totalBackupSize = backupRuns.reduce((total, run) => total + (run.size_bytes ?? 0), 0);

    useEffect(() => {
        const firstEnabledTargetID = enabledTargets[0]?.id;
        const firstTargetID = targets[0]?.id;
        if (firstEnabledTargetID) {
            setScheduleDraft((current) => current.targetId ? current : { ...current, targetId: firstEnabledTargetID });
            setManualBackupTargetId((current) => current || firstEnabledTargetID);
        }
        if (firstTargetID) {
            setManualRestoreTargetId((current) => current || firstTargetID);
        }
    }, [enabledTargets, targets]);

    const submitTarget = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        const validationError = validateTargetDraft(targetDraft);
        if (validationError) {
            setError(validationError);
            return;
        }
        createTargetMutation.mutate();
    };

    const submitSchedule = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (!scheduleDraft.targetId) {
            setError("Select a target for the schedule.");
            return;
        }
        if (!scheduleDraft.name.trim()) {
            setError("Schedule name is required.");
            return;
        }
        if (!scheduleDraft.cronExpression.trim()) {
            setError("Cron expression is required.");
            return;
        }
        createScheduleMutation.mutate();
    };

    const submitManualBackup = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (!selectedManualBackupTarget) {
            setError("Create an enabled backup target before running a manual backup.");
            return;
        }
        createBackupMutation.mutate(selectedManualBackupTarget);
    };

    const submitManualRestore = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (!selectedManualRestoreTarget) {
            setError("Select a target for restore.");
            return;
        }
        if (!manualRestoreIdentifier.trim()) {
            setError("Backup identifier is required.");
            return;
        }
        setRestoreRequest({
            targetId: selectedManualRestoreTarget,
            backupIdentifier: manualRestoreIdentifier.trim(),
        });
        setRestoreConfirmText("");
    };

    const openRestoreFromRun = (run: BackupRun) => {
        if (!run.backup_path || !targetByID.has(run.target_id)) return;
        setRestoreRequest({ targetId: run.target_id, backupIdentifier: run.backup_path });
        setRestoreConfirmText("");
        setActiveTab("restore");
    };

    const openTargetEdit = (target: BackupTarget) => {
        setEditingTarget({ target, draft: draftFromTarget(target) });
        setError("");
    };

    const openScheduleEdit = (schedule: BackupSchedule) => {
        setEditingSchedule({ schedule, draft: draftFromSchedule(schedule) });
        setError("");
    };

    const submitTargetEdit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingTarget) return;
        setError("");
        const validationError = validateTargetDraft(editingTarget.draft, true);
        if (validationError) {
            setError(validationError);
            return;
        }
        updateTargetMutation.mutate({ id: editingTarget.target.id, draft: editingTarget.draft });
    };

    const submitScheduleEdit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingSchedule) return;
        setError("");
        const validationError = validateScheduleDraft(editingSchedule.draft);
        if (validationError) {
            setError(validationError);
            return;
        }
        updateScheduleMutation.mutate({ id: editingSchedule.schedule.id, draft: editingSchedule.draft });
    };

    const openDelete = (request: DeleteRequest) => {
        setDeleteRequest(request);
        setDeleteConfirmText("");
        setError("");
    };

    const confirmDelete = () => {
        if (!deleteRequest || deleteConfirmText !== "DELETE") return;
        if (deleteRequest.type === "target") {
            deleteTargetMutation.mutate(deleteRequest.id);
            return;
        }
        deleteScheduleMutation.mutate(deleteRequest.id);
    };

    return (
        <PageShell>
            <div className="space-y-5 pt-16 md:pt-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-semibold tracking-tight">Backups</h1>
                            <span className={cn(
                                "status-pill",
                                backupHealth === "protected" && "bg-emerald-50 text-emerald-700",
                                backupHealth === "warning" && "bg-amber-50 text-amber-700",
                                backupHealth === "error" && "bg-red-50 text-red-700",
                            )}>
                                {backupHealth === "protected" ? "Protected" : backupHealth === "warning" ? "Needs attention" : "Backup issue"}
                            </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Your backup targets, history, and restore readiness.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setActiveTab("restore")}>
                            <ArchiveRestore className="h-4 w-4" />
                            Restore
                        </Button>
                        <form onSubmit={submitManualBackup}>
                            <Button type="submit" disabled={createBackupMutation.isPending || enabledTargets.length === 0}>
                                <Play className="h-4 w-4" />
                                {createBackupMutation.isPending ? "Enqueuing..." : "Run Backup Now"}
                            </Button>
                        </form>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                ) : null}

                <section className="apple-card rounded-2xl p-5">
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                            <div className={cn(
                                "flex h-28 w-28 shrink-0 items-center justify-center rounded-[2rem]",
                                backupHealth === "protected" && "bg-emerald-50 text-emerald-600",
                                backupHealth === "warning" && "bg-amber-50 text-amber-600",
                                backupHealth === "error" && "bg-red-50 text-red-600",
                            )}>
                                {backupHealth === "error" ? <XCircle className="h-14 w-14" /> : <ShieldCheck className="h-14 w-14" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className={cn(
                                    "text-2xl font-semibold",
                                    backupHealth === "protected" && "text-emerald-700",
                                    backupHealth === "warning" && "text-amber-700",
                                    backupHealth === "error" && "text-red-700",
                                )}>
                                    {backupHealth === "protected" ? "Protected" : backupHealth === "warning" ? "Review backup setup" : "Backup needs attention"}
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {backupHealth === "protected"
                                        ? "Your data has a recent successful backup."
                                        : "Check targets, schedules, and recent runs before relying on restore."}
                                </p>
                                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                                    <BackupMetric
                                        icon={CheckCircle2}
                                        label="Last successful backup"
                                        value={latestSuccessfulBackup ? formatDate(latestSuccessfulBackup.finished_at ?? latestSuccessfulBackup.created_at) : "No successful backup"}
                                    />
                                    <BackupMetric
                                        icon={Clock3}
                                        label="Schedules"
                                        value={`${schedules.filter((schedule) => schedule.enabled).length} enabled`}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-zinc-50 p-4">
                            <h3 className="font-semibold">Backup Health</h3>
                            <div className="mt-4 grid gap-3 text-sm">
                                <HealthLine ok={enabledTargets.length > 0} label={`${enabledTargets.length} enabled target${enabledTargets.length === 1 ? "" : "s"}`} />
                                <HealthLine ok={schedules.some((schedule) => schedule.enabled)} label="Schedule configured" />
                                <HealthLine ok={Boolean(latestSuccessfulBackup)} label="Successful backup available" />
                                <HealthLine ok={restoreRuns.some((run) => run.status === "completed")} label="Restore tested" />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
                    <div className="apple-card rounded-2xl p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Backup Targets</h2>
                            <Button variant="outline" size="sm" onClick={() => setActiveTab("targets")}>
                                <Plus className="h-4 w-4" />
                                Add Target
                            </Button>
                        </div>
                        <div className="grid gap-3">
                            {targets.slice(0, 3).map((target) => (
                                <button
                                    key={target.id}
                                    type="button"
                                    onClick={() => setActiveTab("targets")}
                                    className="flex items-center gap-3 rounded-2xl border border-border p-4 text-left transition hover:bg-zinc-50"
                                >
                                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-primary">
                                        <HardDrive className="h-6 w-6" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-semibold">{target.name}</span>
                                        <span className="block truncate text-sm text-muted-foreground">{target.configuration?.remote_path ?? target.type}</span>
                                    </span>
                                    <span className={target.enabled ? "status-pill bg-emerald-50 text-emerald-700" : "status-pill bg-zinc-100 text-muted-foreground"}>
                                        {target.enabled ? "Enabled" : "Disabled"}
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}
                            {targets.length === 0 ? <p className="text-sm text-muted-foreground">No backup targets configured.</p> : null}
                        </div>
                    </div>

                    <div className="apple-card rounded-2xl p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Recent Backups</h2>
                            <button type="button" onClick={() => setActiveTab("history")} className="text-sm font-medium text-primary">View all</button>
                        </div>
                        <div className="divide-y divide-border">
                            {sortedBackupRuns.slice(0, 5).map((run) => (
                                <button
                                    key={run.id}
                                    type="button"
                                    onClick={() => setActiveTab("history")}
                                    className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 py-3 text-left text-sm transition hover:bg-zinc-50"
                                >
                                    <span>
                                        <span className="block font-medium">{formatDate(run.started_at ?? run.created_at)}</span>
                                        <span className="text-xs text-muted-foreground">{targetByID.get(run.target_id)?.name ?? "Unknown target"}</span>
                                    </span>
                                    <span className="text-muted-foreground">{formatBytes(run.size_bytes)}</span>
                                    <StatusBadge status={run.status} />
                                </button>
                            ))}
                            {sortedBackupRuns.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No backup runs yet.</p> : null}
                        </div>
                    </div>
                </section>

                <section className="apple-card rounded-2xl p-5">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(160px,0.35fr))] lg:items-center">
                        <div>
                            <h2 className="text-lg font-semibold">Ready to Restore</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Restore from any completed backup with a stored backup identifier.</p>
                            <Button variant="outline" className="mt-4" onClick={() => setActiveTab("restore")}>
                                Open Restore Wizard
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <BackupSummary label="Available backups" value={`${completedRuns.length}`} detail="Across all targets" />
                        <BackupSummary label="Oldest backup" value={completedRuns.length > 0 ? formatDate(completedRuns[completedRuns.length - 1].created_at) : "—"} detail="Completed runs" />
                        <BackupSummary label="Total size" value={formatBytes(totalBackupSize)} detail="Across all backups" />
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="apple-card flex w-full gap-1 overflow-x-auto rounded-2xl p-1 sm:w-auto">
                        {tabs.map((tab) => (
                            <Button
                                key={tab.key}
                                variant={activeTab === tab.key ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setActiveTab(tab.key)}
                                className="flex-1 sm:flex-none"
                            >
                                {tab.label}
                            </Button>
                        ))}
                    </div>

                {activeTab === "targets" ? (
                    <TargetsTab
                        targets={targets}
                        isLoading={targetsQuery.isLoading}
                        draft={targetDraft}
                        setDraft={setTargetDraft}
                        onSubmit={submitTarget}
                        onEdit={openTargetEdit}
                        onDelete={(target) => openDelete({ type: "target", id: target.id, name: target.name })}
                        isSubmitting={createTargetMutation.isPending}
                    />
                ) : null}

                {activeTab === "schedules" ? (
                    <SchedulesTab
                        targets={targets}
                        schedules={schedules}
                        isLoading={schedulesQuery.isLoading}
                        draft={scheduleDraft}
                        setDraft={setScheduleDraft}
                        onSubmit={submitSchedule}
                        onEdit={openScheduleEdit}
                        onDelete={(schedule) => openDelete({ type: "schedule", id: schedule.id, name: schedule.name })}
                        isSubmitting={createScheduleMutation.isPending}
                    />
                ) : null}

                {activeTab === "history" ? (
                    <HistoryTab
                        targets={targets}
                        schedules={schedules}
                        targetByID={targetByID}
                        scheduleByID={scheduleByID}
                        runs={backupRuns}
                        isLoading={backupRunsQuery.isLoading}
                        manualTargetId={selectedManualBackupTarget}
                        setManualTargetId={setManualBackupTargetId}
                        onManualBackup={submitManualBackup}
                        onRestore={openRestoreFromRun}
                        isSubmitting={createBackupMutation.isPending}
                    />
                ) : null}

                {activeTab === "restore" ? (
                    <RestoreTab
                        targets={targets}
                        targetByID={targetByID}
                        completedRuns={completedRuns}
                        restoreRuns={restoreRuns}
                        isLoading={restoreRunsQuery.isLoading}
                        manualTargetId={selectedManualRestoreTarget}
                        setManualTargetId={setManualRestoreTargetId}
                        backupIdentifier={manualRestoreIdentifier}
                        setBackupIdentifier={setManualRestoreIdentifier}
                        onManualRestore={submitManualRestore}
                        onRestoreFromRun={openRestoreFromRun}
                    />
                ) : null}
                </section>
            </div>

            <Dialog open={restoreRequest !== null} onOpenChange={(open) => !open && setRestoreRequest(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm restore</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">
                            Restoring a backup replaces application data. Type <span className="font-semibold text-zinc-950">RESTORE</span> to enqueue this restore job.
                        </p>
                        <div className="rounded-xl bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700">
                            {restoreRequest?.backupIdentifier}
                        </div>
                        <Input
                            value={restoreConfirmText}
                            onChange={(event) => setRestoreConfirmText(event.target.value)}
                            placeholder="RESTORE"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRestoreRequest(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            disabled={restoreConfirmText !== "RESTORE" || createRestoreMutation.isPending || !restoreRequest}
                            onClick={() => restoreRequest && createRestoreMutation.mutate(restoreRequest)}
                        >
                            <ArchiveRestore className="h-4 w-4" />
                            {createRestoreMutation.isPending ? "Enqueuing..." : "Restore"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editingTarget !== null} onOpenChange={(open) => !open && setEditingTarget(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit target</DialogTitle>
                    </DialogHeader>
                    {editingTarget ? (
                        <TargetForm
                            draft={editingTarget.draft}
                            setDraft={(draft) => setEditingTarget({ ...editingTarget, draft })}
                            onSubmit={submitTargetEdit}
                            isSubmitting={updateTargetMutation.isPending}
                            submitLabel={updateTargetMutation.isPending ? "Saving..." : "Save target"}
                            secretMode="optional"
                        />
                    ) : null}
                </DialogContent>
            </Dialog>

            <Dialog open={editingSchedule !== null} onOpenChange={(open) => !open && setEditingSchedule(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit schedule</DialogTitle>
                    </DialogHeader>
                    {editingSchedule ? (
                        <ScheduleForm
                            targets={targets.filter((target) => target.enabled)}
                            draft={editingSchedule.draft}
                            setDraft={(draft) => setEditingSchedule({ ...editingSchedule, draft })}
                            onSubmit={submitScheduleEdit}
                            isSubmitting={updateScheduleMutation.isPending}
                            submitLabel={updateScheduleMutation.isPending ? "Saving..." : "Save schedule"}
                        />
                    ) : null}
                </DialogContent>
            </Dialog>

            <Dialog open={deleteRequest !== null} onOpenChange={(open) => !open && setDeleteRequest(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {deleteRequest?.type}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">
                            This removes <span className="font-semibold text-zinc-950">{deleteRequest?.name}</span> from active backup configuration while preserving history.
                            Type <span className="font-semibold text-zinc-950">DELETE</span> to confirm.
                        </p>
                        <Input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} placeholder="DELETE" autoFocus />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteRequest(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            disabled={deleteConfirmText !== "DELETE" || deleteTargetMutation.isPending || deleteScheduleMutation.isPending}
                            onClick={confirmDelete}
                        >
                            <Trash2 className="h-4 w-4" />
                            {deleteTargetMutation.isPending || deleteScheduleMutation.isPending ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageShell>
    );
}

function TargetsTab({
    targets,
    isLoading,
    draft,
    setDraft,
    onSubmit,
    onEdit,
    onDelete,
    isSubmitting,
}: {
    targets: BackupTarget[];
    isLoading: boolean;
    draft: TargetDraft;
    setDraft: (draft: TargetDraft) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onEdit: (target: BackupTarget) => void;
    onDelete: (target: BackupTarget) => void;
    isSubmitting: boolean;
}) {
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <Panel title="Targets">
                <BackupTargetsTable targets={targets} isLoading={isLoading} onEdit={onEdit} onDelete={onDelete} />
            </Panel>
            <Panel title="New SFTP Target">
                <TargetForm
                    draft={draft}
                    setDraft={setDraft}
                    onSubmit={onSubmit}
                    isSubmitting={isSubmitting}
                    submitLabel={isSubmitting ? "Creating..." : "Create target"}
                    secretMode="required"
                />
            </Panel>
        </div>
    );
}

function BackupMetric({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 text-primary" />
            <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold text-zinc-950">{value}</p>
            </div>
        </div>
    );
}

function HealthLine({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full",
                ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
            )}>
                {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            </span>
            <span className="text-zinc-700">{label}</span>
        </div>
    );
}

function BackupSummary({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
    );
}

function SchedulesTab({
    targets,
    schedules,
    isLoading,
    draft,
    setDraft,
    onSubmit,
    onEdit,
    onDelete,
    isSubmitting,
}: {
    targets: BackupTarget[];
    schedules: BackupSchedule[];
    isLoading: boolean;
    draft: ScheduleDraft;
    setDraft: (draft: ScheduleDraft) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onEdit: (schedule: BackupSchedule) => void;
    onDelete: (schedule: BackupSchedule) => void;
    isSubmitting: boolean;
}) {
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <Panel title="Schedules">
                <BackupSchedulesTable schedules={schedules} targets={targets} isLoading={isLoading} onEdit={onEdit} onDelete={onDelete} />
            </Panel>
            <Panel title="New Schedule">
                <ScheduleForm
                    targets={targets.filter((target) => target.enabled)}
                    draft={draft}
                    setDraft={setDraft}
                    onSubmit={onSubmit}
                    isSubmitting={isSubmitting}
                    submitLabel={isSubmitting ? "Creating..." : "Create schedule"}
                />
            </Panel>
        </div>
    );
}

function HistoryTab({
    targets,
    schedules,
    targetByID,
    scheduleByID,
    runs,
    isLoading,
    manualTargetId,
    setManualTargetId,
    onManualBackup,
    onRestore,
    isSubmitting,
}: {
    targets: BackupTarget[];
    schedules: BackupSchedule[];
    targetByID: Map<string, BackupTarget>;
    scheduleByID: Map<string, BackupSchedule>;
    runs: BackupRun[];
    isLoading: boolean;
    manualTargetId: string;
    setManualTargetId: (targetId: string) => void;
    onManualBackup: (event: FormEvent<HTMLFormElement>) => void;
    onRestore: (run: BackupRun) => void;
    isSubmitting: boolean;
}) {
    return (
        <div className="space-y-4">
            <Panel title="Manual Backup">
                <form onSubmit={onManualBackup} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <Field label="Target">
                        <TargetSelect targets={targets.filter((target) => target.enabled)} value={manualTargetId} onChange={setManualTargetId} />
                    </Field>
                    <Button type="submit" disabled={isSubmitting || targets.length === 0}>
                        <Play className="h-4 w-4" />
                        {isSubmitting ? "Enqueuing..." : "Run backup"}
                    </Button>
                </form>
            </Panel>
            <Panel title="Backup Runs">
                <BackupRunsTable
                    runs={runs}
                    isLoading={isLoading}
                    targetByID={targetByID}
                    scheduleByID={scheduleByID}
                    schedules={schedules}
                    onRestore={onRestore}
                />
            </Panel>
        </div>
    );
}

function RestoreTab({
    targets,
    targetByID,
    completedRuns,
    restoreRuns,
    isLoading,
    manualTargetId,
    setManualTargetId,
    backupIdentifier,
    setBackupIdentifier,
    onManualRestore,
    onRestoreFromRun,
}: {
    targets: BackupTarget[];
    targetByID: Map<string, BackupTarget>;
    completedRuns: BackupRun[];
    restoreRuns: RestoreRun[];
    isLoading: boolean;
    manualTargetId: string;
    setManualTargetId: (targetId: string) => void;
    backupIdentifier: string;
    setBackupIdentifier: (value: string) => void;
    onManualRestore: (event: FormEvent<HTMLFormElement>) => void;
    onRestoreFromRun: (run: BackupRun) => void;
}) {
    return (
        <div className="space-y-4">
            <Panel title="Start Restore">
                <form onSubmit={onManualRestore} className="grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_auto] lg:items-end">
                    <Field label="Target">
                        <TargetSelect targets={targets} value={manualTargetId} onChange={setManualTargetId} />
                    </Field>
                    <Field label="Backup identifier">
                        <Input value={backupIdentifier} onChange={(event) => setBackupIdentifier(event.target.value)} placeholder="backup-YYYYMMDD-HHMMSS.tar.zst" />
                    </Field>
                    <Button type="submit" variant="destructive" disabled={targets.length === 0}>
                        <ArchiveRestore className="h-4 w-4" />
                        Restore
                    </Button>
                </form>
            </Panel>

            <Panel title="Completed Backups">
                <CompletedBackupsTable runs={completedRuns} targetByID={targetByID} onRestore={onRestoreFromRun} />
            </Panel>

            <Panel title="Restore Runs">
                <RestoreRunsTable runs={restoreRuns} targetByID={targetByID} isLoading={isLoading} />
            </Panel>
        </div>
    );
}

function TargetForm({
    draft,
    setDraft,
    onSubmit,
    isSubmitting,
    submitLabel,
    secretMode,
}: {
    draft: TargetDraft;
    setDraft: (draft: TargetDraft) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    isSubmitting: boolean;
    submitLabel: string;
    secretMode: "required" | "optional";
}) {
    const secretHint = secretMode === "optional" ? "Leave blank to keep current value." : "";

    return (
        <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                    <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Production SFTP" />
                </Field>
                <Field label="Remote path">
                    <Input value={draft.remotePath} onChange={(event) => setDraft({ ...draft, remotePath: event.target.value })} placeholder="/backups" />
                </Field>
                <Field label="Host">
                    <Input value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} placeholder="sftp.example.com" />
                </Field>
                <Field label="Port">
                    <Input type="number" min="1" max="65535" value={draft.port} onChange={(event) => setDraft({ ...draft, port: event.target.value })} />
                </Field>
                <Field label="Username">
                    <Input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} />
                </Field>
                <Field label="Authentication">
                    <select
                        value={draft.authMode}
                        onChange={(event) => setDraft({ ...draft, authMode: event.target.value as AuthMode })}
                        className="h-10 w-full rounded-xl border bg-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="password">Password</option>
                        <option value="private_key">Private key</option>
                    </select>
                </Field>
            </div>

            {draft.authMode === "password" ? (
                <Field label="Password">
                    <Input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder={secretHint} />
                </Field>
            ) : (
                <div className="grid gap-3">
                    <Field label="Private key">
                        <Textarea value={draft.privateKey} onChange={(event) => setDraft({ ...draft, privateKey: event.target.value })} rows={5} placeholder={secretHint} />
                    </Field>
                    <Field label="Passphrase">
                        <Input type="password" value={draft.passphrase} onChange={(event) => setDraft({ ...draft, passphrase: event.target.value })} placeholder={secretHint} />
                    </Field>
                </div>
            )}

            <Field label="Host key">
                <Textarea value={draft.hostKey} onChange={(event) => setDraft({ ...draft, hostKey: event.target.value })} rows={3} placeholder="ssh-ed25519 AAAA..." />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300"
                />
                Enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                    type="checkbox"
                    checked={draft.insecureSkipHostKeyCheck}
                    onChange={(event) => setDraft({ ...draft, insecureSkipHostKeyCheck: event.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300"
                />
                Skip host-key verification
            </label>
            <Button type="submit" disabled={isSubmitting}>
                <Plus className="h-4 w-4" />
                {submitLabel}
            </Button>
        </form>
    );
}

function ScheduleForm({
    targets,
    draft,
    setDraft,
    onSubmit,
    isSubmitting,
    submitLabel,
}: {
    targets: BackupTarget[];
    draft: ScheduleDraft;
    setDraft: (draft: ScheduleDraft) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    isSubmitting: boolean;
    submitLabel: string;
}) {
    return (
        <form onSubmit={onSubmit} className="space-y-3">
            <Field label="Target">
                <TargetSelect targets={targets} value={draft.targetId} onChange={(targetId) => setDraft({ ...draft, targetId })} />
            </Field>
            <Field label="Name">
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nightly backup" />
            </Field>
            <div className="grid gap-2">
                <Label>Cron preset</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                    {cronPresets.map((preset) => (
                        <Button
                            key={preset.value}
                            variant={draft.cronExpression === preset.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDraft({ ...draft, cronExpression: preset.value })}
                        >
                            {preset.label}
                        </Button>
                    ))}
                </div>
            </div>
            <Field label="Cron expression">
                <Input value={draft.cronExpression} onChange={(event) => setDraft({ ...draft, cronExpression: event.target.value })} />
            </Field>
            <Field label="Keep last backups">
                <Input type="number" min="1" value={draft.keepLastBackups} onChange={(event) => setDraft({ ...draft, keepLastBackups: event.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300"
                />
                Enabled
            </label>
            <Button type="submit" disabled={isSubmitting || targets.length === 0}>
                <Plus className="h-4 w-4" />
                {submitLabel}
            </Button>
        </form>
    );
}

function BackupTargetsTable({
    targets,
    isLoading,
    onEdit,
    onDelete,
}: {
    targets: BackupTarget[];
    isLoading: boolean;
    onEdit: (target: BackupTarget) => void;
    onDelete: (target: BackupTarget) => void;
}) {
    if (isLoading) return <EmptyState>Loading targets...</EmptyState>;
    if (targets.length === 0) return <EmptyState>No backup targets yet.</EmptyState>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24 text-right"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {targets.map((target) => (
                    <TableRow key={target.id}>
                        <TableCell>
                            <div className="font-medium">{target.name}</div>
                            <div className="text-xs uppercase text-muted-foreground">{target.type}</div>
                        </TableCell>
                        <TableCell>
                            <div className="max-w-xs truncate font-mono text-xs">{target.configuration?.host || "—"}</div>
                            <div className="max-w-xs truncate text-xs text-muted-foreground">{target.configuration?.remote_path || "—"}</div>
                        </TableCell>
                        <TableCell><StatusBadge status={target.enabled ? "completed" : "failed"} label={target.enabled ? "Enabled" : "Disabled"} /></TableCell>
                        <TableCell className="text-right">
                            <RowActions label={target.name} onEdit={() => onEdit(target)} onDelete={() => onDelete(target)} />
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function BackupSchedulesTable({
    schedules,
    targets,
    isLoading,
    onEdit,
    onDelete,
}: {
    schedules: BackupSchedule[];
    targets: BackupTarget[];
    isLoading: boolean;
    onEdit: (schedule: BackupSchedule) => void;
    onDelete: (schedule: BackupSchedule) => void;
}) {
    const targetByID = new Map(targets.map((target) => [target.id, target]));
    if (isLoading) return <EmptyState>Loading schedules...</EmptyState>;
    if (schedules.length === 0) return <EmptyState>No schedules yet.</EmptyState>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Cron</TableHead>
                    <TableHead>Retention</TableHead>
                    <TableHead className="w-24 text-right"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                        <TableCell>
                            <div className="font-medium">{schedule.name}</div>
                            <StatusBadge status={schedule.enabled ? "completed" : "failed"} label={schedule.enabled ? "Enabled" : "Disabled"} />
                        </TableCell>
                        <TableCell>{targetByID.get(schedule.target_id)?.name ?? "Deleted target"}</TableCell>
                        <TableCell className="font-mono text-xs">{schedule.cron_expression}</TableCell>
                        <TableCell>{schedule.retention_policy.keep_last_backups}</TableCell>
                        <TableCell className="text-right">
                            <RowActions label={schedule.name} onEdit={() => onEdit(schedule)} onDelete={() => onDelete(schedule)} />
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function BackupRunsTable({
    runs,
    isLoading,
    targetByID,
    scheduleByID,
    onRestore,
}: {
    runs: BackupRun[];
    isLoading: boolean;
    targetByID: Map<string, BackupTarget>;
    scheduleByID: Map<string, BackupSchedule>;
    schedules: BackupSchedule[];
    onRestore: (run: BackupRun) => void;
}) {
    if (isLoading) return <EmptyState>Loading backup runs...</EmptyState>;
    if (runs.length === 0) return <EmptyState>No backup runs yet.</EmptyState>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Backup</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="w-20 text-right"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {runs.map((run) => (
                    <TableRow key={run.id}>
                        <TableCell>
                            <StatusBadge status={run.status} />
                            {run.error_message ? <div className="mt-1 max-w-xs text-xs text-red-600">{run.error_message}</div> : null}
                        </TableCell>
                        <TableCell>{targetByID.get(run.target_id)?.name ?? "Deleted target"}</TableCell>
                        <TableCell>{run.schedule_id ? scheduleByID.get(run.schedule_id)?.name ?? "Deleted schedule" : "Manual"}</TableCell>
                        <TableCell>
                            <Progress value={run.progress_percent} />
                            <div className="mt-1 text-xs text-muted-foreground">{run.phase}</div>
                        </TableCell>
                        <TableCell>
                            <div className="max-w-[14rem] truncate font-mono text-xs">{run.backup_path ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{formatBytes(run.size_bytes)}</div>
                        </TableCell>
                        <TableCell>
                            <div>{formatDate(run.started_at ?? run.created_at)}</div>
                            <div className="text-xs text-muted-foreground">{run.finished_at ? `Finished ${formatDate(run.finished_at)}` : ""}</div>
                        </TableCell>
                        <TableCell className="text-right">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={run.status !== "completed" || !run.backup_path || !targetByID.has(run.target_id)}
                                onClick={() => onRestore(run)}
                                title="Restore from this backup"
                            >
                                <ArchiveRestore className="h-4 w-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function CompletedBackupsTable({
    runs,
    targetByID,
    onRestore,
}: {
    runs: BackupRun[];
    targetByID: Map<string, BackupTarget>;
    onRestore: (run: BackupRun) => void;
}) {
    if (runs.length === 0) return <EmptyState>No completed backups with identifiers yet.</EmptyState>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Backup</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20 text-right"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {runs.map((run) => (
                    <TableRow key={run.id}>
                        <TableCell className="font-mono text-xs">{run.backup_path}</TableCell>
                        <TableCell>{targetByID.get(run.target_id)?.name ?? "Deleted target"}</TableCell>
                        <TableCell>{formatDate(run.finished_at ?? run.created_at)}</TableCell>
                        <TableCell className="text-right">
                            <Button variant="destructive" size="sm" disabled={!targetByID.has(run.target_id)} onClick={() => onRestore(run)}>
                                <ArchiveRestore className="h-4 w-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function RestoreRunsTable({ runs, targetByID, isLoading }: { runs: RestoreRun[]; targetByID: Map<string, BackupTarget>; isLoading: boolean }) {
    if (isLoading) return <EmptyState>Loading restore runs...</EmptyState>;
    if (runs.length === 0) return <EmptyState>No restore runs yet.</EmptyState>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Backup</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Started</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {runs.map((run) => (
                    <TableRow key={run.id}>
                        <TableCell>
                            <StatusBadge status={run.status} />
                            {run.error_message ? <div className="mt-1 max-w-xs text-xs text-red-600">{run.error_message}</div> : null}
                        </TableCell>
                        <TableCell>{targetByID.get(run.target_id)?.name ?? "Deleted target"}</TableCell>
                        <TableCell className="max-w-[16rem] truncate font-mono text-xs">{run.backup_identifier}</TableCell>
                        <TableCell>
                            <Progress value={run.progress_percent} />
                            <div className="mt-1 text-xs text-muted-foreground">{run.phase}</div>
                        </TableCell>
                        <TableCell>
                            <div>{formatDate(run.started_at ?? run.created_at)}</div>
                            <div className="text-xs text-muted-foreground">{run.finished_at ? `Finished ${formatDate(run.finished_at)}` : ""}</div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="apple-card rounded-2xl p-4">
            <h2 className="mb-3 text-base font-semibold">{title}</h2>
            {children}
        </section>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
        </div>
    );
}

function TargetSelect({ targets, value, onChange }: { targets: BackupTarget[]; value: string; onChange: (targetId: string) => void }) {
    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-xl border bg-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {targets.length === 0 ? <option value="">No targets</option> : null}
            {targets.map((target) => (
                <option key={target.id} value={target.id}>{target.name}</option>
            ))}
        </select>
    );
}

function StatusBadge({ status, label }: { status: BackupJobStatus; label?: string }) {
    const tone = {
        pending: "bg-amber-100 text-amber-800",
        running: "bg-blue-100 text-blue-800",
        completed: "bg-emerald-100 text-emerald-800",
        failed: "bg-red-100 text-red-800",
    }[status];

    return (
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", tone)}>
            {status === "completed" ? <CheckCircle2 className="h-3 w-3" /> : null}
            {status === "failed" ? <XCircle className="h-3 w-3" /> : null}
            {status === "running" ? <RotateCcw className="h-3 w-3" /> : null}
            {label ?? status}
        </span>
    );
}

function Progress({ value }: { value: number }) {
    const safeValue = Math.max(0, Math.min(100, value || 0));
    return (
        <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${safeValue}%` }} />
        </div>
    );
}

function RowActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
    return (
        <div className="inline-flex gap-1">
            <Button variant="ghost" size="icon" title={`Edit ${label}`} aria-label={`Edit ${label}`} onClick={onEdit}>
                <Edit3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title={`Delete ${label}`} aria-label={`Delete ${label}`} onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
}

function EmptyState({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl bg-zinc-50 p-4 text-sm text-muted-foreground">{children}</p>;
}

function buildTargetPayload(draft: TargetDraft) {
    return {
        name: draft.name.trim(),
        type: "sftp" as const,
        enabled: draft.enabled,
        configuration: buildTargetConfiguration(draft, false),
    };
}

function buildTargetUpdatePayload(draft: TargetDraft) {
    return {
        name: draft.name.trim(),
        enabled: draft.enabled,
        configuration: buildTargetConfiguration(draft, true),
    };
}

function buildTargetConfiguration(draft: TargetDraft, preserveEmptySecrets: boolean) {
    return {
        host: draft.host.trim(),
        port: parsePositiveInt(draft.port, 22),
        username: draft.username.trim(),
        remote_path: draft.remotePath.trim(),
        password: draft.authMode === "password" && (!preserveEmptySecrets || draft.password) ? draft.password : undefined,
        private_key: draft.authMode === "private_key" && (!preserveEmptySecrets || draft.privateKey) ? draft.privateKey : undefined,
        passphrase: draft.authMode === "private_key" && draft.passphrase ? draft.passphrase : undefined,
        host_key: draft.hostKey.trim() || undefined,
        insecure_skip_host_key_check: draft.insecureSkipHostKeyCheck,
    };
}

function draftFromTarget(target: BackupTarget): TargetDraft {
    const configuration = target.configuration ?? {};
    return {
        name: target.name,
        enabled: target.enabled,
        host: String(configuration.host ?? ""),
        port: String(configuration.port ?? "22"),
        username: String(configuration.username ?? ""),
        remotePath: String(configuration.remote_path ?? "/backups"),
        authMode: configuration.private_key ? "private_key" : "password",
        password: "",
        privateKey: "",
        passphrase: "",
        hostKey: String(configuration.host_key ?? ""),
        insecureSkipHostKeyCheck: Boolean(configuration.insecure_skip_host_key_check),
    };
}

function draftFromSchedule(schedule: BackupSchedule): ScheduleDraft {
    return {
        targetId: schedule.target_id,
        name: schedule.name,
        enabled: schedule.enabled,
        cronExpression: schedule.cron_expression,
        keepLastBackups: String(schedule.retention_policy.keep_last_backups),
    };
}

function validateTargetDraft(draft: TargetDraft, preserveEmptySecrets = false) {
    if (!draft.name.trim()) return "Target name is required.";
    if (!draft.host.trim()) return "SFTP host is required.";
    if (!draft.username.trim()) return "SFTP username is required.";
    if (!draft.remotePath.trim()) return "Remote path is required.";
    if (!preserveEmptySecrets && draft.authMode === "password" && !draft.password) return "Password is required.";
    if (!preserveEmptySecrets && draft.authMode === "private_key" && !draft.privateKey.trim()) return "Private key is required.";
    if (!draft.hostKey.trim() && !draft.insecureSkipHostKeyCheck) return "Host key is required unless host-key verification is skipped.";
    return "";
}

function validateScheduleDraft(draft: ScheduleDraft) {
    if (!draft.targetId) return "Select a target for the schedule.";
    if (!draft.name.trim()) return "Schedule name is required.";
    if (!draft.cronExpression.trim()) return "Cron expression is required.";
    return "";
}

function parsePositiveInt(value: string, fallback: number) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatBytes(value?: number) {
    if (!value) return "—";
    return new Intl.NumberFormat(undefined, {
        style: "unit",
        unit: "byte",
        notation: "compact",
        unitDisplay: "narrow",
    }).format(value);
}

function errorMessage(err: unknown, fallback: string) {
    return err instanceof ApiError ? err.message : fallback;
}
