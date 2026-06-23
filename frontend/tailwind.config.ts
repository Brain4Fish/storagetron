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
                background: "#f5f6f8",
                foreground: "#0b0b0f",
                card: "#ffffff",
                "card-foreground": "#0b0b0f",
                primary: "#3157f6",
                "primary-foreground": "#ffffff",
                secondary: "#f3f5fa",
                "secondary-foreground": "#111827",
                muted: "#f2f4f8",
                "muted-foreground": "#667085",
                border: "#e4e7ec",
                input: "#ffffff",
                ring: "#3157f6",
                destructive: "#dc2626",
                "destructive-foreground": "#ffffff",
            },
            borderRadius: {
                xl: "0.75rem",
                "2xl": "1rem",
            },
            boxShadow: {
                soft: "0 16px 45px rgba(15, 23, 42, 0.06)",
            },
        },
    },
    plugins: [],
} satisfies Config;
