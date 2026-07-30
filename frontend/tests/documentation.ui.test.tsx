import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import DocumentationPage from "@/app/documentation/page";
import { Sidebar } from "@/components/layout/sidebar";
import { api, ApiError, Container, DocumentationReport } from "@/lib/api";

const navigation = vi.hoisted(() => ({ pathname: "/documentation" }));

vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
}));

vi.mock("@/components/page-shell", () => ({
    PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/version-badge", () => ({
    VersionBadge: () => null,
}));

vi.mock("next/image", () => ({
    default: () => <span data-testid="mock-image" />,
}));

const location = {
    id: "location-1",
    name: "Home",
    country: "Россия",
    city: "Москва",
    room: "Кладовая",
};

const report: DocumentationReport = {
    id: "report-1",
    filename: "documentation-report-1.xlsx",
    format: "xlsx",
    language: "ru",
    scope_type: "location",
    scope_summary: { location_name: "Home", containers_count: 2 },
    transport_order_number: "",
    content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size_bytes: 2048,
    created_at: "2026-07-30T12:00:00Z",
    download_url: "/documentation/reports/report-1/download",
};

function container(id: string, name: string, labelName: string): Container {
    return {
        id,
        name,
        package_code: `PKG-${id}`,
        gross_weight_kg: null,
        volume_m3: null,
        estimated_value: null,
        value_currency: null,
        source_language: "ru",
        location,
        created_at: "2026-07-30T12:00:00Z",
        items_count: id === "one" ? 3 : 5,
        labels: [{
            id: labelName.toLowerCase(),
            name: labelName,
            color: "blue",
            created_at: "",
            updated_at: "",
        }],
        inherited_labels: [],
    };
}

function renderPage({
    reports = [],
    containers = [],
    preserveReportsMock = false,
}: {
    reports?: DocumentationReport[];
    containers?: Container[];
    preserveReportsMock?: boolean;
} = {}) {
    vi.spyOn(api, "listLocations").mockResolvedValue([location]);
    vi.spyOn(api, "listContainers").mockResolvedValue(containers);
    if (!preserveReportsMock) {
        vi.spyOn(api, "listDocumentationReports").mockResolvedValue(reports);
    }

    return render(
        <QueryClientProvider client={new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        })}>
            <DocumentationPage />
        </QueryClientProvider>,
    );
}

async function fillRequiredSummary() {
    await userEvent.type(screen.getByLabelText("ФИО владельца"), "Иван Иванов");
    await userEvent.type(screen.getByLabelText("Перевозчик"), "ТК");
    await userEvent.type(screen.getByLabelText("Адрес отправления"), "Москва");
    await userEvent.type(screen.getByLabelText("Адрес назначения"), "Алматы");
    await userEvent.type(screen.getByLabelText("Дата отправки"), "2026-08-01");
}

test("sidebar exposes an active Documentation link", () => {
    navigation.pathname = "/documentation/archive";
    render(<Sidebar />);

    const link = screen.getByRole("link", { name: "Documentation" });
    expect(link).toHaveAttribute("href", "/documentation");
    expect(link).toHaveClass("bg-indigo-50", "text-primary");
});

test("documentation form uses the requested defaults and keeps order number optional", async () => {
    renderPage();

    expect(screen.getByLabelText("Страна отправления")).toHaveValue("Россия");
    expect(screen.getByLabelText("Страна назначения")).toHaveValue("Казахстан");
    expect(screen.getByLabelText("Формат")).toHaveValue("xlsx");
    expect(screen.getByLabelText("Язык")).toHaveValue("ru");
    expect(screen.getByLabelText("Номер заказа транспортной компании")).not.toBeRequired();
    expect(screen.getByText("Если оставить поле пустым, в отчёте останется место для ручного заполнения.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "По локации" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Сформировать отчёт" })).toBeDisabled();

    await waitFor(() => expect(screen.getByLabelText("Локация")).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText("Локация"), "location-1");
    await userEvent.click(screen.getByRole("button", { name: "По коробкам" }));
    expect(screen.getByRole("button", { name: "Сформировать отчёт" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "По локации" }));
    expect(screen.getByLabelText("Локация")).toHaveValue("location-1");
    expect(screen.getByRole("button", { name: "Сформировать отчёт" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Сформировать отчёт" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Укажите ФИО владельца");
});

test("container scope supports filtering, multiple selection, select all filtered, and clear", async () => {
    const addItem = vi.spyOn(api, "addItemToContainer");
    renderPage({
        containers: [
            container("one", "Первая коробка", "Хрупкое"),
            container("two", "Вторая коробка", "Архив"),
        ],
    });

    await userEvent.click(screen.getByRole("button", { name: "По коробкам" }));
    expect(screen.getByRole("button", { name: "Сформировать отчёт" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Выбрать коробки" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Хрупкое" }));
    expect(screen.getByRole("button", { name: "Выбрать Первая коробка" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Вторая коробка/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Выбрать Первая коробка" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all filtered" }));
    expect(screen.getByText(/Выбрано:/)).toHaveTextContent("2");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText(/Выбрано:/)).toHaveTextContent("0");
    await userEvent.click(screen.getByRole("button", { name: "Выбрать Первая коробка" }));
    await userEvent.click(screen.getByRole("button", { name: "Выбрать Вторая коробка" }));
    await userEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.getByText("2 коробки")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сформировать отчёт" })).toBeEnabled();
    expect(addItem).not.toHaveBeenCalled();
});

