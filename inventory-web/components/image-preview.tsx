"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ImagePreviewProps = {
    src: string;
    alt?: string;
    className?: string;
    imageClassName?: string;
};

export function ImagePreview({ src, alt = "", className, imageClassName }: ImagePreviewProps) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open]);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    "block h-full w-full overflow-hidden text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    className,
                )}
                aria-label={alt ? `Enlarge ${alt}` : "Enlarge photo"}
            >
                <img
                    src={src}
                    alt={alt}
                    className={cn("h-full w-full object-cover transition-transform hover:scale-105", imageClassName)}
                />
            </button>

            {open && mounted ? createPortal(
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
                    onClick={() => setOpen(false)}
                >
                    <button
                        type="button"
                        aria-label="Close photo preview"
                        onClick={() => setOpen(false)}
                        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-soft transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <div
                        className="absolute inset-0 flex items-center justify-center p-4"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <img
                            src={src}
                            alt={alt}
                            className="h-[calc(100dvh-2rem)] w-[calc(100dvw-2rem)] object-contain"
                        />
                    </div>
                </div>,
                document.body,
            ) : null}
        </>
    );
}
