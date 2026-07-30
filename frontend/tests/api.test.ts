import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, api, photoContentUrl } from "../lib/api";

test("photoContentUrl prefers stable content URLs and falls back to legacy signed URLs", () => {
    assert.equal(photoContentUrl({ content_url: "/api/photos/photo-1/content", url: "https://storage/signed" }), "/api/photos/photo-1/content");
    assert.equal(photoContentUrl({ content_url: "https://api.test/photos/photo-1/content", url: "https://storage/signed" }), "https://api.test/photos/photo-1/content");
    assert.equal(photoContentUrl({ url: "https://storage/legacy-signed" }), "https://storage/legacy-signed");
});

test("api.scanCode normalizes URLs and encodes extracted scan code", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return Response.json({ type: "item", item: { id: "item-1", name: "Laptop", created_at: "2026-06-12T00:00:00Z" } });
    };

    const result = await api.scanCode(" https://inventory.test/scan/ITEM%2F001 ");

    assert.equal(result.type, "item");
    assert.equal(calls[0].input, "/api/scan/ITEM%2F001");
    assert.equal(calls[0].init?.headers?.["Content-Type" as keyof HeadersInit], "application/json");
});

test("api methods return undefined for 204 responses", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return new Response(null, { status: 204 });
    };

    await assert.doesNotReject(async () => {
        assert.equal(await api.deleteItem("item-1"), undefined);
        assert.equal(await api.deleteContainer("kit-1"), undefined);
    });

    assert.equal(calls[0].input, "/api/items/item-1");
    assert.equal(calls[0].init?.method, "DELETE");
    assert.equal(calls[1].input, "/api/containers/kit-1");
    assert.equal(calls[1].init?.method, "DELETE");
});

test("label attachment methods use idempotent PUT and matching DELETE routes", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return new Response(null, { status: 204 });
    };

    await api.attachItemLabel("item-1", "label-1");
    await api.detachContainerLabel("container-1", "label-2");

    assert.equal(calls[0].input, "/api/items/item-1/labels/label-1");
    assert.equal(calls[0].init?.method, "PUT");
    assert.equal(calls[1].input, "/api/containers/container-1/labels/label-2");
    assert.equal(calls[1].init?.method, "DELETE");
});

test("inventory API serializes document fields and explicit nullable clears", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return Response.json({});
    };

    await api.createItem({
        name: "Camera",
        quantity: 2,
        condition: "used",
        estimated_value: 1250.5,
        value_currency: "RUB",
    });
    await api.updateContainer("container-1", {
        name: "Box",
        gross_weight_kg: null,
        volume_m3: null,
        estimated_value: null,
        value_currency: null,
    });

    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
        name: "Camera",
        quantity: 2,
        condition: "used",
        estimated_value: 1250.5,
        value_currency: "RUB",
    });
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
        name: "Box",
        gross_weight_kg: null,
        volume_m3: null,
        estimated_value: null,
        value_currency: null,
    });
});

test("api methods surface JSON error messages with status code", async () => {
    global.fetch = async () => Response.json({ error: "item not found" }, { status: 404 });

    await assert.rejects(
        () => api.getItem("missing"),
        (error) => error instanceof ApiError && error.status === 404 && error.message === "item not found",
    );
});

test("api methods convert abort errors into request timeout ApiError", async () => {
    global.fetch = async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
    };

    await assert.rejects(
        () => api.getVersion(),
        (error) => error instanceof ApiError && error.status === 0 && error.message === "Request timeout",
    );
});

test("documentation API creates and lists reports with the expected wire format", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        if (init?.method === "POST") {
            return Response.json({
                id: "report-1",
                filename: "report.xlsx",
                format: "xlsx",
                language: "ru",
                scope_type: "location",
                scope_summary: { location_name: "Дом", containers_count: 2 },
                transport_order_number: "",
                content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                size_bytes: 12,
                created_at: "2026-07-30T12:00:00Z",
                download_url: "/documentation/reports/report-1/download",
            }, { status: 201 });
        }
        return Response.json([]);
    };

    const request = {
        scope: { type: "location" as const, location_id: "location-1" },
        format: "xlsx" as const,
        language: "ru" as const,
        summary: {
            owner_name: "Иван Иванов",
            carrier: "Перевозчик",
            transport_order_number: "",
            origin_country: "Россия",
            origin_address: "Москва",
            destination_country: "Казахстан",
            destination_address: "Алматы",
            shipment_date: "2026-08-01",
        },
    };

    const created = await api.createDocumentationReport(request);
    const listed = await api.listDocumentationReports();

    assert.equal(created.scope_summary.location_name, "Дом");
    assert.deepEqual(listed, []);
    assert.equal(calls[0].input, "/api/documentation/reports");
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), request);
    assert.equal(calls[1].input, "/api/documentation/reports");
});

test("documentation downloads parse encoded, quoted, and fallback filenames", async () => {
    const responses = [
        new Response("xlsx", {
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": "attachment; filename*=UTF-8''%D0%9E%D1%82%D1%87%D1%91%D1%82.xlsx",
            },
        }),
        new Response("pdf", {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": "attachment; filename=\"moving-report.pdf\"",
            },
        }),
        new Response("plain", {
            headers: {
                "Content-Disposition": "attachment; filename=plain-report.xlsx",
            },
        }),
        new Response("fallback"),
    ];
    const calls: Array<RequestInfo | URL> = [];
    global.fetch = async (input: RequestInfo | URL) => {
        calls.push(input);
        const response = responses.shift();
        assert.ok(response);
        return response;
    };

    const encoded = await api.downloadDocumentationReport("report/1", "ignored.xlsx");
    const quoted = await api.downloadDocumentationReport("report-2", "ignored.pdf");
    const plain = await api.downloadDocumentationReport("report-3", "ignored.xlsx");
    const fallback = await api.downloadDocumentationReport("report-4", "../unsafe/report.xlsx");

    assert.equal(calls[0], "/api/documentation/reports/report%2F1/download");
    assert.equal(encoded.filename, "Отчёт.xlsx");
    assert.equal(await encoded.blob.text(), "xlsx");
    assert.equal(quoted.filename, "moving-report.pdf");
    assert.equal(quoted.contentType, "application/pdf");
    assert.equal(plain.filename, "plain-report.xlsx");
    assert.equal(fallback.filename, "..-unsafe-report.xlsx");
});

test("documentation download surfaces backend JSON errors", async () => {
    global.fetch = async () => Response.json(
        { error: "documentation report not found" },
        { status: 404 },
    );

    await assert.rejects(
        () => api.downloadDocumentationReport("missing"),
        (error) => error instanceof ApiError
            && error.status === 404
            && error.message === "documentation report not found",
    );
});
