"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2, X } from "lucide-react";
import { photoContentUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type Photo = {
    id: string;
    url: string;
    content_url?: string;
};

export function ItemPhotos({
                               photos,
                               onDelete,
                               deletingPhotoId,
                               variant = "default",
                           }: {
    photos?: Photo[];
    onDelete?: (photoId: string) => void;
    deletingPhotoId?: string;
    variant?: "default" | "compact";
}) {
    const [selected, setSelected] = useState<string | null>(null);

    if (!photos || photos.length === 0) {
        return <p className="text-sm text-gray-400">No photos</p>;
    }

    return (
        <>
            {/* Grid */}
            <div className={cn(
                "grid gap-4",
                variant === "compact" ? "grid-cols-3 gap-2" : "grid-cols-2 md:grid-cols-3",
            )}>
                {photos.map((p) => (
                    <div key={p.id} className="group relative">
                        <button
                            type="button"
                            aria-label="View photo"
                            onClick={() => setSelected(photoContentUrl(p))}
                            className={cn(
                                "relative block aspect-square w-full overflow-hidden rounded-lg transition hover:opacity-90",
                                variant === "compact" && "h-20 w-20",
                            )}
                        >
                            <Image src={photoContentUrl(p)} alt="" fill sizes={variant === "compact" ? "80px" : "(min-width: 768px) 33vw, 50vw"} className="object-cover" />
                        </button>
                        {onDelete ? (
                            <button
                                type="button"
                                aria-label="Remove photo"
                                disabled={deletingPhotoId === p.id}
                                onClick={() => onDelete(p.id)}
                                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-destructive opacity-0 shadow-sm transition hover:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-70"
                            >
                                {deletingPhotoId === p.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <X className="h-4 w-4" />
                                )}
                            </button>
                        ) : null}
                    </div>
                ))}
            </div>

            {/* Modal */}
            {selected && (
                <div
                    onClick={() => setSelected(null)}
                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
                >
                    <div className="relative h-[90%] w-[90%]">
                        <Image src={selected} alt="Selected item photo" fill sizes="90vw" className="rounded-lg object-contain" />
                    </div>
                </div>
            )}
        </>
    );
}
