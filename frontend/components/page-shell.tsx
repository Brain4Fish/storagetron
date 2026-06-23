"use client";

import { ReactNode } from "react";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";

export function PageShell({ children }: { children: ReactNode }) {
    return (
        <div className="app-surface flex min-h-dvh bg-background">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-auto px-4 pb-28 pt-5 sm:px-6 md:pb-6 md:pl-72 md:pr-8 md:pt-7">
                <div className="mx-auto max-w-[1500px]">{children}</div>
            </main>
            <MobileNav />
        </div>
    );
}
