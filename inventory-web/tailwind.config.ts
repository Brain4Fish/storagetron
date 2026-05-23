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
                background: "#f6f7f9",
                foreground: "#111111",
                card: "#ffffff",
                "card-foreground": "#111111",
                primary: "#111111",
                "primary-foreground": "#ffffff",
                secondary: "#f1f1ee",
                "secondary-foreground": "#111111",
                muted: "#efefe9",
                "muted-foreground": "#666666",
                border: "#e6e6df",
                input: "#ffffff",
                ring: "#111111",
                destructive: "#dc2626",
                "destructive-foreground": "#ffffff",
            },
            borderRadius: {
                xl: "1rem",
                "2xl": "1.25rem",
            },
            boxShadow: {
                soft: "0 8px 30px rgba(0,0,0,0.06)",
            },
        },
    },
    plugins: [],
} satisfies Config;