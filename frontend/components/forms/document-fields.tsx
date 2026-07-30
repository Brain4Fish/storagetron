"use client";

import { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
    CreateContainerRequest,
    CreateItemRequest,
    Item,
    Container,
} from "@/lib/api";

const CURRENCIES = ["RUB", "KZT", "EUR", "USD"] as const;

export type ItemDocumentDraft = {
    quantity: string;
    category: string;
    acquisitionYear: string;
    condition: "new" | "used";
    serialNumber: string;
    estimatedValue: string;
    valueCurrency: string;
};

export type ContainerDocumentDraft = {
    packageCode: string;
    grossWeightKg: string;
    volumeM3: string;
    estimatedValue: string;
    valueCurrency: string;
};

export function initialItemDocumentDraft(item?: Partial<Item>): ItemDocumentDraft {
    return {
        quantity: String(item?.quantity ?? 1),
        category: item?.category ?? "",
        acquisitionYear: item?.acquisition_year == null ? "" : String(item.acquisition_year),
        condition: item?.condition ?? "used",
        serialNumber: item?.serial_number ?? "",
        estimatedValue: item?.estimated_value == null ? "" : String(item.estimated_value),
        valueCurrency: item?.value_currency ?? "",
    };
}

export function initialContainerDocumentDraft(container?: Partial<Container>): ContainerDocumentDraft {
    return {
        packageCode: container?.package_code ?? "",
        grossWeightKg: container?.gross_weight_kg == null ? "" : String(container.gross_weight_kg),
        volumeM3: container?.volume_m3 == null ? "" : String(container.volume_m3),
        estimatedValue: container?.estimated_value == null ? "" : String(container.estimated_value),
        valueCurrency: container?.value_currency ?? "",
    };
}

export function itemDocumentPayload(draft: ItemDocumentDraft): Pick<
    CreateItemRequest,
    "quantity" | "category" | "acquisition_year" | "condition" | "serial_number" | "estimated_value" | "value_currency"
> {
    return {
        quantity: Number(draft.quantity),
        category: draft.category.trim(),
        acquisition_year: optionalNumber(draft.acquisitionYear),
        condition: draft.condition,
        serial_number: draft.serialNumber.trim(),
        estimated_value: optionalNumber(draft.estimatedValue),
        value_currency: draft.estimatedValue.trim() ? draft.valueCurrency || null : null,
    };
}

export function containerDocumentPayload(draft: ContainerDocumentDraft): Pick<
    CreateContainerRequest,
    "package_code" | "gross_weight_kg" | "volume_m3" | "estimated_value" | "value_currency"
> {
    return {
        package_code: draft.packageCode.trim(),
        gross_weight_kg: optionalNumber(draft.grossWeightKg),
        volume_m3: optionalNumber(draft.volumeM3),
        estimated_value: optionalNumber(draft.estimatedValue),
        value_currency: draft.estimatedValue.trim() ? draft.valueCurrency || null : null,
    };
}

export function validateItemDocumentDraft(draft: ItemDocumentDraft): string {
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) return "Количество должно быть целым числом больше 0.";
    if (draft.acquisitionYear.trim()) {
        const year = Number(draft.acquisitionYear);
        if (!Number.isInteger(year) || year < -32768 || year > 32767) {
            return "Год приобретения должен помещаться в диапазон SMALLINT.";
        }
    }
    const valueError = validateEstimatedValue(draft.estimatedValue, draft.valueCurrency);
    return valueError;
}

export function validateContainerDocumentDraft(draft: ContainerDocumentDraft): string {
    if (draft.grossWeightKg.trim() && (!Number.isFinite(Number(draft.grossWeightKg)) || Number(draft.grossWeightKg) <= 0)) {
        return "Вес брутто должен быть больше 0.";
    }
    if (draft.volumeM3.trim() && (!Number.isFinite(Number(draft.volumeM3)) || Number(draft.volumeM3) <= 0)) {
        return "Объём должен быть больше 0.";
    }
    return validateEstimatedValue(draft.estimatedValue, draft.valueCurrency);
}

