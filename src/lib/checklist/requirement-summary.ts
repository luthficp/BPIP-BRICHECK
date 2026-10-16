import { describeValidationStatus, type ValidationStatusText } from "./status-text";
import { matchStateNote } from "./display";
import { getDocumentRuleIssues, getRequirements, type Requirement } from "./completion";
import { groupDocuments } from "./documents";
import { LABEL_ADK_NAME, LABEL_SHARED_INFO_TITLE } from "./config";
import type { BankGuaranteeChecklist } from "./types";
import { evaluateField, summarizeValidation } from "@/lib/validation/three-way-match";

/**
 * Ringkasan per syarat penyelesaian untuk accordion pada Summary & Output.
 * Seluruh angka dihitung dari data checklist aktual (bukan state UI) agar tidak
 * ada perbedaan antara tampilan dan aturan Done. Isian sumber yang kosong
 * dilaporkan sebagai "Belum lengkap" dan tidak pernah dihitung sebagai mismatch.
 */

export type RequirementTone = "success" | "warning" | "danger" | "neutral";

type Base = Pick<Requirement, "label" | "ok" | "action" | "target"> & {
  /** success = lengkap/sesuai, warning = belum terpenuhi, danger = terpenuhi tetapi perlu ditinjau. */
  tone: RequirementTone;
  /** Status ringkas yang tampil di baris accordion saat tertutup. */
  statusLabel: string;
};

export type HeaderRequirementSummary = Base & {
  id: "header";
  fields: { label: string; value: string }[];
  missing: string[];
};

/** Satu dokumen pada ringkasan, beserta kategorinya (ditampilkan sebagai teks pendamping kecil). */
export type DocumentItemRef = {
  name: string;
  categoryNo: number | null;
  categoryTitle: string;
};

/** Dipertahankan untuk kompatibilitas nama lama. */
export type UncheckedDocumentItem = DocumentItemRef;

/** Label status ringkasan Document Verification (teks persis sesuai spesifikasi). */
export const DOC_SUMMARY_LABEL_COMPLETE = "Lengkap";
export const DOC_SUMMARY_LABEL_TIDAK_ADA = "Terdapat Dokumen yang Tidak Ada";
export const DOC_SUMMARY_LABEL_UNCHECKED = "Belum Diperiksa";
/** Hanya untuk aturan dokumen lain (mis. Nomor PKS kosong) bila seluruh dokumen sudah Ada. */
export const DOC_SUMMARY_LABEL_RULE_ISSUE = "Belum lengkap";

/**
 * Kondisi pemeriksaan dokumen, dengan prioritas: Tidak Ada > Belum Diperiksa > aturan dokumen > Lengkap.
 * Tidak Ada diprioritaskan sebagai status utama, tetapi Belum Diperiksa tetap tampil pada metrik dan
 * daftar tersendiri. Kondisi ini hanya menjelaskan hasil pemeriksaan, bukan kelayakan Bank Garansi.
 */
export type DocumentsCondition = "complete" | "has-tidak-ada" | "has-unchecked" | "rule-issue";

/**
 * Ringkasan Document Verification: hanya agregat. Bersifat informatif: Tidak Ada bukan otomatis
 * kegagalan persyaratan Bank Garansi dan tidak pernah dihitung sebagai Belum Diperiksa.
 */
export type DocumentsRequirementSummary = Base & {
  id: "documents";
  condition: DocumentsCondition;
  /** Seluruh item pemeriksaan pada data aktual (termasuk dokumen tambahan ADK). */
  total: number;
  /** Dokumen yang sudah diberi status Ada / Tidak Ada. */
  checked: number;
  /** Nama dokumen per status (jumlah = panjang daftar). */
  ada: string[];
  tidakAda: string[];
  unchecked: string[];
  /** Hanya dokumen berstatus Tidak Ada, urut seperti Step 1. */
  tidakAdaItems: DocumentItemRef[];
  /** Hanya dokumen yang benar-benar belum diperiksa (Tidak Ada tidak termasuk), urut seperti Step 1. */
  uncheckedItems: DocumentItemRef[];
  /** Catatan aturan dokumen lain (mis. Nomor PKS wajib bila PKS Ada); kosong bila tidak ada. */
  issues: string[];
};

