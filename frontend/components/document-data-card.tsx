import type { Container, Item } from "@/lib/api";

type Props =
    | { kind: "item"; value: Item }
    | { kind: "container"; value: Container };

export function DocumentDataCard(props: Props) {
    const rows = props.kind === "item"
        ? itemRows(props.value)
        : containerRows(props.value);

    return (
        <section className="apple-card rounded-2xl p-5">
            <h2 className="text-lg font-semibold">Данные для документов</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4 border-b border-border/60 pb-2">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="text-right font-medium text-zinc-900">{value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

function itemRows(item: Item): Array<[string, string]> {
    return [
        ["Количество", String(item.quantity)],
        ["Категория", item.category || "—"],
        ["Год приобретения", item.acquisition_year == null ? "—" : String(item.acquisition_year)],
        ["Состояние", item.condition === "new" ? "Новое" : "Бывшее в употреблении"],
        ["Серийный номер", item.serial_number || "—"],
        ["Оценочная стоимость", formatMoney(item.estimated_value, item.value_currency)],
        ["Валюта", item.value_currency || "—"],
    ];
}

function containerRows(container: Container): Array<[string, string]> {
    return [
        ["Номер грузового места", container.package_code || "—"],
        ["Вес брутто, кг", formatNumber(container.gross_weight_kg, 3)],
        ["Объём, м³", formatNumber(container.volume_m3, 4)],
        ["Оценочная стоимость места", formatMoney(container.estimated_value, container.value_currency)],
        ["Валюта", container.value_currency || "—"],
    ];
}

function formatMoney(value: number | null, currency: string | null): string {
    if (value == null) return "—";
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ${currency ?? ""}`.trim();
}

function formatNumber(value: number | null, maximumFractionDigits: number): string {
    if (value == null) return "—";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits }).format(value);
}
