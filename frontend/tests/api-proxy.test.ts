import test from "node:test";
import assert from "node:assert/strict";

import { proxyApiRequest } from "../lib/api-proxy";

test("API proxy preserves the /api path, query, validators, and cache metadata", async () => {
    let upstreamUrl = "";
    let upstreamInit: RequestInit | undefined;
    const request = new Request("https://shelf.test/api/photos/photo%2F1/content?download=1", {
        headers: {
            accept: "image/webp",
            connection: "x-remove-me",
            "if-modified-since": "Wed, 15 Jul 2026 05:30:00 GMT",
            "if-none-match": `"cached-photo"`,
            "x-remove-me": "true",
        },
    });

    const response = await proxyApiRequest(request, {
        apiTarget: "http://storagetron-app-api:8080",
        fetch: async (input, init) => {
            upstreamUrl = input.toString();
            upstreamInit = init;
            return new Response("image-data", {
                headers: {
                    "cache-control": "public, max-age=31536000, immutable",
                    "content-length": "10",
                    "content-type": "image/jpeg",
                    connection: "x-upstream-only",
                    etag: `"photo-etag"`,
                    "last-modified": "Wed, 15 Jul 2026 05:30:00 GMT",
                    "x-upstream-only": "true",
                },
            });
        },
    });

    assert.equal(upstreamUrl, "http://storagetron-app-api:8080/api/photos/photo%2F1/content?download=1");
    const sentHeaders = new Headers(upstreamInit?.headers);
    assert.equal(sentHeaders.get("accept"), "image/webp");
    assert.equal(sentHeaders.get("if-none-match"), `"cached-photo"`);
    assert.equal(sentHeaders.get("if-modified-since"), "Wed, 15 Jul 2026 05:30:00 GMT");
    assert.equal(sentHeaders.get("accept-encoding"), "identity");
    assert.equal(sentHeaders.get("connection"), null);
    assert.equal(sentHeaders.get("x-remove-me"), null);
    assert.equal(upstreamInit?.cache, "no-store");
    assert.equal(upstreamInit?.redirect, "manual");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "image-data");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(response.headers.get("content-length"), "10");
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("etag"), `"photo-etag"`);
    assert.equal(response.headers.get("connection"), null);
    assert.equal(response.headers.get("x-upstream-only"), null);
});

test("API proxy forwards all supported methods and streams request bodies", async () => {
    const calls: Array<{ method: string; body: string }> = [];
    const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

    for (const method of methods) {
        const hasBody = !["GET", "HEAD", "OPTIONS"].includes(method);
        const response = await proxyApiRequest(new Request("https://shelf.test/api/items/item-1", {
            method,
            body: hasBody ? JSON.stringify({ method }) : undefined,
            headers: hasBody ? { "content-type": "application/json" } : undefined,
        }), {
            apiTarget: "http://api:8080",
            fetch: async (_input, init) => {
                calls.push({
                    method: init?.method || "",
                    body: init?.body ? await new Response(init.body).text() : "",
                });
                return method === "HEAD" || method === "OPTIONS"
                    ? new Response(null, { status: 204 })
                    : Response.json({ ok: true });
            },
        });
        assert.equal(response.ok, true);
    }

    assert.deepEqual(calls.map((call) => call.method), methods);
    assert.equal(calls.find((call) => call.method === "POST")?.body, JSON.stringify({ method: "POST" }));
    assert.equal(calls.find((call) => call.method === "PATCH")?.body, JSON.stringify({ method: "PATCH" }));
    assert.equal(calls.find((call) => call.method === "GET")?.body, "");
});

test("API proxy preserves conditional 304 and empty 204 responses", async () => {
    for (const status of [204, 304]) {
        const response = await proxyApiRequest(new Request("https://shelf.test/api/photos/photo-1/content"), {
            apiTarget: "http://api:8080",
            fetch: async () => new Response(null, {
                status,
                headers: status === 304 ? { etag: `"photo-etag"` } : undefined,
            }),
        });

        assert.equal(response.status, status);
        assert.equal(await response.text(), "");
        if (status === 304) assert.equal(response.headers.get("etag"), `"photo-etag"`);
    }
});

test("API proxy rejects invalid configuration and reports unavailable upstreams", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        const invalid = await proxyApiRequest(new Request("https://shelf.test/api/version"), {
            apiTarget: "http://api:8080/base-path",
        });
        assert.equal(invalid.status, 502);
        assert.deepEqual(await invalid.json(), { error: "API proxy is not configured correctly" });

        const unavailable = await proxyApiRequest(new Request("https://shelf.test/api/version"), {
            apiTarget: "http://api:8080",
            fetch: async () => {
                throw new Error("connection refused");
            },
        });
        assert.equal(unavailable.status, 502);
        assert.deepEqual(await unavailable.json(), { error: "API service unavailable" });
    } finally {
        console.error = originalConsoleError;
    }
});

test("API proxy rejects paths outside the canonical /api prefix", async () => {
    const response = await proxyApiRequest(new Request("https://shelf.test/media/photos/photo-1/content"));
    assert.equal(response.status, 400);
});
