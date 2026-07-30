import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CreateContainerDialog } from "@/components/forms/create-container-dialog";
import { EditRecordDialog } from "@/components/forms/edit-record-dialog";
import { api, Container, Item } from "@/lib/api";

const item: Item = {
    id: "item-1",
    name: "Camera",
    description: "Packed",
    created_at: "2026-07-30T00:00:00Z",
    labels: [],
    quantity: 2,
    category: "Electronics",
    acquisition_year: 2022,
    condition: "used",
    serial_number: "SN-1",
    estimated_value: 1250,
    value_currency: "RUB",
    source_language: "ru",
};

const container: Container = {
    id: "container-1",
    name: "Box",
    description: "Moving box",
    created_at: "2026-07-30T00:00:00Z",
    labels: [],
    inherited_labels: [],
    package_code: "BX-001",
    gross_weight_kg: 12.345,
    volume_m3: 0.1234,
    estimated_value: 2500,
    value_currency: "RUB",
    source_language: "ru",
};

test("container creation submits document fields", async () => {
    vi.spyOn(api, "listLocations").mockResolvedValue([]);
    vi.spyOn(api, "listLabels").mockResolvedValue([]);
    const createContainer = vi.spyOn(api, "createContainer").mockResolvedValue(container);

    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <CreateContainerDialog open onOpenChange={vi.fn()} />
        </QueryClientProvider>,
    );

    await userEvent.type(screen.getByLabelText("Name"), "Box");
    await userEvent.click(screen.getByText("Данные для документов"));
    await userEvent.type(screen.getByLabelText("Номер грузового места"), "BX-001");
    await userEvent.type(screen.getByLabelText("Вес брутто, кг"), "12.345");
    await userEvent.type(screen.getByLabelText("Объём, м³"), "0.1234");
    await userEvent.type(screen.getByLabelText("Оценочная стоимость места"), "2500");
    await userEvent.selectOptions(screen.getByLabelText("Валюта"), "RUB");
    await userEvent.click(screen.getByRole("button", { name: "Create container" }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    expect(createContainer).toHaveBeenCalledWith(expect.objectContaining({
        package_code: "BX-001",
        gross_weight_kg: 12.345,
        volume_m3: 0.1234,
        estimated_value: 2500,
        value_currency: "RUB",
    }));
});

test("item editing can clear nullable document fields", async () => {
    const onSave = vi.fn();
    render(
        <EditRecordDialog
            open
            title="Edit item"
            description="Edit"
            name={item.name}
            details={item.description}
            documentRecord={{ kind: "item", value: item }}
            onOpenChange={vi.fn()}
            onSave={onSave}
        />,
    );

    await userEvent.click(screen.getByText("Данные для документов"));
    await userEvent.clear(screen.getByLabelText("Год приобретения"));
    await userEvent.clear(screen.getByLabelText("Оценочная стоимость"));
    await userEvent.selectOptions(screen.getByLabelText("Валюта"), "");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        quantity: 2,
        acquisition_year: null,
        estimated_value: null,
        value_currency: null,
    }));
});

test("container editing submits changed document fields", async () => {
    const onSave = vi.fn();
    render(
        <EditRecordDialog
            open
            title="Edit container"
            description="Edit"
            name={container.name}
            details={container.description}
            documentRecord={{ kind: "container", value: container }}
            onOpenChange={vi.fn()}
            onSave={onSave}
        />,
    );

    await userEvent.click(screen.getByText("Данные для документов"));
    await userEvent.clear(screen.getByLabelText("Номер грузового места"));
    await userEvent.type(screen.getByLabelText("Номер грузового места"), "BX-002");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        package_code: "BX-002",
        gross_weight_kg: 12.345,
        volume_m3: 0.1234,
        estimated_value: 2500,
        value_currency: "RUB",
    }));
});
