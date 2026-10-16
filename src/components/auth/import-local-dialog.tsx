"use client";

import * as React from "react";
import { toast } from "sonner";

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
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { localStorageRepository } from "@/lib/storage/local-storage-repository";

const flagKey = (userId: string) => `bricheck:import-local:u:${userId}`;

/**
 * Setelah masuk pertama kali, tawarkan memindahkan task yang sebelumnya tersimpan di browser ini
 * (mode lokal) ke akun. Data lokal lama TIDAK dihapus.
 */
export function ImportLocalDialog() {
  const { user, repository } = useAuth();
  const [items, setItems] = React.useState<BankGuaranteeChecklist[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    try {
      if (window.localStorage.getItem(flagKey(user.id)) !== null) return;
      const local = localStorageRepository.readAllSync();
      if (local.length > 0) {
        setItems(local);
        setOpen(true);
      }
    } catch {
      /* storage tidak tersedia: lewati */
    }
  }, [user]);

  if (!user || !repository) return null;

  const mark = () => {
    try {
      window.localStorage.setItem(flagKey(user.id), new Date().toISOString());
    } catch {
      /* abaikan */
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const n = await repository.importItems(items);
      mark();
      setOpen(false);
      toast.success(n > 0 ? `${n} task diimpor ke akun Anda.` : "Semua task sudah ada di akun Anda.");
    } catch {
      toast.error("Impor gagal. Data lokal tidak berubah; coba lagi nanti.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pindahkan task dari browser ini ke akun Anda?</DialogTitle>
          <DialogDescription>
            Ditemukan {items.length} task yang tersimpan di browser ini sebelum Anda masuk. Impor akan menyalinnya
            ke akun {user.email}. Data di browser ini tidak dihapus.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-sm">
          {items.slice(0, 8).map((i) => (
            <li key={i.id} className="truncate">
              {i.taskName || "(tanpa nama)"} — {i.atasNama || "tanpa Atas Nama"}
            </li>
          ))}
          {items.length > 8 && <li>… dan {items.length - 8} lainnya</li>}
        </ul>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              mark();
              setOpen(false);
            }}
            disabled={busy}
          >
            Jangan impor
          </Button>
          <Button onClick={() => void doImport()} disabled={busy}>
            {busy ? "Mengimpor…" : `Impor ${items.length} task`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
