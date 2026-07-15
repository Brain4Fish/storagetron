import test from "node:test";
import assert from "node:assert/strict";

import { proxyPhotoContent } from "../lib/photo-proxy";

test("photo proxy uses the runtime API target and preserves image cache metadata", async () => {
    let upstreamUrl = "";
    let upstreamInit: RequestInit | undefined;
    const request = new Request("https://shelf.test/api/photos/photo-1/content", {
        headers: {
            accept: "image/webp",
            "if-none-match": `"cached-photo"`,
        },
    });

    const response = await proxyPhotoContent(request, "photo/1", {
        apiTarget: "http://storagetron-app-api:8080/",
        fetch: async (input, init) => {
            upstreamUrl = input.toString();
            upstreamInit = init;
            return new Response("image-data", {
                headers: {
                    "cache-control": "public, max-age=31536000, immutable",
                    "content-type": "image/jpeg",
                    etag: `"photo-etag"`,
                    "last-modified": "Wed, 15 Jul 2026 05:30:00 GMT",
                    "x-ignored-header": "not forwarded",
                },
            });
        },
    });

    assert.equal(upstreamUrl, "http://storagetron-app-api:8080/photos/photo%2F1/content");
    assert.equal(new Headers(upstreamInit?.headers).get("accept"), "image/webp");
    assert.equal(new Headers(upstreamInit?.headers).get("if-none-match"), `"cached-photo"`);
    assert.equal(upstreamInit?.cache, "no-store");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "image-data");
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(response.headers.get("etag"), `"photo-etag"`);
    assert.equal(response.headers.get("x-ignored-header"), null);
});

test("photo proxy returns 502 when the runtime API is unavailable", async () => {
    const response = await proxyPhotoContent(new Request("https://shelf.test/image"), "photo-1", {
        apiTarget: "http://api:8080",
        fetch: async () => {
            throw new Error("connection refused");
        },
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "photo service unavailable" });
});
