import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";

export function PageShell({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-dvh flex-col bg-gray-50 md:flex-row">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">{children}</main>
        </div>
    );
}
