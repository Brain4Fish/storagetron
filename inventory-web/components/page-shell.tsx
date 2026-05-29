"use client";

import { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "storagetron:sidebar-collapsed";

export function PageShell({ children }: { children: ReactNode }) {
    const [sidebarHidden, setSidebarHidden] = useState(false);

    useEffect(() => {
        setSidebarHidden(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true");
    }, []);

    const hideSidebar = () => {
        setSidebarHidden(true);
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    };

    const showSidebar = () => {
        setSidebarHidden(false);
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "false");
    };

    return (
        <div className="app-surface flex min-h-dvh flex-col md:flex-row">
            {sidebarHidden ? (
                <Button
                    variant="outline"
                    size="icon"
                    onClick={showSidebar}
                    className="fixed left-3 top-3 z-30 h-9 w-9 shadow-soft"
                    aria-label="Show sidebar"
                    title="Show sidebar"
                >
                    <PanelLeftOpen className="h-4 w-4" />
                </Button>
            ) : (
                <Sidebar onHide={hideSidebar} />
            )}
            <main
                className={cn(
                    "min-w-0 flex-1 overflow-auto px-3 py-3 sm:px-4 md:px-5",
                    sidebarHidden && "pl-14 sm:pl-16 md:pl-16",
                )}
            >
                <div className="mx-auto max-w-7xl">{children}</div>
            </main>
        </div>
    );
}
