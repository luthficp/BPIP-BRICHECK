"use client";

import * as React from "react";
import { toast } from "sonner";

import { LABEL_MEMORANDUM, LABEL_PUTUSAN } from "@/lib/checklist/config";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import {
  applyExtraction,
  clearSourceFields,
  countFilledColumn,
  countNeedsAttention,
  countReadFields,
  countReplaced,
  countStatuses,
  type ExtractSource,
  type ExtractionChange,
} from "@/lib/extract/apply";
import { parseBgDocument, type ParsedBgDocument } from "@/lib/extract/bg-parse";
import { PdfReadError, readPdfText } from "@/lib/extract/pdf-text";
import { describeCounts } from "@/lib/extract/summary";

/**
 * Status upload PDF opsional di Step 2. Hook ini dipasang di workspace (bukan di komponen Step 2)
 * sehingga nama berkas, hasil bacaan, dan keadaan daftar hasil pembacaan tetap ada selama ADK
 * pindah antar step pada task yang sama. Berkas PDF tidak disimpan; hanya nama dan hasil bacaannya
 * yang ada di memori halaman dan hilang saat task ditutup.
 */

export type Phase = "empty" | "waiting" | "reading" | "done" | "error";

export type SlotState = {
  phase: Phase;
  fileName?: string;
  /** Pesan kegagalan (phase "error"). */
  message?: string;
  parsed?: ParsedBgDocument;
  changes: ExtractionChange[];
  /** Catatan, mis. judul dokumen tidak ditemukan. */
  note?: string;
};

export const EMPTY_SLOT: SlotState = { phase: "empty", changes: [] };

export type SlotInfo = {
  source: ExtractSource;
  /** Nama kolom di tabel Step 2. */
  label: string;
  /** Nama pendek kolom ("Memorandum"). */
  short: string;
  /** Singkatan dokumen ("MABG"). */
  abbr: string;
};

export const SLOTS: readonly SlotInfo[] = [
  { source: "mak", label: LABEL_MEMORANDUM, short: "Memorandum", abbr: "MABG" },
  { source: "ptk", label: LABEL_PUTUSAN, short: "Putusan", abbr: "PTBG" },
];

export type PdfExtraction = {
  slots: Record<ExtractSource, SlotState>;
  /** Jumlah field yang dapat dibaca dari PDF dan kini berisi nilai pada kolom dokumen itu. */
  filled: Record<ExtractSource, number>;
  /**
   * Daftar hasil pembacaan tiap dokumen terbuka: otomatis terbuka bila ada field yang perlu
   * dikonfirmasi atau tidak ditemukan, selain itu mengikuti pilihan ADK.
   */
  summaryOpen: Record<ExtractSource, boolean>;
  setSummaryOpen: (source: ExtractSource, open: boolean) => void;
  /** Berkas baru langsung menimpa seluruh isian kolom dokumen itu yang dicakup ekstraksi. */
  selectFile: (source: ExtractSource, file: File | undefined) => void;
  /** Hapus berkas; `clearFields` juga mengosongkan seluruh isian kolom dokumen itu. */
  removeFile: (source: ExtractSource, clearFields: boolean) => void;
};

const INITIAL: Record<ExtractSource, SlotState> = { mak: EMPTY_SLOT, ptk: EMPTY_SLOT };
const AUTO_OPEN: Record<ExtractSource, boolean | null> = { mak: null, ptk: null };

