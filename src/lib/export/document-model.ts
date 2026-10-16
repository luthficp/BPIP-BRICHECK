import {
  APP_FULL_NAME,
  LABEL_ADK_NAME,
  LABEL_RESULT,
  LABEL_UNDERLYING,
  MISMATCH_WARNING_ACTION,
  MISMATCH_WARNING_TITLE,
  SOURCES,
} from "@/lib/checklist/config";
import {
  getComponentResults,
  getKontraDetailLines,
  getSharedLines,
  getSourceLines,
  kontraConfigText,
  matchStateLabel,
  matchStateNote,
  type ComponentResultLine,
  type DisplayLine,
} from "@/lib/checklist/display";
import { groupDocuments } from "@/lib/checklist/documents";
import { getPksInfo, type PksInfo } from "@/lib/checklist/pks";
import {
  describeValidationStatus,
  incompleteHeadline,
  type ValidationStatusKind,
} from "@/lib/checklist/status-text";
import type { BankGuaranteeChecklist, MatchState, SourceKey } from "@/lib/checklist/types";
import { evaluateField, summarizeValidation } from "@/lib/validation/three-way-match";
import { formatDate, formatTimestamp, shortId } from "./format";

/**
 * Model dokumen output (netral terhadap format).
 *
 * Seluruh informasi bisnis yang harus identik di PDF, Word, Cetak, dan Pratinjau
 * dikumpulkan di sini: identitas pengajuan, Document Verification + Keterangan,
 * Critical Field Validation (Underlying Document, Memorandum Analisa Bank Garansi,
 * Putusan Bank Garansi, Hasil Validasi), status/peringatan,
 * Opini ADK, area Opini SOK, nama/jabatan/tanggal/tanda tangan, dan metadata.
 *
 * Penyaji (mis. `docx.ts`) hanya menata model ini; ia tidak menghitung ulang
 * aturan bisnis.
 */

export const DOCUMENT_ORG = "Bank Rakyat Indonesia";
export const DOCUMENT_TITLE = "Checklist Verifikasi & Validasi Data Bank Garansi";
export const DISCLAIMER =
  "Checklist ini adalah alat verifikasi & validasi, bukan keputusan persetujuan.";

export type DocumentRowModel = {
  /** Nomor tampil, mis. "4.2" (kategori.subkategori). */
  no: string;
  name: string;
  ada: boolean;
  tidakAda: boolean;
  /** Keterangan yang diisi ADK, apa adanya (placeholder tidak pernah ikut). */
  notes: string;
  /** Subkategori yang ditambahkan ADK. */
  custom: boolean;
};

/** Kategori utama beserta subkategori/dokumennya. */
export type DocumentGroupModel = {
  no: number;
  title: string;
  /** Subkategori/dokumen kategori ini. */
  rows: DocumentRowModel[];
  /** Teks pengganti untuk kategori yang belum memiliki dokumen. */
  emptyNote: string | null;
};

export const EMPTY_CATEGORY_NOTE = "Belum ada dokumen pada kategori ini.";

/**
 * Jenis baris Critical Field Validation:
 *  - field      : field biasa, tiga sel sumber.
 *  - shared     : Underlying / Dasar Penerbitan, satu sel bersama (tiga kolom sumber digabung).
 *  - kontra     : baris pemilihan Kontra Garansi (ringkasan pilihan pada sel gabungan; tanpa
 *                 status, karena status ditampilkan per item).
 *  - item       : judul satu item Kontra Garansi (mis. "Fixed Asset #1") + status itemnya.
 *  - item-field : satu field detail item (Nomor SHM, Atas Nama, ...), tiga sel sumber.
 */
export type CriticalRowKind = "field" | "shared" | "kontra" | "item" | "item-field";

export type CriticalRowModel = {
  kind: CriticalRowKind;
  /** "1".."8"; "7.1" untuk item Kontra Garansi; kosong untuk field detail. */
  no: string;
  name: string;
  /** Baris teks per sumber, urutan sama dengan `SOURCES`; null bila tiga kolom sumber digabung. */
  sources: { key: SourceKey; lines: DisplayLine[] }[] | null;
  /** Isi sel gabungan (tiga kolom sumber) bila `sources` null. */
  merged: DisplayLine[] | null;
  /**
   * true = sel gabungan membentang juga di bawah kolom Hasil Validasi (empat kolom) dan baris
   * itu tidak memiliki sel hasil. Dipakai baris pemilihan Kontra Garansi (nomor 7): statusnya
   * ditampilkan pada subbaris item, bukan pada baris pemilihan.
   */
  mergedSpansResult: boolean;
  state: MatchState;
  stateLabel: string;
  /** Deskripsi dinamis baris Belum lengkap: "Belum lengkap : {N} field belum terisi". */
  stateNote: string | null;
  /** Hasil Validasi per komponen (hanya baris Biaya). */
  components: ComponentResultLine[] | null;
  /**
   * Informasi tambahan di bawah Hasil Validasi (hanya baris Biaya): status PKS dari Document
   * Verification. Murni informatif; tidak memengaruhi status maupun hitungan.
   */
  info: Pick<PksInfo, "label" | "text" | "lead" | "number" | "tone" | "state"> | null;
};

