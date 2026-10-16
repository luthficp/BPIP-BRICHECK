"use client";

import * as React from "react";
import { Lock, PencilLine, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LABEL_MARK_DONE, LABEL_REOPEN } from "@/lib/checklist/config";
import { cn } from "@/lib/utils";

type ReopenPanelProps = {
  /** Dipanggil setelah ADK mengonfirmasi. */
  onReopen: () => void;
  /**
   * "card": area utama pada Summary & Output ("Perlu mengubah checklist?").
   * "banner": pengingat ringkas pada step lain saat checklist berstatus Done.
   */
  variant?: "card" | "banner";
  className?: string;
};

/**
 * Area "Buka Kembali sebagai Draft" untuk task yang sudah Done.
 * Disorot dengan aksen biru (bukan animasi) agar jelas terlihat di mode terang
 * maupun gelap, dan dilengkapi dialog konfirmasi singkat yang menegaskan
 * bahwa seluruh data tetap aman.
 */
export function ReopenPanel({ onReopen, variant = "card", className }: ReopenPanelProps) {
  const [open, setOpen] = React.useState(false);
  const headingId = React.useId();

  const trigger = (
    <Button size={variant === "card" ? "lg" : "default"} onClick={() => setOpen(true)}>
      <RotateCcw />
      {LABEL_REOPEN}
    </Button>
  );

  return (
    <>
      {variant === "card" ? (
        <section
          aria-labelledby={headingId}
          className={cn(
            "flex flex-col gap-4 rounded-lg border-2 border-primary/50 bg-primary-soft p-4 sm:flex-row sm:items-center sm:p-5",
            className,
          )}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <PencilLine className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-base font-semibold">
              Perlu mengubah checklist?
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Buka kembali sebagai Draft agar isian dapat diedit. Seluruh data yang sudah diisi
              tetap tersimpan, dan Anda dapat menekan &quot;{LABEL_MARK_DONE}&quot; lagi setelah
              perubahan selesai.
            </p>
          </div>
          <div className="shrink-0">{trigger}</div>
        </section>
      ) : (
        <section
          aria-labelledby={headingId}
          className={cn(
            "flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
            className,
          )}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 id={headingId} className="text-sm font-semibold">
                Checklist berstatus Done; isian terkunci
              </h3>
              <p className="text-xs text-muted-foreground">
                Perlu mengubah checklist? Buka kembali sebagai Draft. Data yang sudah diisi tetap
                tersimpan.
              </p>
            </div>
          </div>
          <div className="shrink-0">{trigger}</div>
        </section>
      )}

      <ReopenDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => {
          setOpen(false);
          onReopen();
        }}
      />
    </>
  );
}

type ReopenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ReopenDialog({ open, onOpenChange, onConfirm }: ReopenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{LABEL_REOPEN}?</DialogTitle>
          <DialogDescription>
            Status checklist kembali menjadi Draft sehingga isian dapat diedit.{" "}
            <strong className="font-semibold text-foreground">
              Seluruh data yang sudah diisi tetap tersimpan
            </strong>
            ; tidak ada yang dihapus. Setelah selesai mengubah, tandai Done kembali untuk membuka
            pilihan Output.
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            Dokumen yang sudah dicetak atau diekspor sebelumnya tidak lagi mewakili data terbaru.
          </p>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={onConfirm}>
            <RotateCcw />
            Ya, buka kembali
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