export type CriticalRequirementSummary = Base & {
  id: "critical";
  /**
   * Hitungan critical field yang DIBANDINGKAN saja (tujuh field; tanpa Underlying / Dasar
   * Penerbitan). Bila seluruhnya sesuai: match === total ("Critical Field Sesuai 7/7").
   */
  counts: { total: number; match: number; mismatch: number; incomplete: number };
  /**
   * Informasi Bersama = Underlying / Dasar Penerbitan. Tidak dibandingkan antar sumber dan tidak
   * dihitung sebagai critical field tambahan; hanya berstatus Terisi / Belum diisi. null bila
   * checklist tidak memiliki field tersebut.
   */
  sharedInfo: { label: string; filled: boolean; statusLabel: "Terisi" | "Belum diisi" } | null;
  status: ValidationStatusText;
  /**
   * Baris yang memuat hasil TIDAK SESUAI. `rowIncomplete` = baris itu secara keseluruhan
   * juga masih Belum lengkap (mis. satu komponen Biaya berbeda, komponen lain masih kosong).
   */
  mismatchRows: { name: string; reasons: string[]; rowIncomplete: boolean }[];
  incompleteRows: { name: string; note: string }[];
  /** Jumlah baris dengan TIDAK SESUAI yang terlihat (dasar pemblokiran ke Opini ADK). */
  visibleMismatchRows: number;
};

export type OpinionRequirementSummary = Base & {
  id: "opinion";
  text: string;
};

export type RequirementSummary =
  | HeaderRequirementSummary
  | DocumentsRequirementSummary
  | CriticalRequirementSummary
  | OpinionRequirementSummary;