export type ValidationBlockModel = {
  kind: ValidationStatusKind;
  tone: "success" | "danger" | "warning";
  title: string;
  /** Kalimat status (persis seperti pada UI Summary & Output). */
  text: string;
  /** Anjuran tindak lanjut; hanya ada bila ada ketidaksesuaian. */
  action: string | null;
  mismatchLabels: string[];
  /** Rincian per komponen, mis. "Biaya: Provisi: Memorandum Analisa Bank Garansi berbeda dengan …". */
  reasons: string[];
  /** Pernyataan tambahan tentang isian yang belum lengkap (dipisah dari ketidaksesuaian). */
  incomplete: { headline: string; text: string } | null;
  mismatchCount: number;
};

export type SignatureModel = {
  heading: string;
  role: string;
  name: string;
  date: string;
};

export type ChecklistDocumentModel = {
  appFullName: string;
  org: string;
  title: string;
  statusLabel: string;
  identity: { label: string; value: string }[][];
  documentsHeading: string;
  documentGroups: DocumentGroupModel[];
  documentsNote: string;
  criticalHeading: string;
  criticalHeaders: string[];
  criticalRows: CriticalRowModel[];
  validation: ValidationBlockModel;
  opinionHeading: string;
  opiniAdk: string;
  sokHeading: string;
  /** Jumlah baris tulisan tangan pada area Opini SOK. */
  sokLines: number;
  signatures: { adk: SignatureModel; sok: SignatureModel };
  metadata: string[];
  disclaimer: string;
};

export type DocumentModelOptions = {
  generatedAt?: Date;
  timeZone?: string;
};

export const SOK_WRITING_LINES = 7;

export function buildChecklistDocumentModel(
  checklist: BankGuaranteeChecklist,
  options: DocumentModelOptions = {},
): ChecklistDocumentModel {
  const tz = { timeZone: options.timeZone };
  const fmtTs = (value: string | Date) => formatTimestamp(value, tz);
  const generatedAt = options.generatedAt ?? new Date();

  const docs = checklist.documentVerification;
  const unavailable = docs.filter((d) => d.status === "Tidak Ada");

  const evaluations = checklist.criticalFields.map((field) => ({
    field,
    evaluation: evaluateField(field),
  }));

  const summary = summarizeValidation(checklist.criticalFields);
  const status = describeValidationStatus(summary);
  const hasMismatch = status.kind === "mismatch" || status.kind === "mismatch-incomplete";

  // Rincian perbedaan dari hasil TIDAK SESUAI yang terlihat (termasuk komponen Biaya dan
  // item Kontra Garansi di dalam baris yang masih ada isian kosong lain).
  const reasons = evaluations.flatMap(({ field, evaluation }) =>
    evaluation.hasMismatch
      ? evaluation.reasons.map((reason) => `${field.fieldName}: ${reason}`)
      : [],
  );

  const metaLine1 = [
    `ID ${shortId(checklist.id)}`,
    `Status ${checklist.status}`,
    `Dibuat ${fmtTs(checklist.createdAt)}`,
    `Diperbarui ${fmtTs(checklist.updatedAt)}`,
  ].join("  |  ");
  const metaLine2 = [
    checklist.completedAt ? `Selesai ${fmtTs(checklist.completedAt)}` : null,
    `Dokumen dihasilkan sistem ${fmtTs(generatedAt)}`,
  ]
    .filter(Boolean)
    .join("  |  ");

  return {
    appFullName: APP_FULL_NAME,
    org: DOCUMENT_ORG,
    title: DOCUMENT_TITLE,
    statusLabel: checklist.status,
    identity: [
      [
        { label: "Atas Nama", value: checklist.atasNama },
        { label: LABEL_ADK_NAME, value: checklist.adkName },
      ],
      [
        { label: "CIF", value: checklist.cif },
        { label: "Jenis Pengajuan", value: checklist.jenisPengajuan },
      ],
      [
        { label: "Nama Task", value: checklist.taskName },
        { label: "Timestamp", value: fmtTs(checklist.completedAt ?? checklist.updatedAt) },
      ],
    ],
    documentsHeading: "1. Document Verification",
    documentGroups: groupDocuments(docs).map((group) => {
      const toRow = (d: (typeof group.documents)[number]): DocumentRowModel => ({
        no: d.label,
        name: d.documentName,
        ada: d.status === "Ada",
        tidakAda: d.status === "Tidak Ada",
        notes: d.notes,
        custom: d.custom,
      });
      const rows = group.documents.map(toRow);
      return {
        no: group.no,
        title: group.title,
        rows,
        emptyNote: rows.length === 0 ? EMPTY_CATEGORY_NOTE : null,
      };
    }),
    documentsNote: `${docs.length - unavailable.length} dari ${docs.length} dokumen tersedia${
      unavailable.length > 0 ? `; belum tersedia: ${unavailable.map((d) => d.documentName).join(", ")}.` : "."
    }`,
    criticalHeading: "2. Critical Field Validation",
    criticalHeaders: [
      "No",
      "Critical Field",
      ...SOURCES.map((s) => (s.key === "underlyingDocument" ? `${LABEL_UNDERLYING} (acuan)` : s.label)),
      LABEL_RESULT,
    ],
    criticalRows: buildCriticalRows(checklist),
    validation: {
      kind: status.kind,
      tone: status.tone,
      title: hasMismatch ? MISMATCH_WARNING_TITLE : status.title,
      text: status.text,
      action: hasMismatch ? MISMATCH_WARNING_ACTION : null,
      mismatchLabels: summary.mismatchLabels,
      reasons,
      incomplete: status.incompleteText
        ? {
            headline: incompleteHeadline(summary),
            text: `${status.incompleteText} Data yang belum lengkap atau tidak valid tidak dianggap sesuai dan tidak dihitung sebagai ketidaksesuaian.`,
          }
        : null,
      mismatchCount: summary.mismatch,
    },
    opinionHeading: "3. Opini ADK",
    opiniAdk: checklist.opiniAdk,
    sokHeading: "4. Opini SOK",
    sokLines: SOK_WRITING_LINES,
    signatures: {
      adk: {
        heading: "Diperiksa Oleh",
        role: "Administrasi Operasional Kredit (ADK)",
        name: checklist.adkName,
        date: checklist.completedAt ? formatDate(checklist.completedAt, tz) : "",
      },
      // SOK: sengaja kosong, diisi tangan (tanpa tanda tangan elektronik).
      sok: {
        heading: "Diketahui Oleh",
        role: "Supervisor Operasional Kredit (SOK)",
        name: "",
        date: "",
      },
    },
    metadata: [metaLine1, metaLine2],
    disclaimer: DISCLAIMER,
  };
}

