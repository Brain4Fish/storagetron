import React, { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { api, Container, Item } from "@/lib/api";
import ItemsPage from "@/app/items/page";
import KitsPage from "@/app/kits/page";

vi.mock("next/navigation", () => ({
    usePathname: () => "/items",
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/page-shell", () => ({
    PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/forms/create-item-dialog", () => ({
    CreateItemDialog: () => null,
}));

vi.mock("@/components/forms/create-container-dialog", () => ({
    CreateContainerDialog: () => null,
}));

function renderPage(page: ReactNode) {
    return render(
        <QueryClientProvider
            client={new QueryClient({
                defaultOptions: {
                    queries: { retry: false },
                    mutations: { retry: false },
                },
            })}
        >
            {page}
        </QueryClientProvider>,
    );
}

function item(id: string, name: string): Item {
    return { id, name, created_at: "2026-07-16T00:00:00Z", labels: [] };
}

function container(id: string, name: string): Container {
    return {
        id,
        name,
        created_at: "2026-07-16T00:00:00Z",
        labels: [],
        inherited_labels: [],
    };
}

function expectSelectionActionOrder() {
    const actions = ["Select all", "Clear selection", "Download XLSX", "Delete"];
    const buttons = actions.map((name) => screen.getByRole("button", { name }));
    buttons.slice(1).forEach((button, index) => {
        expect(button.compareDocumentPosition(buttons[index]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });
}

test("items select all filtered results across pages and preserve prior selection", async () => {
    const items = [
        item("archive", "Archive"),
        item("spare", "Spare parts"),
        ...Array.from({ length: 21 }, (_, index) => item(`camera-${index + 1}`, `Camera ${index + 1}`)),
    ];
    vi.spyOn(api, "listItems").mockResolvedValue(items);
    vi.spyOn(api, "listContainers").mockResolvedValue([]);
    vi.spyOn(api, "listLabels").mockResolvedValue([]);

    renderPage(<ItemsPage />);

    expect(await screen.findByText("23 items")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("checkbox", { name: "Select Archive" })[0]);
    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download XLSX" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
    expectSelectionActionOrder();

    const search = screen.getByPlaceholderText("Search items, containers, locations, or labels...");
    await userEvent.type(search, "Camera");
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(screen.getByText("22 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    await userEvent.clear(search);
    screen.getAllByRole("checkbox", { name: "Select Spare parts" }).forEach((checkbox) => {
        expect(checkbox).not.toBeChecked();
    });
});

test("containers select all filtered results and preserve prior selection", async () => {
    vi.spyOn(api, "listContainers").mockResolvedValue([
        container("archive", "Archive"),
        container("camera-a", "Camera box A"),
        container("camera-b", "Camera box B"),
        container("spare", "Spare parts"),
    ]);

    renderPage(<KitsPage />);

    expect(await screen.findByText("4 containers")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("checkbox", { name: "Select Archive" })[0]);
    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download XLSX" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
    expectSelectionActionOrder();

    const search = screen.getByPlaceholderText("Search containers or labels...");
    await userEvent.type(search, "Camera");
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    await userEvent.clear(search);
    screen.getAllByRole("checkbox", { name: "Select Spare parts" }).forEach((checkbox) => {
        expect(checkbox).not.toBeChecked();
    });
});
