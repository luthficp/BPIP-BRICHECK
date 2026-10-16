"use client";

import * as React from "react";
import { FileDown, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { PreviewDialog } from "@/components/export/preview-dialog";
import { Button } from "@/components/ui/button";
import { LABEL_EXPORT_WORD } from "@/lib/checklist/config";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";

type ExportActionsProps = {
  checklist: BankGuaranteeChecklist;
  onPrint: () => void;
};

type Busy = "pdf" | "word" | null;

/** Pilihan output setelah checklist Done: PDF, Word, Print (+ pratinjau). */
export function ExportActions({ checklist, onPrint }: ExportActionsProps) {
  const [busy, setBusy] = React.useState<Busy>(null);

  const run = async (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    try {
      // Library besar dimuat saat dibutuhkan saja.
      const filename =
        kind === "pdf"
          ? await (await import("@/lib/export/pdf")).exportChecklistPdf(checklist)
          : await (await import("@/lib/export/docx")).exportChecklistDocx(checklist);
      toast.success(kind === "pdf" ? "PDF berhasil dibuat" : "Word berhasil dibuat", {
        description: filename,
      });
    } catch (error) {
      console.error(error);
      toast.error(kind === "pdf" ? "PDF gagal dibuat" : "Word gagal dibuat", {
        description:
          kind === "pdf"
            ? "Coba lagi, atau gunakan Print lalu pilih Save as PDF."
            : "Coba lagi. Bila berulang, hubungi administrator aplikasi.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Pilihan output">
      <Button onClick={() => run("pdf")} disabled={busy !== null}>
        {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />}
        Export PDF
      </Button>
      <Button variant="outline" onClick={() => run("word")} disabled={busy !== null}>
        {busy === "word" ? <Loader2 className="animate-spin" /> : <FileText />}
        {LABEL_EXPORT_WORD}
      </Button>
      <Button variant="outline" onClick={onPrint} disabled={busy !== null}>
        <Printer />
        Print
      </Button>
      <PreviewDialog checklist={checklist} onPrint={onPrint} />
    </div>
  );
}
