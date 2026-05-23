export function normalizeScanCode(value: string) {
    const code = value.trim();

    try {
        const url = new URL(code);
        const parts = url.pathname.split("/").filter(Boolean);
        const scanIndex = parts.findIndex((part) => ["scan", "items", "kits"].includes(part));

        if (scanIndex >= 0 && parts[scanIndex + 1]) {
            return decodeURIComponent(parts[scanIndex + 1]);
        }
    } catch {
        // Plain inventory codes are not URLs.
    }

    return code;
}
