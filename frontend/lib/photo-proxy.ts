const FORWARDED_REQUEST_HEADERS = ["accept", "if-modified-since", "if-none-match"];
const FORWARDED_RESPONSE_HEADERS = [
    "cache-control",
    "content-length",
    "content-type",
    "etag",
    "last-modified",
    "x-content-type-options",
];

type Fetch = typeof fetch;

export async function proxyPhotoContent(
    request: Request,
    photoId: string,
    options: { apiTarget?: string; fetch?: Fetch } = {},
): Promise<Response> {
    const apiTarget = (options.apiTarget || process.env.API_PROXY_TARGET || "http://localhost:8086").replace(/\/$/, "");
    const fetchPhoto = options.fetch || fetch;
    const requestHeaders = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value) requestHeaders.set(name, value);
    }

    let upstream: Response;
    try {
        upstream = await fetchPhoto(`${apiTarget}/photos/${encodeURIComponent(photoId)}/content`, {
            headers: requestHeaders,
            cache: "no-store",
        });
    } catch {
        return Response.json({ error: "photo service unavailable" }, { status: 502 });
    }

    const responseHeaders = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
    }

    return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
    });
}