test("successful generation keeps summary defaults, clears scope, and refreshes history", async () => {
    const listReports = vi.spyOn(api, "listDocumentationReports")
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([report]);
    const createReport = vi.spyOn(api, "createDocumentationReport").mockResolvedValue(report);
    renderPage({ preserveReportsMock: true });

    await fillRequiredSummary();
    await waitFor(() => expect(screen.getByLabelText("Локация")).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText("Локация"), "location-1");
    await userEvent.click(screen.getByRole("button", { name: "Сформировать отчёт" }));

    await waitFor(() => expect(createReport).toHaveBeenCalled());
    expect(createReport).toHaveBeenCalledWith(expect.objectContaining({
        scope: { type: "location", location_id: "location-1" },
        format: "xlsx",
        language: "ru",
        summary: expect.objectContaining({
            owner_name: "Иван Иванов",
            transport_order_number: "",
            origin_country: "Россия",
            destination_country: "Казахстан",
        }),
    }));
    expect(await screen.findByText("Отчёт сформирован")).toBeInTheDocument();
    await waitFor(() => expect(listReports).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "Ранее сформированные отчёты" })).toBeInTheDocument();
    expect(screen.getByLabelText("ФИО владельца")).toHaveValue("Иван Иванов");
    expect(screen.getByLabelText("Страна отправления")).toHaveValue("Россия");
    expect(screen.getByLabelText("Локация")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Сформировать отчёт" })).toBeDisabled();
});

test("empty history renders no section, table, or empty state", async () => {
    renderPage();
    await waitFor(() => expect(api.listDocumentationReports).toHaveBeenCalled());

    expect(screen.queryByRole("heading", { name: "Ранее сформированные отчёты" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/отчётов пока нет/i)).not.toBeInTheDocument();
});

test("history downloads through the API and uses the returned blob", async () => {
    const containerReport: DocumentationReport = {
        ...report,
        scope_type: "containers",
        scope_summary: { containers_count: 2 },
    };
    const download = vi.spyOn(api, "downloadDocumentationReport").mockResolvedValue({
        blob: new Blob(["file"]),
        filename: "server-report.xlsx",
        contentType: "application/octet-stream",
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage({ reports: [containerReport] });

    const table = await screen.findByRole("table");
    expect(within(table).getByText("2 коробки")).toBeInTheDocument();
    await userEvent.click(within(table).getByRole("button", { name: `Скачать ${report.filename}` }));

    await waitFor(() => expect(download).toHaveBeenCalledWith(report.id, report.filename));
    expect(click).toHaveBeenCalledOnce();
});

test("server validation error keeps the selected scope and form values", async () => {
    vi.spyOn(api, "createDocumentationReport").mockRejectedValue(
        new ApiError(404, "documentation scope not found"),
    );
    renderPage();

    await fillRequiredSummary();
    await waitFor(() => expect(screen.getByLabelText("Локация")).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText("Локация"), "location-1");
    await userEvent.click(screen.getByRole("button", { name: "Сформировать отчёт" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("больше не существует");
    expect(screen.getByLabelText("Локация")).toHaveValue("location-1");
    expect(screen.getByLabelText("ФИО владельца")).toHaveValue("Иван Иванов");
});

test("history load error is non-destructive and offers retry", async () => {
    vi.spyOn(api, "listDocumentationReports").mockRejectedValue(new ApiError(500, "failed"));
    renderPage({ preserveReportsMock: true });

    expect(await screen.findByText("Не удалось загрузить список отчётов.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сформировать отчёт" })).toBeInTheDocument();
});
