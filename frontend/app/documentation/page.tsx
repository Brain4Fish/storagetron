"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import {
    api,
    ApiError,
    CreateDocumentationReportRequest,
    DocumentationReport,
    DocumentationReportFormat,
    DocumentationScopeType,
    DocumentationSummary,
} from "@/lib/api";
import { formatLocation } from "@/lib/location";
import { cn, formatDate } from "@/lib/utils";
import { ContainerReportPickerDialog } from "@/components/container-report-picker-dialog";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialSummary: DocumentationSummary = {
    owner_name: "",
    carrier: "",
    transport_order_number: "",
    origin_country: "Россия",
    origin_address: "",
    destination_country: "Казахстан",
    destination_address: "",
    shipment_date: "",
};

export default function DocumentationPage() {
    const queryClient = useQueryClient();
    const [summary, setSummary] = useState<DocumentationSummary>(initialSummary);
    const [scopeType, setScopeType] = useState<DocumentationScopeType>("location");
    const [locationId, setLocationId] = useState("");
    const [selectedContainerIds, setSelectedContainerIds] = useState<Set<string>>(() => new Set());
    const [format, setFormat] = useState<DocumentationReportFormat>("xlsx");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [formError, setFormError] = useState("");
    const [latestReport, setLatestReport] = useState<DocumentationReport | null>(null);
    const [downloadId, setDownloadId] = useState("");
    const [downloadError, setDownloadError] = useState("");

    const locationsQuery = useQuery({
        queryKey: ["locations"],
        queryFn: api.listLocations,
    });
    const containersQuery = useQuery({
        queryKey: ["containers"],
        queryFn: api.listContainers,
        enabled: scopeType === "containers" || pickerOpen,
    });
    const reportsQuery = useQuery({
        queryKey: ["documentation-reports"],
        queryFn: api.listDocumentationReports,
    });

    const createMutation = useMutation({
        mutationFn: (request: CreateDocumentationReportRequest) => api.createDocumentationReport(request),
        onSuccess: async (report) => {
            setLatestReport(report);
            setLocationId("");
            setSelectedContainerIds(new Set());
            await queryClient.invalidateQueries({ queryKey: ["documentation-reports"] });
        },
        onError: (error) => {
            setFormError(documentationErrorMessage(error));
        },
    });

    const updateSummary = <K extends keyof DocumentationSummary>(key: K, value: DocumentationSummary[K]) => {
        setFormError("");
        setSummary((current) => ({ ...current, [key]: value }));
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormError("");
        setLatestReport(null);

        const validationError = validateDocumentationForm(summary, scopeType, locationId, selectedContainerIds);
        if (validationError) {
            setFormError(validationError);
            return;
        }

        const scope: CreateDocumentationReportRequest["scope"] = scopeType === "location"
            ? { type: "location", location_id: locationId }
            : { type: "containers", container_ids: Array.from(selectedContainerIds) };

        createMutation.mutate({
            scope,
            format,
            language: "ru",
            summary: trimSummary(summary),
        });
    };

    const downloadReport = async (report: DocumentationReport) => {
        setDownloadId(report.id);
        setDownloadError("");
        try {
            const download = await api.downloadDocumentationReport(report.id, report.filename);
            const url = URL.createObjectURL(download.blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = download.filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            setDownloadError(documentationErrorMessage(error, "Не удалось скачать отчёт."));
        } finally {
            setDownloadId("");
        }
    };

    const scopeMissing = scopeType === "location" ? !locationId : selectedContainerIds.size === 0;
    const reports = reportsQuery.data ?? [];

    return (
        <PageShell>
            <div className="space-y-6 pt-16 md:pt-0">
                <header>
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-primary shadow-sm">
                            <FileText className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Сформируйте инвентарный отчёт для перевозки.
                            </p>
                        </div>
                    </div>
                </header>

                <form className="apple-card rounded-2xl p-4 sm:p-6" noValidate onSubmit={submit}>
                    <section aria-labelledby="documentation-summary-heading">
                        <h2 id="documentation-summary-heading" className="text-lg font-semibold tracking-tight">Summary</h2>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <TextField id="documentation-owner" label="ФИО владельца" value={summary.owner_name} required onChange={(value) => updateSummary("owner_name", value)} />
                            <TextField id="documentation-carrier" label="Перевозчик" value={summary.carrier} required onChange={(value) => updateSummary("carrier", value)} />
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="documentation-order-number">Номер заказа транспортной компании</Label>
                                <Input id="documentation-order-number" value={summary.transport_order_number} onChange={(event) => updateSummary("transport_order_number", event.target.value)} />
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Если оставить поле пустым, в отчёте останется место для ручного заполнения.
                                </p>
                            </div>
                            <TextField id="documentation-origin-country" label="Страна отправления" value={summary.origin_country} required onChange={(value) => updateSummary("origin_country", value)} />
                            <TextField id="documentation-origin-address" label="Адрес отправления" value={summary.origin_address} required onChange={(value) => updateSummary("origin_address", value)} />
                            <TextField id="documentation-destination-country" label="Страна назначения" value={summary.destination_country} required onChange={(value) => updateSummary("destination_country", value)} />
                            <TextField id="documentation-destination-address" label="Адрес назначения" value={summary.destination_address} required onChange={(value) => updateSummary("destination_address", value)} />
                            <TextField id="documentation-shipment-date" label="Дата отправки" type="date" value={summary.shipment_date} required onChange={(value) => updateSummary("shipment_date", value)} />
                        </div>
                    </section>

                    <section className="mt-7 border-t border-border pt-6" aria-labelledby="documentation-scope-heading">
                        <h2 id="documentation-scope-heading" className="text-lg font-semibold tracking-tight">Scope</h2>
                        <div className="mt-4 inline-flex w-full rounded-xl bg-zinc-100 p-1 sm:w-auto" role="group" aria-label="Область отчёта">
                            <SegmentButton selected={scopeType === "location"} onClick={() => { setScopeType("location"); setFormError(""); }}>
                                По локации
                            </SegmentButton>
                            <SegmentButton selected={scopeType === "containers"} onClick={() => { setScopeType("containers"); setFormError(""); }}>
                                По коробкам
                            </SegmentButton>
                        </div>

                        <div className="mt-4">
                            {scopeType === "location" ? (
                                <div className="max-w-xl space-y-2">
                                    <Label htmlFor="documentation-location">Локация</Label>
                                    <select
                                        id="documentation-location"
                                        value={locationId}
                                        disabled={locationsQuery.isLoading || locationsQuery.isError}
                                        onChange={(event) => { setLocationId(event.target.value); setFormError(""); }}
                                        className={selectClassName}
                                    >
                                        <option value="">{locationsQuery.isLoading ? "Загружаем локации..." : "Выберите локацию"}</option>
                                        {(locationsQuery.data ?? []).map((location) => (
                                            <option key={location.id} value={location.id}>{formatLocation(location)}</option>
                                        ))}
                                    </select>
                                    {locationsQuery.isError ? (
                                        <QueryError message="Не удалось загрузить локации." onRetry={() => locationsQuery.refetch()} />
                                    ) : null}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-zinc-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="font-medium text-zinc-950">
                                            {selectedContainerIds.size > 0
                                                ? pluralizeContainers(selectedContainerIds.size)
                                                : "Коробки не выбраны"}
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Выбор используется только для отчёта и не меняет содержимое коробок.
                                        </p>
                                    </div>
                                    <Button variant="outline" onClick={() => setPickerOpen(true)}>
                                        Выбрать коробки
                                    </Button>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="mt-7 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
                        <SelectField id="documentation-format" label="Формат" value={format} onChange={(value) => setFormat(value as DocumentationReportFormat)}>
                            <option value="xlsx">XLSX</option>
                            <option value="pdf">PDF</option>
                        </SelectField>
                        <SelectField id="documentation-language" label="Язык" value="ru" onChange={() => undefined}>
                            <option value="ru">Русский</option>
                        </SelectField>
                    </section>

                    {formError ? (
                        <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {formError}
                        </p>
                    ) : null}

                    {latestReport ? (
                        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="font-semibold">Отчёт сформирован</p>
                                    <p className="mt-1 truncate text-emerald-800">{latestReport.filename}</p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                className="border-emerald-300 bg-white hover:bg-emerald-100"
                                disabled={downloadId === latestReport.id}
                                onClick={() => downloadReport(latestReport)}
                            >
                                {downloadId === latestReport.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                Скачать
                            </Button>
                        </div>
                    ) : null}

                    <div className="mt-6 flex justify-end">
                        <Button type="submit" size="lg" disabled={scopeMissing || createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            {createMutation.isPending ? "Формируем отчёт..." : "Сформировать отчёт"}
                        </Button>
                    </div>
                </form>

                {reportsQuery.isLoading ? (
                    <div className="apple-card rounded-2xl p-5 text-sm text-muted-foreground">
                        Загружаем ранее сформированные отчёты...
                    </div>
                ) : null}

                {reportsQuery.isError && reports.length === 0 ? (
                    <div className="apple-card flex flex-col gap-3 rounded-2xl p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-destructive">Не удалось загрузить список отчётов.</p>
                        <Button variant="outline" onClick={() => reportsQuery.refetch()}>
                            <RefreshCw className="h-4 w-4" />
                            Повторить
                        </Button>
                    </div>
                ) : null}

                {reports.length > 0 ? (
                    <section aria-labelledby="documentation-history-heading">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h2 id="documentation-history-heading" className="text-xl font-semibold tracking-tight">
                                Ранее сформированные отчёты
                            </h2>
                            {reportsQuery.isError ? (
                                <QueryError message="Не удалось обновить список; показаны сохранённые данные." onRetry={() => reportsQuery.refetch()} />
                            ) : null}
                        </div>
                        <DocumentationReports
                            reports={reports}
                            downloadId={downloadId}
                            onDownload={downloadReport}
                        />
                    </section>
                ) : null}

                {downloadError ? (
                    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {downloadError}
                    </p>
                ) : null}
            </div>

            <ContainerReportPickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                containers={containersQuery.data ?? []}
                selectedContainerIds={selectedContainerIds}
                onConfirm={(containerIds) => { setSelectedContainerIds(new Set(containerIds)); setFormError(""); }}
                isLoading={containersQuery.isLoading}
                loadError={containersQuery.isError ? "Обновите данные и попробуйте снова." : ""}
            />
        </PageShell>
    );
}

function TextField({
    id,
    label,
    value,
    type = "text",
    required,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    type?: string;
    required?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

function SelectField({
    id,
    label,
    value,
    onChange,
    children,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={selectClassName}>
                {children}
            </select>
        </div>
    );
}

function SegmentButton({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                "min-w-0 flex-1 rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 outline-none transition hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-ring sm:min-w-36",
                selected && "bg-white text-zinc-950 shadow-sm",
            )}
        >
            {children}
        </button>
    );
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>{message}</span>
            <button type="button" onClick={onRetry} className="font-medium text-primary hover:underline">
                Повторить
            </button>
        </div>
    );
}

function DocumentationReports({
    reports,
    downloadId,
    onDownload,
}: {
    reports: DocumentationReport[];
    downloadId: string;
    onDownload: (report: DocumentationReport) => void;
}) {
    return (
        <>
            <div className="space-y-3 md:hidden" aria-label="Отчёты">
                {reports.map((report) => (
                    <article key={report.id} className="apple-card rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-zinc-950">{report.filename}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{formatDate(report.created_at)}</p>
                            </div>
                            <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-primary">
                                {report.format.toUpperCase()}
                            </span>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <ReportDetail label="Область" value={scopeLabel(report)} />
                            <ReportDetail label="Номер заказа" value={report.transport_order_number || "—"} />
                            <ReportDetail label="Язык" value={languageLabel(report.language)} />
                            <ReportDetail label="Размер" value={formatBytes(report.size_bytes)} />
                        </dl>
                        <Button
                            variant="outline"
                            className="mt-4 w-full"
                            disabled={downloadId === report.id}
                            onClick={() => onDownload(report)}
                        >
                            {downloadId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Скачать
                        </Button>
                    </article>
                ))}
            </div>

            <div className="apple-card hidden overflow-x-auto rounded-2xl md:block">
                <table className="w-full min-w-[1050px] text-sm">
                    <thead className="bg-zinc-50 text-xs font-medium text-muted-foreground">
                        <tr>
                            {["Дата", "Имя файла", "Область", "Номер заказа", "Формат", "Язык", "Размер", "Скачать"].map((heading) => (
                                <th key={heading} className={cn("px-4 py-3 text-left", heading === "Скачать" && "text-right")}>{heading}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {reports.map((report) => (
                            <tr key={report.id} className="transition hover:bg-zinc-50">
                                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(report.created_at)}</td>
                                <td className="max-w-72 px-4 py-3 font-medium text-zinc-950"><span className="block truncate" title={report.filename}>{report.filename}</span></td>
                                <td className="whitespace-nowrap px-4 py-3">{scopeLabel(report)}</td>
                                <td className="max-w-52 px-4 py-3"><span className="block truncate">{report.transport_order_number || "—"}</span></td>
                                <td className="px-4 py-3 font-semibold">{report.format.toUpperCase()}</td>
                                <td className="px-4 py-3">{languageLabel(report.language)}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatBytes(report.size_bytes)}</td>
                                <td className="px-4 py-3 text-right">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        aria-label={`Скачать ${report.filename}`}
                                        disabled={downloadId === report.id}
                                        onClick={() => onDownload(report)}
                                    >
                                        {downloadId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                        Скачать
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function ReportDetail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words font-medium text-zinc-950">{value}</dd>
        </div>
    );
}

function validateDocumentationForm(
    summary: DocumentationSummary,
    scopeType: DocumentationScopeType,
    locationId: string,
    containerIds: Set<string>,
) {
    if (!summary.owner_name.trim()) return "Укажите ФИО владельца.";
    if (!summary.carrier.trim()) return "Укажите перевозчика.";
    if (!summary.origin_country.trim()) return "Укажите страну отправления.";
    if (!summary.origin_address.trim()) return "Укажите адрес отправления.";
    if (!summary.destination_country.trim()) return "Укажите страну назначения.";
    if (!summary.destination_address.trim()) return "Укажите адрес назначения.";
    if (!summary.shipment_date) return "Укажите дату отправки.";
    if (scopeType === "location" && !locationId) return "Выберите локацию.";
    if (scopeType === "containers" && containerIds.size === 0) return "Выберите хотя бы одну коробку.";
    return "";
}

function trimSummary(summary: DocumentationSummary): DocumentationSummary {
    return Object.fromEntries(
        Object.entries(summary).map(([key, value]) => [key, value.trim()]),
    ) as DocumentationSummary;
}

function documentationErrorMessage(error: unknown, fallback = "Не удалось сформировать отчёт.") {
    if (!(error instanceof ApiError)) return fallback;
    if (error.status === 404 && error.message === "documentation scope not found") {
        return "Выбранная локация или коробка больше не существует. Обновите данные и выберите область снова.";
    }

    const messages: Record<string, string> = {
        "summary.owner_name is required": "Укажите ФИО владельца.",
        "summary.origin_country is required": "Укажите страну отправления.",
        "summary.destination_country is required": "Укажите страну назначения.",
        "summary.shipment_date must use yyyy-mm-dd": "Укажите корректную дату отправки.",
        "location scope requires location_id only": "Выберите одну локацию.",
        "containers scope requires non-empty container_ids only": "Выберите хотя бы одну коробку.",
        "language must be ru": "Выбранный язык пока не поддерживается.",
        "format must be xlsx or pdf": "Выберите формат XLSX или PDF.",
    };
    return messages[error.message] || (error.status === 0 ? "Сервер не ответил вовремя. Попробуйте ещё раз." : `${fallback} ${error.message}`);
}

function scopeLabel(report: DocumentationReport) {
    return report.scope_type === "location"
        ? report.scope_summary.location_name || "Локация"
        : pluralizeContainers(report.scope_summary.containers_count);
}

function pluralizeContainers(count: number) {
    const mod100 = count % 100;
    const mod10 = count % 10;
    const word = mod100 >= 11 && mod100 <= 14
        ? "коробок"
        : mod10 === 1
            ? "коробка"
            : mod10 >= 2 && mod10 <= 4
                ? "коробки"
                : "коробок";
    return `${count} ${word}`;
}

function languageLabel(language: string) {
    return language === "ru" ? "Русский" : language;
}

function formatBytes(value: number) {
    if (!Number.isFinite(value) || value < 0) return "—";
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB"];
    let size = value / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(size)} ${units[unitIndex]}`;
}

const selectClassName = "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
