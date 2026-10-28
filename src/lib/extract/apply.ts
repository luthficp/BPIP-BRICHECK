/**
 * Menerapkan hasil bacaan PDF (MABG/PTBG) ke kolom Memorandum atau Putusan pada Critical Field
 * Validation. Murni (tanpa React) dan hanya memakai mutasi checklist yang sudah ada, sehingga
 * hasilnya sama dengan jika ADK mengetik sendiri.
 *
 * Aturan yang dijaga di sini:
 *  - PDF yang diunggah LANGSUNG MENIMPA seluruh field kolom dokumen itu yang dicakup ekstraksi
 *    (Jenis, Tujuan, Beneficiary, Nilai, Jangka Waktu, Provisi, Administrasi), termasuk isian
 *    yang sebelumnya diketik/dikoreksi ADK. Tidak ada konfirmasi per field.
 *  - Field yang tidak ditemukan pada PDF terbaru DIKOSONGKAN (nilai lama tidak dipertahankan agar
 *    tidak terlihat seolah-olah berasal dari dokumen terbaru). Begitu pula field yang hanya
 *    menghasilkan beberapa kandidat (kuning tanpa nilai): kandidatnya ditampilkan, kolom kosong.
 *  - Underlying Document dan Kontra Garansi TIDAK pernah disentuh (tetap manual).
 *  - Satu dokumen hanya mengubah kolomnya sendiri (Memorandum atau Putusan), tidak kolom lain.
 *  - Perbandingan SESUAI / TIDAK SESUAI tetap dihitung oleh validation engine yang sudah ada
 *    (hasilnya dihitung ulang oleh editor setiap kali checklist berubah).
 */

import type { ExtractFieldId, ParsedBgDocument } from "./bg-parse";
import {
  setAmountValue,
  setCriticalValue,
  setFeeValue,
  setPeriodValue,
} from "@/lib/checklist/mutations";
import type {
  AmountCriticalField,
  BankGuaranteeChecklist,
  CriticalFieldKey,
  FeesCriticalField,
  PeriodCriticalField,
  SourceKey,
  TextCriticalField,
} from "@/lib/checklist/types";
import { formatAmountValue, toFeeKey } from "@/lib/validation/amount";
import { isoToDisplay } from "@/lib/validation/period";

export type ExtractSource = Extract<SourceKey, "mak" | "ptk">;

/**
 *  - filled:  nilai terbaca jelas dan diisikan (hijau).
 *  - confirm: informasi ditemukan tetapi ada alasan spesifik untuk diperiksa ADK (kuning). Nilai
 *             diisikan bila ada satu nilai yang jelas; dikosongkan bila hanya ada kandidat.
 *  - missing: tidak ada informasi yang dapat dipakai; kolom dikosongkan (merah).
 */
export type ChangeStatus = "filled" | "confirm" | "missing";

export type ExtractionChange = {
  id: ExtractFieldId;
  source: ExtractSource;
  fieldKey: CriticalFieldKey;
  /** Mis. "Jenis Bank Garansi", "Biaya: Provisi". */
  label: string;
  status: ChangeStatus;
  /** Nilai yang kini diisikan ke kolom (siap tampil); "" bila kolom dikosongkan. */
  display: string;
  /** Teks yang benar-benar terbaca dari PDF (satu kutipan, atau beberapa kandidat); kosong bila tidak ada. */
  found: string[];
  /** Alasan spesifik perlu konfirmasi (status confirm); kosong untuk status lain. */
  reasons: string[];
  /** Penjelasan singkat bila tidak ditemukan dan penyebabnya pasti (status missing). */
  note?: string;
  /** Catatan netral yang bukan alasan konfirmasi. */
  info?: string;
  /** Isian lama pada kolom ini yang digantikan atau dikosongkan oleh hasil PDF ini. */
  replaced?: string;
};

export type ExtractionReport = {
  checklist: BankGuaranteeChecklist;
  changes: ExtractionChange[];
};

/* ------------------------------------------------------------------ */
/* Definisi field                                                       */
/* ------------------------------------------------------------------ */

type FieldDef = {
  id: ExtractFieldId;
  fieldKey: CriticalFieldKey;
  label: string;
  /** Isi kolom saat ini sebagai teks tampilan ("" bila kosong). */
  current: (c: BankGuaranteeChecklist, source: ExtractSource) => string;
  /** Apakah dua teks tampilan dianggap sama. */
  same: (a: string, b: string) => boolean;
  /** Hasil bacaan -> teks tampilan + cara menuliskannya; null bila tidak terbaca. */
  read: (parsed: ParsedBgDocument) => {
    display: string;
    raw: string;
    reasons: string[];
    write: (c: BankGuaranteeChecklist, source: ExtractSource) => BankGuaranteeChecklist;
  } | null;
  clear: (c: BankGuaranteeChecklist, source: ExtractSource) => BankGuaranteeChecklist;
};

