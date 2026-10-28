"use client";

import * as React from "react";
import { toast } from "sonner";
import { CircleDashed, Eye, EyeOff, FileText, Loader2, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";

import {
  SLOTS,
  type PdfExtraction,
  type Phase,
  type SlotInfo,
  type SlotState,
} from "@/components/checklist/use-pdf-extraction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LABEL_MEMORANDUM, LABEL_PUTUSAN, LABEL_UNDERLYING } from "@/lib/checklist/config";
import type { ExtractSource } from "@/lib/extract/apply";
import { describeCounts, summarizeExtraction, type ExtractionSummary, type SummaryRow } from "@/lib/extract/summary";
import { cn } from "@/lib/utils";

/**
 * Upload PDF opsional pada Step 2 (Critical Field Validation): MABG mengisi kolom Memorandum dan
 * PTBG mengisi kolom Putusan. Berkas dibaca di browser (tidak diunggah, tidak disimpan); hanya
 * isian tabel yang tersimpan, sama seperti jika diketik. Underlying Document dan Kontra Garansi
 * tetap manual. Status dan hasil bacaan berada di hook `usePdfExtraction` (dipasang di workspace)
 * agar bertahan saat ADK berpindah step; komponen ini hanya tampilan.
 *
 * Hasil pembacaan ditampilkan langsung di bawah area upload masing-masing dokumen, sebagai baris
 * ringkas per field (tanpa kotak statistik). Detail tambahan hanya muncul pada field berstatus
 * kuning: teks yang ditemukan dan alasan perlu konfirmasi.
 */

type Props = { pdf: PdfExtraction };

export function PdfUploadPanel({ pdf }: Props) {
  const [removing, setRemoving] = React.useState<ExtractSource | null>(null);
  const target = removing ? (SLOTS.find((s) => s.source === removing) ?? null) : null;

  return (
    <div className="space-y-3" data-pdf-upload-panel>
      <section className="space-y-3 rounded-md border bg-muted/30 p-3" aria-labelledby="pdf-upload-title">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 id="pdf-upload-title" className="text-sm font-semibold">
            Isi otomatis dari PDF
          </h3>
          <Badge variant="muted">Opsional</Badge>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Unggah {LABEL_MEMORANDUM} (MABG) dan/atau {LABEL_PUTUSAN} (PTBG) untuk mengisi kolom
          masing-masing. Boleh salah satu atau tidak sama sekali; pengisian manual tetap berjalan.{" "}
          <strong className="font-semibold text-foreground">{LABEL_UNDERLYING}</strong> dan{" "}
          <strong className="font-semibold text-foreground">Kontra Garansi</strong> tetap Anda isi dan
          periksa manual.{" "}
          <strong className="font-semibold text-foreground">
            PDF yang diunggah langsung menimpa isian kolom dokumennya
          </strong>
          , termasuk yang Anda ketik atau koreksi sendiri; field yang tidak ditemukan dikosongkan.
        </p>

        <div className="grid items-start gap-3 lg:grid-cols-2">
          {SLOTS.map((slot) => (
            <UploadSlot
              key={slot.source}
              slot={slot}
              state={pdf.slots[slot.source]}
              open={pdf.summaryOpen[slot.source]}
              onOpenChange={(open) => pdf.setSummaryOpen(slot.source, open)}
              onFile={(file) => pdf.selectFile(slot.source, file)}
              onAskRemove={() => setRemoving(slot.source)}
            />
          ))}
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          PDF dibaca langsung di browser; berkas tidak diunggah ke server dan tidak disimpan. Hanya PDF
          berisi teks (bukan scan/foto) yang dapat dibaca; selebihnya isi manual. Hasil bacaan hanya
          usulan: periksa setiap isian. Hasil Validasi (SESUAI / TIDAK SESUAI) tetap dihitung otomatis
          seperti biasa.
        </p>
      </section>

      <RemoveDialog
        key={removing ?? "none"}
        slot={target}
        state={target ? pdf.slots[target.source] : null}
        filled={target ? pdf.filled[target.source] : 0}
        onCancel={() => setRemoving(null)}
        onConfirm={(clearFields) => {
          if (!target) return;
          pdf.removeFile(target.source, clearFields);
          setRemoving(null);
          toast.success(`Dokumen ${target.abbr} dihapus`, {
            description: clearFields
              ? `Isian kolom ${target.short} dikosongkan dan Hasil Validasi dihitung ulang.`
              : `Isian kolom ${target.short} dipertahankan.`,
          });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Area upload per dokumen (termasuk hasil pembacaannya)                */
/* ------------------------------------------------------------------ */

function UploadSlot({
  slot,
  state,
  open,
  onOpenChange,
  onFile,
  onAskRemove,
}: {
  slot: SlotInfo;
  state: SlotState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFile: (file: File | undefined) => void;
  onAskRemove: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const busy = state.phase === "waiting" || state.phase === "reading";
  const summary = state.phase === "done" ? summarizeExtraction(state.changes) : null;
  const listId = `pdf-result-${slot.source}`;
  const notices = state.phase === "done" ? [...(state.parsed?.warnings ?? []), ...(state.note ? [state.note] : [])] : [];

  return (
    <div
      className={cn(
        "@container min-w-0 space-y-2 rounded-md border bg-card p-3",
        state.phase === "error" && "border-danger-border",
        summary && summary.attention === 0 && "border-success-border",
        summary && summary.attention > 0 && "border-warning-border",
      )}
      data-pdf-slot={slot.source}
      data-pdf-phase={state.phase}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold">
          Upload {slot.abbr} (PDF)
          <span className="block text-xs font-normal text-muted-foreground">{slot.label}</span>
        </p>
        <StatusBadge phase={state.phase} attention={summary?.attention ?? 0} />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label={`Pilih PDF ${slot.label}`}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ""; // memilih berkas yang sama lagi tetap memicu pembacaan
        }}
      />

      {state.phase === "empty" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => inputRef.current?.click()}>
            <FileText />
            Pilih PDF {slot.abbr}
          </Button>
          <span className="text-xs text-muted-foreground">Belum ada berkas.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 max-w-full truncate text-sm font-medium" title={state.fileName} data-pdf-filename>
              {state.fileName}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              Ganti PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onAskRemove}
              aria-label={`Hapus berkas ${slot.abbr}`}
            >
              <Trash2 />
              Hapus
            </Button>
          </div>

          <div aria-live="polite" className="text-xs">
            {state.phase === "waiting" && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
                Menunggu giliran dibaca...
              </span>
            )}
            {state.phase === "reading" && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Sedang dibaca... isian kolom diganti setelah pembacaan selesai.
              </span>
            )}
            {state.phase === "error" && (
              <span className="inline-flex items-start gap-1.5 font-medium text-danger">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {state.message}
              </span>
            )}
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-2 border-t pt-2" data-pdf-result={slot.source}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-xs font-medium text-foreground" aria-live="polite" data-pdf-result-status>
              {summary.attention === 0
                ? `Berhasil dibaca: ${summary.counts.filled} field terisi.`
                : `Selesai dibaca: ${describeCounts(summary.counts)}.`}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => onOpenChange(!open)}
              data-pdf-toggle
            >
              {open ? <EyeOff /> : <Eye />}
              {open ? "Sembunyikan hasil pembacaan" : "Tampilkan semua hasil pembacaan"}
            </Button>
          </div>

          {notices.length > 0 && (
            <ul className="space-y-1" data-pdf-notices>
              {notices.map((text, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-warning">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">{text}</span>
                </li>
              ))}
            </ul>
          )}

          <ResultList id={listId} summary={summary} open={open} abbr={slot.abbr} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ phase, attention }: { phase: Phase; attention: number }) {
  switch (phase) {
    case "empty":
      return <Badge variant="muted">Belum ada berkas</Badge>;
    case "waiting":
      return <Badge variant="muted">Menunggu</Badge>;
    case "reading":
      return <Badge variant="info">Sedang dibaca</Badge>;
    case "done":
      return attention > 0 ? (
        <Badge variant="warning">Selesai, perlu diperiksa</Badge>
      ) : (
        <Badge variant="success">Berhasil dibaca</Badge>
      );
    case "error":
      return <Badge variant="danger">Gagal dibaca</Badge>;
  }
}

