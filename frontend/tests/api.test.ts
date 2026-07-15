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
