"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-provider";

import { ImportLocalDialog } from "./import-local-dialog";
import { LoginCard } from "./login-card";

/**
 * Mode lokal (Supabase tidak dikonfigurasi): konten apa adanya.
 * Mode Supabase: konten hanya tampil setelah masuk; sebelum itu halaman masuk.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "local") return <>{children}</>;
  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-10 sm:px-6" aria-busy="true" aria-label="Memuat sesi">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (status === "signed-out") return <LoginCard />;
  return (
    <>
      {children}
      <ImportLocalDialog />
    </>
  );
}