export function ItemDocumentFields({
    value,
    onChange,
    idPrefix,
}: {
    value: ItemDocumentDraft;
    onChange: (value: ItemDocumentDraft) => void;
    idPrefix: string;
}) {
    const update = <K extends keyof ItemDocumentDraft>(key: K, next: ItemDocumentDraft[K]) =>
        onChange({ ...value, [key]: next });

    return (
        <DocumentDataSection>
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberField id={`${idPrefix}-quantity`} label="Количество" value={value.quantity} min="1" step="1" required onChange={(next) => update("quantity", next)} />
                <TextField id={`${idPrefix}-category`} label="Категория" value={value.category} onChange={(next) => update("category", next)} />
                <NumberField id={`${idPrefix}-acquisition-year`} label="Год приобретения" value={value.acquisitionYear} min="-32768" max="32767" step="1" onChange={(next) => update("acquisitionYear", next)} />
                <SelectField id={`${idPrefix}-condition`} label="Состояние" value={value.condition} onChange={(next) => update("condition", next as "new" | "used")}>
                    <option value="used">Бывшее в употреблении</option>
                    <option value="new">Новое</option>
                </SelectField>
                <TextField id={`${idPrefix}-serial-number`} label="Серийный номер" value={value.serialNumber} onChange={(next) => update("serialNumber", next)} />
                <NumberField id={`${idPrefix}-estimated-value`} label="Оценочная стоимость" value={value.estimatedValue} min="0" step="0.01" onChange={(next) => update("estimatedValue", next)} />
                <CurrencyField id={`${idPrefix}-currency`} value={value.valueCurrency} required={Boolean(value.estimatedValue.trim())} onChange={(next) => update("valueCurrency", next)} />
            </div>
        </DocumentDataSection>
    );
}

export function ContainerDocumentFields({
    value,
    onChange,
    idPrefix,
}: {
    value: ContainerDocumentDraft;
    onChange: (value: ContainerDocumentDraft) => void;
    idPrefix: string;
}) {
    const update = <K extends keyof ContainerDocumentDraft>(key: K, next: ContainerDocumentDraft[K]) =>
        onChange({ ...value, [key]: next });

    return (
        <DocumentDataSection>
            <div className="grid gap-4 sm:grid-cols-2">
                <TextField id={`${idPrefix}-package-code`} label="Номер грузового места" value={value.packageCode} placeholder="BX-001" onChange={(next) => update("packageCode", next)} />
                <NumberField id={`${idPrefix}-gross-weight`} label="Вес брутто, кг" value={value.grossWeightKg} min="0.001" step="0.001" onChange={(next) => update("grossWeightKg", next)} />
                <NumberField id={`${idPrefix}-volume`} label="Объём, м³" value={value.volumeM3} min="0.0001" step="0.0001" onChange={(next) => update("volumeM3", next)} />
                <NumberField id={`${idPrefix}-estimated-value`} label="Оценочная стоимость места" value={value.estimatedValue} min="0" step="0.01" onChange={(next) => update("estimatedValue", next)} />
                <CurrencyField id={`${idPrefix}-currency`} value={value.valueCurrency} required={Boolean(value.estimatedValue.trim())} onChange={(next) => update("valueCurrency", next)} />
            </div>
        </DocumentDataSection>
    );
}

function DocumentDataSection({ children }: { children: ReactNode }) {
    return (
        <details className="rounded-xl border bg-zinc-50/60">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-900">
                Данные для документов
            </summary>
            <div className="border-t px-4 py-4">{children}</div>
        </details>
    );
}

function TextField({
    id,
    label,
    value,
    placeholder,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

function NumberField({
    id,
    label,
    value,
    min,
    max,
    step,
    required,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    min?: string;
    max?: string;
    step: string;
    required?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                required={required}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}

function SelectField({
    id,
    label,
    value,
    onChange,
    children,
    required,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
    required?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <select
                id={id}
                value={value}
                required={required}
                onChange={(event) => onChange(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {children}
            </select>
        </div>
    );
}

function CurrencyField({
    id,
    value,
    required,
    onChange,
}: {
    id: string;
    value: string;
    required: boolean;
    onChange: (value: string) => void;
}) {
    const isSuggested = CURRENCIES.includes(value as (typeof CURRENCIES)[number]);
    return (
        <SelectField id={id} label="Валюта" value={value} required={required} onChange={onChange}>
            <option value="">Не выбрана</option>
            {!isSuggested && value ? <option value={value}>{value}</option> : null}
            {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </SelectField>
    );
}

function optionalNumber(value: string): number | null {
    return value.trim() ? Number(value) : null;
}

function validateEstimatedValue(value: string, currency: string): string {
    if (!value.trim() && currency) return "Валюта не может быть задана без оценочной стоимости.";
    if (!value.trim()) return "";
    if (!Number.isFinite(Number(value)) || Number(value) < 0) return "Оценочная стоимость не может быть отрицательной.";
    if (!currency) return "Выберите валюту для оценочной стоимости.";
    return "";
}
