"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, Home, LayoutDashboard, Plus } from "lucide-react";

import { BriLogo } from "@/components/bri-logo";
import { UserMenu } from "@/components/auth/user-menu";
import { CreateChecklistDialog } from "@/components/dashboard/create-checklist-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import { APP_NAME, APP_TAGLINE, LABEL_TASK_MONITORING } from "@/lib/checklist/config";
import { ROUTE_FAQ, ROUTE_HOME, ROUTE_TASKS } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Navigasi minimal: Home, Task Monitoring, Create Checklist, FAQ, tema. */
export function AppHeader() {
  const pathname = usePathname();
  const { status } = useAuth();
  // Mode Supabase sebelum masuk: tanpa navigasi (hanya tema), supaya tidak ada aksi yang menulis ke penyimpanan lokal.
  const locked = status === "loading" || status === "signed-out";
  const onHome = pathname === ROUTE_HOME;
  const onTasks = pathname === ROUTE_TASKS;
  const onFaq = pathname === ROUTE_FAQ;

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80 print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href={ROUTE_HOME}
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BriLogo />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-wide">{APP_NAME}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">{APP_TAGLINE}</span>
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="ml-auto flex items-center gap-1">
          {!locked && (
            <>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(onHome && "bg-accent text-accent-foreground")}
          >
            <Link href={ROUTE_HOME} aria-current={onHome ? "page" : undefined}>
              <Home />
              <span className="hidden sm:inline">Home</span>
              <span className="sr-only sm:hidden">Home</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(onTasks && "bg-accent text-accent-foreground")}
          >
            <Link href={ROUTE_TASKS} aria-current={onTasks ? "page" : undefined}>
              <LayoutDashboard />
              <span className="hidden sm:inline">{LABEL_TASK_MONITORING}</span>
              <span className="sr-only sm:hidden">{LABEL_TASK_MONITORING}</span>
            </Link>
          </Button>
          <CreateChecklistDialog>
            <Button variant="ghost" size="sm">
              <Plus />
              <span className="hidden sm:inline">Create Checklist</span>
            </Button>
          </CreateChecklistDialog>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(onFaq && "bg-accent text-accent-foreground")}
          >
            <Link href={ROUTE_FAQ} aria-current={onFaq ? "page" : undefined}>
              <CircleHelp />
              <span className="hidden sm:inline">FAQ</span>
              <span className="sr-only sm:hidden">FAQ</span>
            </Link>
          </Button>
            </>
          )}
          <UserMenu />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