/* ------------------------------------------------------------------ */
/* Daftar hasil pembacaan: baris ringkas per field                      */
/* ------------------------------------------------------------------ */

function ResultList({ id, summary, open, abbr }: { id: string; summary: ExtractionSummary; open: boolean; abbr: string }) {
  return (
    <ul
      id={id}
      hidden={!open}
      aria-label={`Hasil pembacaan ${abbr}`}
      className="divide-y overflow-hidden rounded-md border"
      data-pdf-list
    >
      {summary.rows.map((row) => (
        <ResultRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

/**
 * Satu baris per field. Pada kartu sempit: nama + status di baris pertama, nilai di bawahnya.
 * Pada kartu lebar (container query): satu baris "nama | nilai | status"; detail kuning,
 * keterangan, dan catatan berada di bawah kolom nilai.
 */
function ResultRow({ row }: { row: SummaryRow }) {
  const detail = "@[32rem]:col-span-2 @[32rem]:col-start-2";
  return (
    <li
      className="flex flex-col gap-1 px-3 py-2 @[32rem]:grid @[32rem]:grid-cols-[9.5rem_minmax(0,1fr)_auto] @[32rem]:items-baseline @[32rem]:gap-x-3"
      data-pdf-row={row.key}
      data-status={row.status}
      data-attention={row.needsAttention ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 @[32rem]:contents">
        <span className="min-w-0 grow basis-36 break-words text-sm font-medium @[32rem]:col-start-1 @[32rem]:row-start-1">
          {row.label}
        </span>
        <Badge
          variant={row.tone}
          className="shrink-0 text-right @[32rem]:col-start-3 @[32rem]:row-start-1 @[32rem]:justify-self-end"
          data-pdf-badge
        >
          {row.statusLabel}
        </Badge>
      </div>

      {row.value ? (
        <p className="break-words text-sm @[32rem]:col-start-2 @[32rem]:row-start-1" data-pdf-value>
          {row.value}
        </p>
      ) : row.status === "confirm" ? (
        <p className="text-xs text-muted-foreground @[32rem]:col-start-2 @[32rem]:row-start-1" data-pdf-value-empty>
          Belum terisi pada tabel; isi atau pilih manual.
        </p>
      ) : null}

      {row.status === "confirm" && (
        <div
          className={cn("space-y-1 rounded-md border border-warning-border bg-warning-soft px-2.5 py-2 text-xs", detail)}
          data-pdf-confirm
        >
          <div>
            <span className="font-semibold text-foreground">Informasi ditemukan:</span>{" "}
            {row.found.length === 1 ? (
              <span className="break-words text-foreground">“{row.found[0]}”</span>
            ) : (
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-foreground">
                {row.found.map((text, i) => (
                  <li key={i} className="break-words">
                    “{text}”
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <span className="font-semibold text-foreground">Alasan:</span>{" "}
            {row.reasons.length === 1 ? (
              <span className="break-words text-foreground">{row.reasons[0]}</span>
            ) : (
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-foreground">
                {row.reasons.map((text, i) => (
                  <li key={i} className="break-words">
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {row.note && <p className={cn("break-words text-xs text-muted-foreground", detail)}>{row.note}</p>}
      {row.info && <p className={cn("break-words text-xs text-muted-foreground", detail)}>{row.info}</p>}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog Hapus dokumen                                                 */
/* ------------------------------------------------------------------ */

type RemoveChoice = "keep" | "clear";

function RemoveDialog({
  slot,
  state,
  filled,
  onCancel,
  onConfirm,
}: {
  slot: SlotInfo | null;
  state: SlotState | null;
  filled: number;
  onCancel: () => void;
  onConfirm: (clearFields: boolean) => void;
}) {
  const [choice, setChoice] = React.useState<RemoveChoice>("keep");

  return (
    <Dialog open={slot !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-xl" data-pdf-remove-dialog>
        {slot && (
          <>
            <DialogHeader>
              <DialogTitle>Hapus Dokumen {slot.abbr}</DialogTitle>
              <DialogDescription>
                Pilih tindakan untuk berkas <strong className="break-all font-semibold text-foreground">{state?.fileName}</strong>{" "}
                dan isian hasil bacaannya pada kolom {slot.short} di tabel Critical Field Validation.
              </DialogDescription>
            </DialogHeader>

            <fieldset className="grid gap-3">
              <legend className="sr-only">Pilih tindakan penghapusan</legend>
              <ChoiceCard
                name={`remove-${slot.source}`}
                value="keep"
                checked={choice === "keep"}
                onSelect={() => setChoice("keep")}
                title="Hapus dokumen saja"
              >
                Berkas PDF dilepas dari area upload. Semua isian pada kolom {slot.short} tetap
                dipertahankan, termasuk hasil bacaan dan koreksi yang sudah Anda lakukan.
              </ChoiceCard>
              <ChoiceCard
                name={`remove-${slot.source}`}
                value="clear"
                checked={choice === "clear"}
                onSelect={() => setChoice("clear")}
                title="Hapus dokumen dan kosongkan isian"
              >
                <span className="block">
                  Berkas PDF dilepas dan seluruh isian kolom {slot.short} yang dibaca dari PDF
                  (Jenis BG, Tujuan BG, Beneficiary, Nilai BG, Jangka Waktu, Provisi, Administrasi)
                  dikosongkan, termasuk yang sudah Anda ubah sendiri.{" "}
                  <span className="font-medium text-foreground">
                    Saat ini ada {filled} isian terisi pada kolom {slot.short}.
                  </span>
                </span>
                <span className="mt-1 block">
                  Kolom dokumen lain, {LABEL_UNDERLYING}, Kontra Garansi, dan field biaya tambahan tidak
                  dikosongkan. Hasil Validasi dihitung ulang otomatis.
                </span>
                <span className="mt-1 block font-semibold text-danger">
                  Mengosongkan isian tidak dapat dibatalkan. Pastikan pilihan Anda.
                </span>
              </ChoiceCard>
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                Batal
              </Button>
              <Button type="button" variant="destructive" onClick={() => onConfirm(choice === "clear")}>
                <Trash2 />
                {choice === "clear" ? "Hapus dan kosongkan isian" : "Hapus dokumen"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  children,
}: {
  name: string;
  value: RemoveChoice;
  checked: boolean;
  onSelect: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-primary bg-accent/50" : "hover:bg-accent/30",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 space-y-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}