export function getRequirementSummaries(c: BankGuaranteeChecklist): RequirementSummary[] {
  const requirements = getRequirements(c);
  const base = (id: Requirement["id"]) => {
    const req = requirements.find((r) => r.id === id)!;
    return { label: req.label, ok: req.ok, action: req.action, target: req.target };
  };

  /* --- Informasi Aplikasi --- */
  const headerBase = base("header");
  const headerFields = [
    { label: LABEL_ADK_NAME, value: c.adkName.trim() },
    { label: "Atas Nama", value: c.atasNama.trim() },
    { label: "CIF", value: c.cif.trim() },
    { label: "Jenis Pengajuan", value: c.jenisPengajuan.trim() },
  ];
  const header: HeaderRequirementSummary = {
    id: "header",
    ...headerBase,
    tone: headerBase.ok ? "success" : "warning",
    statusLabel: headerBase.ok ? "Lengkap" : "Belum lengkap",
    fields: headerFields,
    missing: headerFields.filter((f) => f.value === "").map((f) => f.label),
  };

  /* --- Document Verification --- */
  const docsBase = base("documents");
  const docs = c.documentVerification;
  const groups = groupDocuments(docs);
  const grouped = new Set(groups.flatMap((group) => group.documents.map((d) => d.id)));
  // Daftar mengikuti urutan kategori pada Step 1; dokumen yang (secara defensif) tidak ditemukan pada
  // kategori mana pun tetap dihitung dan ditampilkan tanpa kategori agar angka dan daftar selalu cocok.
  const itemsWithStatus = (status: "Ada" | "Tidak Ada" | null): DocumentItemRef[] => [
    ...groups.flatMap((group) =>
      group.documents
        .filter((d) => d.status === status)
        .map((d) => ({ name: d.documentName, categoryNo: group.no, categoryTitle: group.title })),
    ),
    ...docs
      .filter((d) => d.status === status && !grouped.has(d.id))
      .map((d) => ({ name: d.documentName, categoryNo: null, categoryTitle: "" })),
  ];
  const tidakAdaItems = itemsWithStatus("Tidak Ada");
  const uncheckedItems = itemsWithStatus(null);
  const issues = getDocumentRuleIssues(c);
  const condition: DocumentsCondition =
    tidakAdaItems.length > 0
      ? "has-tidak-ada"
      : uncheckedItems.length > 0
        ? "has-unchecked"
        : issues.length > 0
          ? "rule-issue"
          : "complete";
  const documents: DocumentsRequirementSummary = {
    id: "documents",
    ...docsBase,
    condition,
    // Status mengikuti kondisi pemeriksaan aktual: hijau Lengkap, amber Tidak Ada, biru Belum Diperiksa.
    tone:
      condition === "complete"
        ? "success"
        : condition === "has-unchecked"
          ? "neutral"
          : "warning",
    statusLabel:
      condition === "complete"
        ? DOC_SUMMARY_LABEL_COMPLETE
        : condition === "has-tidak-ada"
          ? DOC_SUMMARY_LABEL_TIDAK_ADA
          : condition === "has-unchecked"
            ? DOC_SUMMARY_LABEL_UNCHECKED
            : DOC_SUMMARY_LABEL_RULE_ISSUE,
    total: docs.length,
    checked: docs.length - uncheckedItems.length,
    ada: docs.filter((d) => d.status === "Ada").map((d) => d.documentName),
    tidakAda: docs.filter((d) => d.status === "Tidak Ada").map((d) => d.documentName),
    unchecked: docs.filter((d) => d.status === null).map((d) => d.documentName),
    tidakAdaItems,
    uncheckedItems,
    issues,
  };

  /* --- Critical Field Validation --- */
  const criticalBase = base("critical");
  const summary = summarizeValidation(c.criticalFields);
  const evaluations = c.criticalFields.map((field) => ({ field, evaluation: evaluateField(field) }));
  const visibleMismatchRows = evaluations.filter(({ evaluation }) => evaluation.hasMismatch).length;
  const complete = summary.allSourcesFilled;
  const sharedField = c.criticalFields.find((f) => f.key === "underlying");
  const sharedFilled = sharedField !== undefined && summary.sharedMissing === false;
  // TIDAK SESUAI yang terlihat selalu perlu ditinjau, walau masih ada isian lain yang kosong.
  const reviewNeeded = visibleMismatchRows > 0;
  const critical: CriticalRequirementSummary = {
    id: "critical",
    ...criticalBase,
    tone: reviewNeeded ? "danger" : !complete ? "warning" : "success",
    statusLabel: reviewNeeded
      ? complete
        ? "Perlu ditinjau"
        : "Belum lengkap & perlu ditinjau"
      : !complete
        ? "Belum lengkap"
        : "Sesuai",
    counts: {
      total: summary.comparedTotal,
      match: summary.comparedMatch,
      mismatch: summary.mismatch,
      incomplete: summary.comparedIncomplete,
    },
    sharedInfo: sharedField
      ? {
          label: LABEL_SHARED_INFO_TITLE,
          filled: sharedFilled,
          statusLabel: sharedFilled ? "Terisi" : "Belum diisi",
        }
      : null,
    status: describeValidationStatus(summary),
    visibleMismatchRows,
    mismatchRows: evaluations
      .filter(({ evaluation }) => evaluation.hasMismatch)
      .map(({ field, evaluation }) => ({
        name: field.fieldName,
        reasons: evaluation.reasons,
        rowIncomplete: evaluation.state === "BELUM LENGKAP",
      })),
    // Hanya critical field yang dibandingkan; Informasi Bersama (Underlying) punya blok sendiri.
    incompleteRows: evaluations
      .filter(({ field, evaluation }) => field.key !== "underlying" && evaluation.state === "BELUM LENGKAP")
      .map(({ field, evaluation }) => ({
        name: field.fieldName,
        note: matchStateNote(evaluation) ?? "",
      })),
  };

  /* --- Opini ADK --- */
  const opinionBase = base("opinion");
  const opinion: OpinionRequirementSummary = {
    id: "opinion",
    ...opinionBase,
    tone: opinionBase.ok ? "success" : "warning",
    statusLabel: opinionBase.ok ? "Lengkap" : "Belum lengkap",
    text: c.opiniAdk.trim(),
  };

  return [header, documents, critical, opinion];
}
