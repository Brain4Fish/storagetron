import { proxyPhotoContent } from "@/lib/photo-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ photo_id: string }> },
) {
    const { photo_id: photoId } = await params;
    return proxyPhotoContent(request, photoId);
}
