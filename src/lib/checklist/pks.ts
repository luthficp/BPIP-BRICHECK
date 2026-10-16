import { PKS_CATEGORY_KEY, PKS_DOCUMENT_NAME } from "./config";
import { normalizeDocumentName } from "./documents";
import type { DocumentVerification } from "./types";

/**
 * Informasi PKS: diambil dari Document Verification > Identitas Beneficiary > Perjanjian Kerja
 * Sama (status Ada / Tidak Ada + Nomor PKS pada Keterangan) dan ditampilkan sebagai informasi
 * tambahan pada Hasil Validasi Biaya. Murni informasi: tidak memengaruhi perbandingan maupun
 * status validasi CFV. Nomor PKS tidak diketik ulang di CFV; ia dibaca dari Keterangan yang sama.
 */

export type PksState = "ada" | "tidak-ada" | "belum-dipilih";

/** Label panel/baris informasi PKS (CFV, Preview, PDF, Word, Print). */
export const PKS_INFO_LABEL = "Informasi PKS";

export type PksInfo = {
  state: PksState;
  /** Label tetap untuk panel/baris informasi ("Informasi PKS"). */
  label: string;
  /** Nomor PKS (Keterangan, spasi dirapikan); kosong bila belum diisi. */
  number: string;
  /** true bila memilih Ada tetapi Nomor PKS belum diisi (kewajiban belum terpenuhi). */
  missingNumber: boolean;
  /** Teks tampil lengkap (UI dan output), mis. "PKS ada dengan Nomor PKS/045/2026". */
  text: string;
  /** Bagian teks SEBELUM nomor (nomor ditampilkan menonjol); sama dengan `text` bila tanpa nomor. */
  lead: string;
  /** info = PKS ada, notice = PKS tidak ada (amber lembut, bukan status), warning = Nomor PKS wajib diisi, muted = status belum dipilih. */
  tone: "info" | "notice" | "warning" | "muted";
};

export const PKS_MISSING_NUMBER_TEXT = "Nomor PKS belum diisi";
export const PKS_MISSING_NUMBER_WARNING =
  "Nomor PKS belum diisi. Isi pada Keterangan Perjanjian Kerja Sama di Document Verification (Identitas Beneficiary).";
export const PKS_ABSENT_TEXT = "PKS Tidak Ada. Silakan merujuk pada SE yang berlaku.";
export const PKS_UNSELECTED_TEXT = "Status PKS belum dipilih di Document Verification";
export const PKS_PRESENT_LEAD = "PKS ada dengan Nomor";

/** Baris bawaan (bukan tambahan ADK) "Perjanjian Kerja Sama" pada Identitas Beneficiary. */
export function findPksDocument(
  documents: readonly DocumentVerification[],
): DocumentVerification | undefined {
  const wanted = normalizeDocumentName(PKS_DOCUMENT_NAME);
  return documents.find(
    (d) =>
      d.categoryKey === PKS_CATEGORY_KEY &&
      !d.custom &&
      normalizeDocumentName(d.documentName) === wanted,
  );
}

export function isPksDocument(doc: Pick<DocumentVerification, "categoryKey" | "documentName" | "custom">): boolean {
  return (
    doc.categoryKey === PKS_CATEGORY_KEY &&
    !doc.custom &&
    normalizeDocumentName(doc.documentName) === normalizeDocumentName(PKS_DOCUMENT_NAME)
  );
}

export function cleanPksNumber(notes: string): string {
  return notes.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function getPksInfo(documents: readonly DocumentVerification[]): PksInfo {
  const doc = findPksDocument(documents);
  const base = { label: PKS_INFO_LABEL, number: "", missingNumber: false };
  if (!doc || doc.status === null) {
    return {
      ...base,
      state: "belum-dipilih",
      text: PKS_UNSELECTED_TEXT,
      lead: PKS_UNSELECTED_TEXT,
      tone: "muted",
    };
  }
  if (doc.status === "Tidak Ada") {
    return { ...base, state: "tidak-ada", text: PKS_ABSENT_TEXT, lead: PKS_ABSENT_TEXT, tone: "notice" };
  }
  const number = cleanPksNumber(doc.notes);
  if (!number) {
    return {
      ...base,
      state: "ada",
      missingNumber: true,
      text: PKS_MISSING_NUMBER_TEXT,
      lead: PKS_MISSING_NUMBER_TEXT,
      tone: "warning",
    };
  }
  return {
    ...base,
    state: "ada",
    number,
    text: `${PKS_PRESENT_LEAD} ${number}`,
    lead: PKS_PRESENT_LEAD,
    tone: "info",
  };
}

/** Peringatan Document Verification: PKS dipilih Ada tetapi Nomor PKS kosong. Kosong = tidak ada masalah. */
export function getDocumentIssues(documents: readonly DocumentVerification[]): string[] {
  return getPksInfo(documents).missingNumber
    ? [`${PKS_MISSING_NUMBER_TEXT} (Identitas Beneficiary > ${PKS_DOCUMENT_NAME} dipilih Ada)`]
    : [];
}
