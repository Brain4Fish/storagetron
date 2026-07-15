import type { NextConfig } from "next";

const apiProxyTarget = process.env.API_PROXY_TARGET || "http://localhost:8086";

const nextConfig: NextConfig = {
    images: {
        minimumCacheTTL: 31536000,
        remotePatterns: [
            {
                protocol: "http",
                hostname: "**",
            },
            {
                protocol: "https",
                hostname: "**",
            },
        ],
    },
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${apiProxyTarget}/:path*`,
            },
        ];
    },
};

export default nextConfig;
