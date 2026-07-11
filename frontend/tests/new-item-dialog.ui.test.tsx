import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, test, expect } from "vitest";
import { CreateItemDialog } from "@/components/forms/create-item-dialog";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function renderDialog() {
    vi.spyOn(api, "listLocations").mockResolvedValue([]);
    vi.spyOn(api, "listContainers").mockResolvedValue([]);
    vi.spyOn(api, "listLabels").mockResolvedValue([]);
    return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CreateItemDialog open onOpenChange={vi.fn()} /></QueryClientProvider>);
}

test("standard entry exposes the reference fields and validates the required name", async () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "New Item" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Assisted entry" })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("button", { name: "Create item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required");
    expect(screen.getByLabelText(/Description/)).toHaveAttribute("maxlength", "500");
});

test("assisted mode advances after card creation and warns before closing", async () => {
    vi.spyOn(api, "createItem").mockResolvedValue({ id: "item-1", name: "Camera", created_at: "", labels: [] });
    renderDialog();
    await userEvent.click(screen.getByRole("switch", { name: "Assisted entry" }));
    expect(screen.getByText("Create the item card")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Name/), "Camera");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Take item photos")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Assisted entry" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("already saved");
});

test("assisted optional steps can be skipped and add another resets the guide", async () => {
    vi.spyOn(api, "createItem").mockResolvedValue({ id: "item-2", name: "Camera", created_at: "", labels: [] });
    renderDialog();
    await userEvent.click(screen.getByRole("switch", { name: "Assisted entry" }));
    await userEvent.type(screen.getByLabelText(/Name/), "Camera");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    for (const heading of ["Print the item label", "Attach the label", "Place the item in packaging", "Photograph the packaging", "Choose a container", "Item ready"]) {
        await userEvent.click(await screen.findByRole("button", { name: "Skip" }));
        expect(await screen.findByText(heading)).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: "Add another item" }));
    expect(await screen.findByText("Create the item card")).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveValue("");
    expect(screen.getByRole("switch", { name: "Assisted entry" })).toHaveAttribute("aria-checked", "true");
});

test("photo picker rejects unsupported files before item creation", async () => {
    const view = renderDialog();
    const input = view.container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["gif"], "animated.gif", { type: "image/gif" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("JPG, PNG, HEIC, or HEIF");
    expect(api.createItem).not.toHaveBeenCalled();
});
