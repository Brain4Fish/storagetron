import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SearchableLabelPicker } from "@/components/labels/searchable-label-picker";
import { PrintLabelDialog } from "@/components/print-label-dialog";
import { ItemsTable } from "@/components/table/items-table";

test("searchable labels filter, select, remove, and create inline", async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue({ id: "new", name: "Travel", color: "blue", created_at: "", updated_at: "" });
    const { rerender } = render(<SearchableLabelPicker labels={[{ id: "work", name: "Work", color: "purple", created_at: "", updated_at: "" }]} selectedIds={[]} onChange={onChange} onCreate={onCreate} />);
    await userEvent.type(screen.getByPlaceholderText("Search or create labels..."), "Work");
    await userEvent.click(screen.getByRole("button", { name: /Work/ }));
    expect(onChange).toHaveBeenCalledWith(["work"]);
    rerender(<SearchableLabelPicker labels={[{ id: "work", name: "Work", color: "purple", created_at: "", updated_at: "" }]} selectedIds={["work"]} onChange={onChange} onCreate={onCreate} />);
    await userEvent.clear(screen.getByPlaceholderText("Search or create labels..."));
    await userEvent.type(screen.getByPlaceholderText("Search or create labels..."), "Travel");
    await userEvent.click(screen.getByRole("button", { name: "Add label" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith({ name: "Travel", color: "blue" });
    expect(onChange).toHaveBeenLastCalledWith(["work", "new"]);
});

test("compact add-label action is aligned inside the search input wrapper", () => {
    render(<SearchableLabelPicker compact labels={[]} selectedIds={[]} onChange={vi.fn()} onCreate={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search or create labels...");
    const button = screen.getByRole("button", { name: "Add label" });
    expect(button.parentElement).toBe(input.parentElement);
    expect(button).toHaveClass("absolute", "right-1", "top-1");
});

test("print label reports the print attempt before opening the browser dialog", async () => {
    const onPrint = vi.fn();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<PrintLabelDialog name="Camera" qrValue="https://example.test/scan/item" detail="Shelf" detailLabel="Description" onPrint={onPrint} />);
    await userEvent.click(screen.getByRole("button", { name: "Show print label" }));
    await userEvent.click(await screen.findByRole("button", { name: "Print label" }));
    expect(onPrint).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
});

test("desktop item metadata columns stay on one line", () => {
    const item = { id: "item-1", name: "Camera", created_at: "2026-07-12T00:00:00Z", labels: [] };
    const view = render(<ItemsTable rows={[{ item, locationLabel: "No location", containerLabel: "No container", status: "loose", searchText: "camera" }]} selectedItemIds={new Set()} onToggleItem={vi.fn()} onToggleItems={vi.fn()} />);
    const table = view.container.querySelector("table");
    expect(table).toHaveClass("min-w-[1120px]");
    const cells = Array.from(table?.querySelectorAll("td") ?? []);
    expect(cells.find((cell) => cell.textContent === "No location")).toHaveClass("whitespace-nowrap");
    expect(cells.find((cell) => cell.textContent === "No container")).toHaveClass("whitespace-nowrap");
    expect(cells.find((cell) => cell.textContent?.includes("Jul 12, 2026"))).toHaveClass("whitespace-nowrap");
    expect(table?.querySelector(".status-pill")).toHaveClass("whitespace-nowrap");
});

test("item thumbnails use stable optimized photo URLs at responsive display sizes", () => {
    const item = {
        id: "item-photo",
        name: "Camera",
        created_at: "2026-07-12T00:00:00Z",
        labels: [],
        photos: [{
            id: "photo-1",
            url: "https://storage.test/legacy-signed-photo",
            content_url: "/api/photos/photo-1/content",
        }],
    };
    const view = render(<ItemsTable rows={[{ item, locationLabel: "No location", containerLabel: "No container", status: "loose", searchText: "camera" }]} selectedItemIds={new Set()} onToggleItem={vi.fn()} onToggleItems={vi.fn()} />);

    const images = Array.from(view.container.querySelectorAll("img"));
    expect(images).toHaveLength(2);
    expect(images.every((image) => image.getAttribute("src")?.startsWith("/_next/image?"))).toBe(true);
    expect(images.every((image) => image.getAttribute("src")?.includes(encodeURIComponent("/api/photos/photo-1/content")))).toBe(true);
    expect(images.some((image) => image.getAttribute("sizes") === "116px")).toBe(true);
    expect(images.some((image) => image.getAttribute("sizes") === "48px")).toBe(true);
});