/* ------------------------------------------------------------------ */
/* Baris Critical Field Validation                                      */
/* ------------------------------------------------------------------ */

/**
 * Seluruh baris tabel Critical Field Validation (termasuk item dan field detail
 * Kontra Garansi) dalam urutan tampil. PDF, Word, Cetak, dan Pratinjau merender
 * daftar yang sama.
 */
export function buildCriticalRows(checklist: BankGuaranteeChecklist): CriticalRowModel[] {
  const rows: CriticalRowModel[] = [];
  const pksInfo = getPksInfo(checklist.documentVerification);

  checklist.criticalFields.forEach((field, index) => {
    const evaluation = evaluateField(field);
    const base = {
      no: String(index + 1),
      name: field.fieldName,
      state: evaluation.state,
      stateLabel: matchStateLabel(evaluation.state),
      stateNote: matchStateNote(evaluation),
    };

    if (field.key === "underlying") {
      rows.push({
        ...base,
        kind: "shared",
        sources: null,
        merged: getSharedLines(field),
        mergedSpansResult: false,
        components: null,
        info: null,
      });
      return;
    }

    if (field.key === "kontraGaransi") {
      rows.push({
        ...base,
        kind: "kontra",
        sources: null,
        merged: [{ text: kontraConfigText(field), deviant: false }],
        mergedSpansResult: true,
        components: null,
        info: null,
      });

      (evaluation.items ?? []).forEach((itemEval, itemIndex) => {
        // Judul item + status. Ringkasan jumlah "x dari y field terisi" sengaja tidak ditampilkan;
        // sel gabungan dibiarkan kosong agar kolom sumber tetap rapi.
        rows.push({
          kind: "item",
          no: `${index + 1}.${itemIndex + 1}`,
          name: itemEval.title,
          sources: null,
          merged: [],
          mergedSpansResult: false,
          state: itemEval.state,
          stateLabel: matchStateLabel(itemEval.state),
          stateNote: matchStateNote(itemEval),
          components: null,
          info: null,
        });
        for (const detail of itemEval.fields) {
          rows.push({
            kind: "item-field",
            no: "",
            name: detail.label,
            sources: SOURCES.map((source) => ({
              key: source.key,
              lines: getKontraDetailLines(detail, itemEval.item.values?.[source.key], source.key),
            })),
            merged: null,
            mergedSpansResult: false,
            state: detail.evaluation.state,
            stateLabel: matchStateLabel(detail.evaluation.state),
            stateNote: matchStateNote({
              state: detail.evaluation.state,
              incompleteCount: detail.evaluation.incomplete.length,
            }),
            components: null,
            info: null,
          });
        }
      });
      return;
    }

    rows.push({
      ...base,
      kind: "field",
      sources: SOURCES.map((source) => ({
        key: source.key,
        lines: getSourceLines(field, source.key, evaluation),
      })),
      merged: null,
      mergedSpansResult: false,
      components: field.key === "biaya" ? getComponentResults(evaluation.components) : null,
      info: field.key === "biaya" ? pksInfo : null,
    });
  });

  return rows;
}
