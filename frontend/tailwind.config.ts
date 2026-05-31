import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
        "./app/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./lib/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#f4f6f8",
                foreground: "#151517",
                card: "rgba(255,255,255,0.72)",
                "card-foreground": "#151517",
                primary: "#18181b",
                "primary-foreground": "#ffffff",
                secondary: "rgba(255,255,255,0.66)",
                "secondary-foreground": "#18181b",
                muted: "rgba(238,240,244,0.72)",
                "muted-foreground": "#6a6d75",
                border: "rgba(16,24,40,0.1)",
                input: "rgba(255,255,255,0.82)",
                ring: "#18181b",
                destructive: "#dc2626",
                "destructive-foreground": "#ffffff",
            },
            borderRadius: {
                xl: "0.875rem",
                "2xl": "1.125rem",
            },
            boxShadow: {
                soft: "0 14px 45px rgba(34, 37, 44, 0.1)",
            },
        },
    },
    plugins: [],
} satisfies Config;
