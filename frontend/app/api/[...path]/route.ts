import { proxyApiRequest } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request) {
    return proxyApiRequest(request);
}

export {
    handle as DELETE,
    handle as GET,
    handle as HEAD,
    handle as OPTIONS,
    handle as PATCH,
    handle as POST,
    handle as PUT,
};
