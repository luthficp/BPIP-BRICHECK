/**
 * Ringkasan hasil pembacaan PDF per dokumen untuk ditampilkan ADK (Step 2). Murni (tanpa React)
 * agar status dan teksnya dapat diuji. Semua isi dihitung dari hasil bacaan aktual.
 *
 * Empat status, dengan teks dan warna yang konsisten:
 *  - Terisi (hijau): nilai terbaca jelas dan diisikan.
 *  - Ditemukan, Perlu Konfirmasi (kuning): ada kandidat/nilai, dengan alasan spesifik untuk diperiksa.
 *  - Tidak Ditemukan (merah): tidak ada informasi yang dapat dipakai; kolom dikosongkan.
 *  - Selalu Manual (netral): HANYA Kontra Garansi; bukan kegagalan dan tidak dihitung sebagai perhatian.
 */

import type { ExtractionChange, StatusCounts } from "./apply";
import { countStatuses } from "./apply";
import type { ExtractFieldId } from "./bg-parse";

export type FieldStatus = "filled" | "confirm" | "missing" | "manual";
export type SummaryTone = "success" | "warning" | "danger" | "muted";

export const STATUS_LABEL: Record<FieldStatus, string> = {
  filled: "Terisi",
  confirm: "Ditemukan, Perlu Konfirmasi",
  missing: "Tidak Ditemukan",
  manual: "Selalu Manual",
};

export const STATUS_TONE: Record<FieldStatus, SummaryTone> = {
  filled: "success",
  confirm: "warning",
  missing: "danger",
  manual: "muted",
};

export type SummaryRow = {
  key: string;
  /** Nama critical field (Biaya dipecah: Provisi dan Administrasi). */
  label: string;
  status: FieldStatus;
  /** Teks status (selalu ada; makna tidak bergantung pada warna). */
  statusLabel: string;
  tone: SummaryTone;
  /** Nilai yang kini terisi pada kolom dokumen ("" bila kosong). */
  value: string;
  /** Status kuning: teks yang benar-benar terbaca dari PDF ("Informasi yang ditemukan"). */
  found: string[];
  /** Status kuning: alasan spesifik perlu konfirmasi ("Alasan"). */
  reasons: string[];
  /** Keterangan singkat (penyebab tidak ditemukan, atau catatan Kontra Garansi). */
  note?: string;
  /** Catatan netral yang bukan alasan konfirmasi (mis. selisih hitungan hari). */
  info?: string;
  /** Butuh perhatian ADK: kuning atau merah. Baris "Selalu Manual" selalu false. */
  needsAttention: boolean;
};

export type ExtractionSummary = {
  rows: SummaryRow[];
  counts: StatusCounts;
  /** Kuning + merah. */
  attention: number;
  /** Terisi + kuning: field yang menghasilkan nilai atau kandidat. */
  read: number;
};

/** Urutan tampil mengikuti urutan Critical Field di tabel Step 2. */
const READ_ORDER: ExtractFieldId[] = [
  "jenisBg",
  "tujuanBg",
  "beneficiary",
  "nilaiBg",
  "jangkaWaktu",
  "provisi",
  "administrasi",
];

const MISSING_NOTE = "Tidak ditemukan pada dokumen ini. Kolom dikosongkan; isi manual bila perlu.";
const MANUAL_NOTE = "Diisi dan diperiksa manual oleh ADK; tidak dibaca dari PDF.";

function rowFor(change: ExtractionChange): SummaryRow {
  const status: FieldStatus = change.status;
  return {
    key: change.id,
    label: change.label,
    status,
    statusLabel: STATUS_LABEL[status],
    tone: STATUS_TONE[status],
    value: change.display,
    found: status === "confirm" ? change.found : [],
    reasons: status === "confirm" ? change.reasons : [],
    ...(status === "missing" ? { note: change.note ?? MISSING_NOTE } : {}),
    ...(change.info ? { info: change.info } : {}),
    needsAttention: status !== "filled",
  };
}

export function summarizeExtraction(changes: readonly ExtractionChange[]): ExtractionSummary {
  const byId = new Map(changes.map((change) => [change.id, change] as const));
  const rows = READ_ORDER.flatMap((id) => {
    const change = byId.get(id);
    return change ? [rowFor(change)] : [];
  });
  const counts = countStatuses(changes);
  rows.push({
    key: "kontraGaransi",
    label: "Kontra Garansi",
    status: "manual",
    statusLabel: STATUS_LABEL.manual,
    tone: STATUS_TONE.manual,
    value: "",
    found: [],
    reasons: [],
    note: MANUAL_NOTE,
    needsAttention: false,
  });
  return {
    rows,
    counts,
    attention: counts.confirm + counts.missing,
    read: counts.filled + counts.confirm,
  };
}

/** "5 terisi, 1 perlu konfirmasi, 1 tidak ditemukan" (bagian bernilai nol dihilangkan). */
export function describeCounts(counts: StatusCounts): string {
  const parts = [
    counts.filled > 0 ? `${counts.filled} terisi` : "",
    counts.confirm > 0 ? `${counts.confirm} perlu konfirmasi` : "",
    counts.missing > 0 ? `${counts.missing} tidak ditemukan` : "",
  ].filter(Boolean);
  return parts.join(", ");
}