function fieldOf<T>(c: BankGuaranteeChecklist, key: CriticalFieldKey): T | undefined {
  return c.criticalFields.find((f) => f.key === key) as unknown as T | undefined;
}

const textKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function periodDisplay(p: { start: string; end: string }): string {
  if (!p.start && !p.end) return "";
  return `${p.start ? isoToDisplay(p.start) : "…"} s.d. ${p.end ? isoToDisplay(p.end) : "…"}`;
}

function textField(
  id: "jenisBg" | "tujuanBg" | "beneficiary",
  label: string,
  pick: (p: ParsedBgDocument) => ParsedBgDocument["tujuanBg"],
): FieldDef {
  const write =
    (value: string) =>
    (c: BankGuaranteeChecklist, source: ExtractSource) => {
      const field = fieldOf<TextCriticalField>(c, id);
      return field ? setCriticalValue(c, field.id, source, value) : c;
    };
  return {
    id,
    fieldKey: id,
    label,
    current: (c, source) => (fieldOf<TextCriticalField>(c, id)?.[source] ?? "").trim(),
    same: (a, b) => a !== "" && textKey(a) === textKey(b),
    read: (parsed) => {
      const found = pick(parsed);
      return found ? { display: found.value, raw: found.raw, reasons: found.reasons ?? [], write: write(found.value) } : null;
    },
    clear: write(""),
  };
}

function feeField(id: "provisi" | "administrasi", label: string): FieldDef {
  const write =
    (value: string) =>
    (c: BankGuaranteeChecklist, source: ExtractSource) => {
      const field = fieldOf<FeesCriticalField>(c, "biaya");
      return field ? setFeeValue(c, field.id, source, { [id]: value }) : c;
    };
  return {
    id,
    fieldKey: "biaya",
    label,
    current: (c, source) => (fieldOf<FeesCriticalField>(c, "biaya")?.[source]?.[id] ?? "").trim(),
    same: (a, b) => a !== "" && toFeeKey(a) === toFeeKey(b),
    read: (parsed) => {
      const found = parsed[id];
      return found ? { display: found.value, raw: found.raw, reasons: found.reasons ?? [], write: write(found.value) } : null;
    },
    clear: write(""),
  };
}

export const EXTRACT_FIELDS: readonly FieldDef[] = [
  textField("tujuanBg", "Tujuan Bank Garansi", (p) => p.tujuanBg),
  textField("jenisBg", "Jenis Bank Garansi", (p) => p.jenisBg),
  textField("beneficiary", "Beneficiary", (p) => p.beneficiary),
  {
    id: "nilaiBg",
    fieldKey: "nilaiBg",
    label: "Nilai Bank Garansi",
    current: (c, source) => {
      const field = fieldOf<AmountCriticalField>(c, "nilaiBg");
      return field ? formatAmountValue(field[source]) : "";
    },
    same: (a, b) => a !== "" && a === b,
    read: (parsed) => {
      const found = parsed.nilaiBg;
      if (!found) return null;
      return {
        display: formatAmountValue(found.value),
        raw: found.raw,
        reasons: found.reasons ?? [],
        write: (c, source) => {
          const field = fieldOf<AmountCriticalField>(c, "nilaiBg");
          return field ? setAmountValue(c, field.id, source, found.value) : c;
        },
      };
    },
    clear: (c, source) => {
      const field = fieldOf<AmountCriticalField>(c, "nilaiBg");
      return field ? setAmountValue(c, field.id, source, { amount: "" }) : c;
    },
  },
  {
    id: "jangkaWaktu",
    fieldKey: "jangkaWaktu",
    label: "Jangka Waktu",
    current: (c, source) => {
      const field = fieldOf<PeriodCriticalField>(c, "jangkaWaktu");
      return field ? periodDisplay(field[source]) : "";
    },
    same: (a, b) => a !== "" && a === b,
    read: (parsed) => {
      const found = parsed.jangkaWaktu;
      if (!found) return null;
      return {
        display: periodDisplay(found.value),
        raw: found.raw,
        reasons: found.reasons ?? [],
        write: (c, source) => {
          const field = fieldOf<PeriodCriticalField>(c, "jangkaWaktu");
          return field ? setPeriodValue(c, field.id, source, found.value) : c;
        },
      };
    },
    clear: (c, source) => {
      const field = fieldOf<PeriodCriticalField>(c, "jangkaWaktu");
      return field ? setPeriodValue(c, field.id, source, { start: "", end: "" }) : c;
    },
  },
  feeField("provisi", "Biaya: Provisi"),
  feeField("administrasi", "Biaya: Administrasi"),
];

