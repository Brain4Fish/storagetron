const HOP_BY_HOP_HEADERS = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
];

type Fetch = typeof fetch;
type ProxyRequestInit = RequestInit & { duplex?: "half" };

function apiOrigin(value: string): URL {
    const target = new URL(value);
    if (
        (target.protocol !== "http:" && target.protocol !== "https:") ||
        target.username ||
        target.password ||
        (target.pathname !== "/" && target.pathname !== "") ||
        target.search ||
        target.hash
    ) {
        throw new Error("API_PROXY_TARGET must be an HTTP(S) origin without a path");
    }
    return target;
}

function withoutHopByHopHeaders(source: Headers): Headers {
    const headers = new Headers(source);
    const connectionHeaders = headers.get("connection")
        ?.split(",")
        .map((header) => header.trim())
        .filter(Boolean) || [];

    for (const header of [...HOP_BY_HOP_HEADERS, ...connectionHeaders]) {
        headers.delete(header);
    }
    return headers;
}

export async function proxyApiRequest(
    request: Request,
    options: { apiTarget?: string; fetch?: Fetch } = {},
): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== "/api" && !requestUrl.pathname.startsWith("/api/")) {
        return Response.json({ error: "invalid API proxy path" }, { status: 400 });
    }

    let targetUrl: URL;
    try {
        targetUrl = new URL(
            `${requestUrl.pathname}${requestUrl.search}`,
            apiOrigin(options.apiTarget || process.env.API_PROXY_TARGET || "http://localhost:8086"),
        );
    } catch (error) {
        console.error("Invalid API proxy configuration", error);
        return Response.json({ error: "API proxy is not configured correctly" }, { status: 502 });
    }

    const requestHeaders = withoutHopByHopHeaders(request.headers);
    requestHeaders.delete("host");
    requestHeaders.delete("content-length");
    requestHeaders.set("accept-encoding", "identity");

    const init: ProxyRequestInit = {
        method: request.method,
        headers: requestHeaders,
        redirect: "manual",
        cache: "no-store",
        signal: request.signal,
    };
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
        init.body = request.body;
        init.duplex = "half";
    }

    let upstream: Response;
    try {
        upstream = await (options.fetch || fetch)(targetUrl, init);
    } catch (error) {
        console.error("API proxy request failed", error);
        return Response.json({ error: "API service unavailable" }, { status: 502 });
    }

    const responseHeaders = withoutHopByHopHeaders(upstream.headers);
    const body = request.method === "HEAD" || upstream.status === 204 || upstream.status === 304
        ? null
        : upstream.body;

    return new Response(body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}
