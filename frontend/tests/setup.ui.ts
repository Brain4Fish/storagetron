import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:preview" });
Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