/* ------------------------------------------------------------------ */
/* Penerapan                                                            */
/* ------------------------------------------------------------------ */

export function applyExtraction(
  input: BankGuaranteeChecklist,
  source: ExtractSource,
  parsed: ParsedBgDocument,
): ExtractionReport {
  let c = input;
  const changes: ExtractionChange[] = [];

  for (const def of EXTRACT_FIELDS) {
    const base = { id: def.id, source, fieldKey: def.fieldKey, label: def.label } as const;
    const info = parsed.infos[def.id];
    const existing = def.current(c, source);
    const read = def.read(parsed);

    if (read) {
      c = read.write(c, source); // menimpa, juga nilai yang diketik ADK
      changes.push({
        ...base,
        status: read.reasons.length > 0 ? "confirm" : "filled",
        display: read.display,
        found: [read.raw],
        reasons: read.reasons,
        ...(info ? { info } : {}),
        ...(existing !== "" && !def.same(existing, read.display) ? { replaced: existing } : {}),
      });
      continue;
    }

    // Tidak ada nilai yang pasti: kolom dikosongkan, nilai lama tidak dipertahankan.
    if (existing !== "") c = def.clear(c, source);
    const unresolved = parsed.unresolved[def.id];
    const common = { ...base, display: "", ...(existing !== "" ? { replaced: existing } : {}) };
    if (unresolved) {
      changes.push({ ...common, status: "confirm", found: unresolved.found, reasons: [unresolved.reason] });
    } else {
      changes.push({
        ...common,
        status: "missing",
        found: [],
        reasons: [],
        ...(parsed.notes[def.id] ? { note: parsed.notes[def.id] } : {}),
      });
    }
  }

  return { checklist: c, changes };
}

/**
 * Jumlah field yang terbaca dari PDF, baik berupa nilai maupun kandidat (kuning tanpa nilai).
 * Nol berarti PDF tidak menghasilkan satu pun informasi: dianggap gagal dibaca, sehingga
 * kolom tidak dikosongkan oleh berkas yang jelas bukan dokumen yang dimaksud.
 */
export function countReadFields(parsed: ParsedBgDocument): number {
  return EXTRACT_FIELDS.filter((def) => def.read(parsed) !== null || parsed.unresolved[def.id] !== undefined).length;
}

/**
 * Mengosongkan SELURUH isian kolom dokumen ini yang dapat dibaca dari PDF (Jenis, Tujuan,
 * Beneficiary, Nilai, Jangka Waktu, Provisi, Administrasi), termasuk yang sudah diubah ADK.
 * Tidak menyentuh kolom dokumen lain, Underlying Document, Kontra Garansi, maupun komponen
 * Biaya tambahan (yang tidak pernah dibaca dari PDF). Mata uang dibiarkan.
 */
export function clearSourceFields(input: BankGuaranteeChecklist, source: ExtractSource): BankGuaranteeChecklist {
  let c = input;
  for (const def of EXTRACT_FIELDS) c = def.clear(c, source);
  return c;
}

/** Jumlah field yang dapat dibaca dari PDF dan saat ini berisi nilai pada kolom dokumen ini. */
export function countFilledColumn(c: BankGuaranteeChecklist, source: ExtractSource): number {
  return EXTRACT_FIELDS.filter((def) => def.current(c, source) !== "").length;
}

export type StatusCounts = Record<ChangeStatus, number>;

export function countStatuses(changes: readonly ExtractionChange[]): StatusCounts {
  const counts: StatusCounts = { filled: 0, confirm: 0, missing: 0 };
  for (const change of changes) counts[change.status]++;
  return counts;
}

/** Jumlah isian yang butuh perhatian ADK: perlu konfirmasi atau tidak ditemukan. */
export function countNeedsAttention(changes: readonly ExtractionChange[]): number {
  return changes.filter((change) => change.status !== "filled").length;
}

/** Jumlah isian lama yang digantikan atau dikosongkan oleh hasil PDF ini. */
export function countReplaced(changes: readonly ExtractionChange[]): number {
  return changes.filter((change) => change.replaced !== undefined).length;
}