export function usePdfExtraction(
  checklist: BankGuaranteeChecklist | null,
  onChange: (apply: (c: BankGuaranteeChecklist) => BankGuaranteeChecklist) => void,
): PdfExtraction {
  const [slots, setSlots] = React.useState<Record<ExtractSource, SlotState>>(INITIAL);
  // null = otomatis (terbuka bila ada yang perlu diperiksa); true/false = pilihan ADK, per dokumen.
  const [openPref, setOpenPref] = React.useState<Record<ExtractSource, boolean | null>>(AUTO_OPEN);

  // Nilai terbaru untuk pekerjaan asinkron (pembacaan PDF selesai belakangan).
  const checklistRef = React.useRef(checklist);
  checklistRef.current = checklist;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  // Berkas yang dipilih belakangan menang bila ADK mengganti berkas saat pembacaan sebelumnya berjalan.
  const ticket = React.useRef<Record<ExtractSource, number>>({ mak: 0, ptk: 0 });
  // Satu PDF dibaca pada satu waktu; berkas lain menunggu giliran.
  const queue = React.useRef<Promise<void>>(Promise.resolve());

  const patchSlot = React.useCallback((source: ExtractSource, patch: Partial<SlotState>) => {
    setSlots((prev) => ({ ...prev, [source]: { ...prev[source], ...patch } }));
  }, []);

  const reset = React.useCallback(() => {
    ticket.current = { mak: ticket.current.mak + 1, ptk: ticket.current.ptk + 1 };
    setSlots(INITIAL);
    setOpenPref(AUTO_OPEN);
  }, []);

  // Task lain dibuka: buang status upload task sebelumnya. Pembacaan yang masih berjalan dibatalkan
  // (juga saat halaman ditinggalkan) agar hasilnya tidak menulis ke task yang salah.
  const checklistId = checklist?.id;
  const lastId = React.useRef(checklistId);
  React.useEffect(() => {
    if (lastId.current !== checklistId) {
      lastId.current = checklistId;
      reset();
    }
  }, [checklistId, reset]);
  React.useEffect(
    () => () => {
      ticket.current = { mak: ticket.current.mak + 1, ptk: ticket.current.ptk + 1 };
    },
    [],
  );

  const readFile = React.useCallback(
    async (source: ExtractSource, file: File, mine: number) => {
      if (mine !== ticket.current[source]) return; // sudah diganti/dihapus saat menunggu
      patchSlot(source, { phase: "reading" });
      const slot = SLOTS.find((s) => s.source === source) as SlotInfo;
      try {
        const text = await readPdfText(file);
        if (mine !== ticket.current[source]) return;
        const parsed = parseBgDocument(text);
        if (parsed.detectedType && parsed.detectedType !== source) {
          const other = parsed.detectedType === "mak" ? "Memorandum" : "Putusan";
          patchSlot(source, {
            phase: "error",
            parsed: undefined,
            changes: [],
            message: `Berkas ini tampaknya ${other}, bukan ${slot.short}. Pilih berkas pada area yang sesuai. Isian tabel tidak diubah.`,
          });
          return;
        }
        if (countReadFields(parsed) === 0) {
          // Tidak ada satu field pun yang terbaca: bukan dokumen yang dimaksud. Jangan mengosongkan kolom.
          patchSlot(source, {
            phase: "error",
            parsed: undefined,
            changes: [],
            message: `Tidak ada field yang dapat dibaca dari berkas ini. Pastikan berkas adalah ${slot.short} (${slot.abbr}). Isian tabel tidak diubah; isi manual bila perlu.`,
          });
          return;
        }
        const current = checklistRef.current;
        if (!current) return;
        // Langsung menimpa kolom dokumen ini; hasil diterapkan setelah pembacaan selesai.
        const report = applyExtraction(current, source, parsed);
        onChangeRef.current((c) => applyExtraction(c, source, parsed).checklist);
        patchSlot(source, {
          phase: "done",
          parsed,
          changes: report.changes,
          note: parsed.detectedType
            ? undefined
            : `Judul "${slot.label}" tidak ditemukan pada PDF; pastikan berkas ini benar.`,
          message: undefined,
        });
        setOpenPref((prev) => ({ ...prev, [source]: null })); // buka otomatis bila ada yang perlu diperiksa
        const counts = countStatuses(report.changes);
        const attention = countNeedsAttention(report.changes);
        const replaced = countReplaced(report.changes);
        const description = [
          replaced > 0 ? `${replaced} isian lama pada kolom ${slot.short} digantikan hasil PDF.` : "",
          attention > 0 ? "Periksa field bertanda kuning atau merah." : "",
        ]
          .filter(Boolean)
          .join(" ");
        const title = `${slot.abbr}: ${describeCounts(counts)}`;
        if (attention > 0) toast.warning(title, { description: description || undefined });
        else toast.success(title, { description: description || undefined });
      } catch (error) {
        if (mine !== ticket.current[source]) return;
        patchSlot(source, {
          phase: "error",
          parsed: undefined,
          changes: [],
          message:
            error instanceof PdfReadError
              ? `${error.message} Isian tabel tidak diubah; isi manual bila perlu.`
              : "PDF tidak dapat dibaca. Isian tabel tidak diubah; coba berkas lain atau isi manual.",
        });
      }
    },
    [patchSlot],
  );

  const selectFile = React.useCallback(
    (source: ExtractSource, file: File | undefined) => {
      if (!file) return;
      const mine = ++ticket.current[source];
      patchSlot(source, { phase: "waiting", fileName: file.name, message: undefined });
      queue.current = queue.current.then(() => readFile(source, file, mine));
    },
    [patchSlot, readFile],
  );

  const removeFile = React.useCallback((source: ExtractSource, clearFields: boolean) => {
    ticket.current[source]++; // batalkan pembacaan yang masih berjalan
    if (clearFields) onChangeRef.current((c) => clearSourceFields(c, source));
    setSlots((prev) => ({ ...prev, [source]: EMPTY_SLOT }));
    setOpenPref((prev) => ({ ...prev, [source]: null }));
  }, []);

  const attention = (source: ExtractSource) => countNeedsAttention(slots[source].changes) > 0;
  const summaryOpen: Record<ExtractSource, boolean> = {
    mak: openPref.mak ?? attention("mak"),
    ptk: openPref.ptk ?? attention("ptk"),
  };
  const filled: Record<ExtractSource, number> = {
    mak: checklist ? countFilledColumn(checklist, "mak") : 0,
    ptk: checklist ? countFilledColumn(checklist, "ptk") : 0,
  };
  const setSummaryOpen = React.useCallback((source: ExtractSource, open: boolean) => {
    setOpenPref((prev) => ({ ...prev, [source]: open }));
  }, []);

  return {
    slots,
    filled,
    summaryOpen,
    setSummaryOpen,
    selectFile,
    removeFile,
  };
}
