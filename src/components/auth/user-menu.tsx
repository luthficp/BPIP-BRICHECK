"use client";

import * as React from "react";
import { Cloud, CloudOff, Loader2, LogOut, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/auth-provider";
import type { SyncSnapshot } from "@/lib/storage/cloud-repository";

/** Teks ringkas status sinkron. Murni agar mudah diuji. */
export function describeSync(s: SyncSnapshot): { label: string; detail: string; tone: "ok" | "busy" | "warn" } {
  if (s.failed.length > 0) {
    return {
      label: `${s.failed.length} ditolak`,
      detail: `Ditolak server: ${s.failed.map((f) => f.message).join("; ")}`,
      tone: "warn",
    };
  }
  switch (s.status) {
    case "syncing":
      return { label: "Menyinkronkan…", detail: "Mengirim/menarik data ke server.", tone: "busy" };
    case "offline":
      return {
        label: s.pending > 0 ? `Offline · ${s.pending} menunggu` : "Offline",
        detail: "Tidak ada koneksi. Perubahan tersimpan di perangkat dan dikirim saat tersambung.",
        tone: "warn",
      };
    case "error":
      return { label: "Server bermasalah", detail: "Akan dicoba lagi otomatis. Perubahan aman di perangkat.", tone: "warn" };
    case "auth":
      return { label: "Sesi berakhir", detail: "Masuk lagi untuk melanjutkan sinkronisasi.", tone: "warn" };
    default:
      return s.pending > 0
        ? { label: `${s.pending} menunggu`, detail: "Perubahan menunggu dikirim ke server.", tone: "busy" }
        : { label: "Tersinkron", detail: "Semua perubahan sudah tersimpan di server.", tone: "ok" };
  }
}

export function UserMenu() {
  const { status, user, sync, signOut, syncNow } = useAuth();
  const [confirm, setConfirm] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (status !== "signed-in" || !user || !sync) return null;
  const info = describeSync(sync);
  const Icon = info.tone === "busy" ? Loader2 : info.tone === "warn" ? CloudOff : Cloud;

  const handleSignOut = async (force: boolean) => {
    setBusy(true);
    try {
      const result = await signOut({ force });
      if (!result.done) setConfirm(result.pending);
      else setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={syncNow}
        title={`${info.detail} (klik untuk sinkronkan sekarang)`}
        aria-label={`Status sinkronisasi: ${info.label}`}
        data-sync-status={sync.status}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className={info.tone === "busy" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        <span className="hidden md:inline">{info.label}</span>
        {info.tone === "warn" && <TriangleAlert className="h-3.5 w-3.5 text-warning md:hidden" />}
      </button>
      <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground lg:inline" title={user.email}>
        {user.email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleSignOut(false)}
        disabled={busy}
        aria-label="Keluar"
      >
        <LogOut />
        <span className="hidden sm:inline">Keluar</span>
      </Button>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Masih ada perubahan yang belum terkirim</DialogTitle>
            <DialogDescription>
              {confirm} perubahan belum berhasil dikirim ke server (mungkin karena tidak ada koneksi). Jika Anda
              keluar sekarang, perubahan itu akan hilang dari perangkat ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Batal, tetap masuk
            </Button>
            <Button variant="destructive" onClick={() => void handleSignOut(true)} disabled={busy}>
              Keluar dan buang perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
