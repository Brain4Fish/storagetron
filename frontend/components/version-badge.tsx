"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const webVersion = process.env.NEXT_PUBLIC_WEB_VERSION || "dev";
const webCommit = process.env.NEXT_PUBLIC_WEB_COMMIT || "unknown";

function shortCommit(value: string) {
    return value === "unknown" ? value : value.slice(0, 7);
}

export function VersionBadge() {
    const { data, isLoading } = useQuery({
        queryKey: ["version"],
        queryFn: api.getVersion,
        retry: false,
    });

    return (
        <div className="space-y-1 text-xs text-gray-400">
            <div>Inventory System</div>
            <div>Web v{webVersion} · {shortCommit(webCommit)}</div>
            <div title={data?.date && data.date !== "unknown" ? `Built ${data.date}` : undefined}>
                Backend{" "}
                {isLoading
                    ? "checking..."
                    : data
                      ? `v${data.version} · ${shortCommit(data.commit)}`
                      : "unavailable"}
            </div>
        </div>
    );
}
