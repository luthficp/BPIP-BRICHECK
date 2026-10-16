import {
  countIncompleteCells,
  countMismatchRows,
  countTotalCells,
  isFilled,
} from "@/lib/validation/three-way-match";
import { LABEL_ADK_NAME, mismatchBlockText, type StepId } from "./config";
import { getDocumentIssues } from "./pks";
import type { BankGuaranteeChecklist, CriticalField } from "./types";

/**
 * Aturan kelengkapan (Completion Rules).
 *
 * Revisi 13 Oktober 2026: selama masih ada hasil TIDAK SESUAI pada Critical Field
 * Validation, ADK tidak dapat melanjutkan ke Opini ADK (dan karenanya tidak dapat
 * menandai Done). Mengedit isian dan kembali ke step sebelumnya tetap diperbolehkan;
 * tidak ada bypass. Status "Belum lengkap" ditangani oleh aturan kelengkapan dan
 * tidak pernah dihitung sebagai TIDAK SESUAI.
 */

export function getMissingHeaderFields(c: BankGuaranteeChecklist): string[] {
  const missing: string[] = [];
  if (!isFilled(c.adkName)) missing.push(LABEL_ADK_NAME);
  if (!isFilled(c.atasNama)) missing.push("Atas Nama");
  if (!isFilled(c.cif)) missing.push("CIF");
  if (!isFilled(c.jenisPengajuan)) missing.push("Jenis Pengajuan");
  return missing;
}

export function getUnansweredDocuments(c: BankGuaranteeChecklist) {
  return c.documentVerification.filter((d) => d.status === null);
}

/**
 * Sel critical field (field x sumber) yang masih kosong atau tidak valid
 * (mis. tanggal akhir lebih awal dari tanggal mulai).
 */
export function countEmptyCells(fields: CriticalField[]): number {
  return countIncompleteCells(fields);
}

export function countEmptyCriticalCells(c: BankGuaranteeChecklist): number {
  return countEmptyCells(c.criticalFields);
}

/** Jumlah baris critical field yang memuat hasil TIDAK SESUAI yang terlihat. */
export function countMismatches(c: BankGuaranteeChecklist): number {
  return countMismatchRows(c.criticalFields);
}

/** Masih ada TIDAK SESUAI: lanjut ke Opini ADK diblokir sampai ditinjau dan dikoreksi. */
export function isMismatchBlocking(c: BankGuaranteeChecklist): boolean {
  return countMismatches(c) > 0;
}

/**
 * Kewajiban Document Verification di luar "sudah diberi status": Perjanjian Kerja Sama pada
 * Identitas Beneficiary yang dipilih Ada wajib memuat Nomor PKS pada Keterangan. Kosong = terpenuhi.
 */
export function getDocumentRuleIssues(c: BankGuaranteeChecklist): string[] {
  return getDocumentIssues(c.documentVerification);
}

export function isStep1Complete(c: BankGuaranteeChecklist): boolean {
  return getUnansweredDocuments(c).length === 0 && getDocumentRuleIssues(c).length === 0;
}

/** Step 2 selesai bila seluruh sumber terisi DAN tidak ada hasil TIDAK SESUAI. */
export function isStep2Complete(c: BankGuaranteeChecklist): boolean {
  return countEmptyCriticalCells(c) === 0 && !isMismatchBlocking(c);
}

/**
 * Alasan Step 2 belum boleh dilanjutkan (kosong = boleh). Isian yang belum lengkap
 * disebut lebih dulu; TIDAK SESUAI disebut terpisah dan tidak dihitung sebagai belum lengkap.
 */
export function describeStep2Issue(c: BankGuaranteeChecklist): string {
  const cells = countEmptyCriticalCells(c);
  const mismatches = countMismatches(c);
  const parts: string[] = [];
  if (cells > 0) parts.push(`${cells} isian Critical Field Validation belum lengkap atau tidak valid`);
  if (mismatches > 0) parts.push(mismatchBlockText(mismatches));
  return parts.join(". ");
}

export function isStep3Complete(c: BankGuaranteeChecklist): boolean {
  return isFilled(c.opiniAdk);
}

export function isStepComplete(step: StepId, c: BankGuaranteeChecklist): boolean {
  switch (step) {
    case 1:
      return isStep1Complete(c);
    case 2:
      return isStep2Complete(c);
    case 3:
      return isStep3Complete(c);
    case 4:
      return c.status === "Done";
  }
}

/** Step pertama (1-3) yang belum lengkap sebelum `target`; null bila boleh masuk. */
export function getFirstBlockingStep(
  target: StepId,
  c: BankGuaranteeChecklist,
): StepId | null {
  for (const step of [1, 2, 3] as const) {
    if (step >= target) break;
    if (!isStepComplete(step, c)) return step;
  }
  return null;
}

/** Alasan checklist belum boleh ditandai Done (kosong = boleh). */
export function getDoneBlockers(c: BankGuaranteeChecklist): string[] {
  const blockers: string[] = [];
  const header = getMissingHeaderFields(c);
  if (header.length > 0) blockers.push(`Informasi pengajuan belum lengkap: ${header.join(", ")}`);

  const docs = getUnansweredDocuments(c).length;
  if (docs > 0) blockers.push(`${docs} dokumen belum diberi status Ada / Tidak Ada`);
  blockers.push(...getDocumentRuleIssues(c));

  const cells = countEmptyCriticalCells(c);
  if (cells > 0) {
    blockers.push(`${cells} isian Critical Field Validation belum lengkap atau tidak valid`);
  }
  const mismatches = countMismatches(c);
  if (mismatches > 0) blockers.push(mismatchBlockText(mismatches));

  if (!isStep3Complete(c)) blockers.push("Opini ADK belum diisi");
  return blockers;
}

/** Tempat ADK melengkapi suatu syarat: bagian header (Informasi Aplikasi/Pengajuan) atau step 1-3. */
export type RequirementTarget = "header" | 1 | 2 | 3;

export type Requirement = {
  id: "header" | "documents" | "critical" | "opinion";
  /** Nama syarat (judul baris). */
  label: string;
  ok: boolean;
  /** Penjelasan status: apa yang sudah lengkap, atau apa yang masih kurang. */
  detail: string;
  /** Tindakan yang dibutuhkan bila belum terpenuhi (teks tombol). */
  action: string;
  target: RequirementTarget;
};

/**
 * Syarat wajib sebelum "Tandai Selesai (Done)". Critical Field Validation baru
 * terpenuhi bila seluruh sumber terisi dan tidak ada hasil TIDAK SESUAI.
 */
export function getRequirements(c: BankGuaranteeChecklist): Requirement[] {
  const header = getMissingHeaderFields(c);
  const docsLeft = getUnansweredDocuments(c).length;
  const docIssues = getDocumentRuleIssues(c);
  const cellsLeft = countEmptyCriticalCells(c);
  const mismatches = countMismatches(c);
  const opinionOk = isStep3Complete(c);

  return [
    {
      id: "header",
      label: "Informasi Aplikasi",
      ok: header.length === 0,
      detail:
        header.length === 0
          ? `${LABEL_ADK_NAME}, Atas Nama, CIF, dan Jenis Pengajuan sudah terisi.`
          : `Belum diisi: ${header.join(", ")}.`,
      action: "Lengkapi Informasi Pengajuan",
      target: "header",
    },
    {
      id: "documents",
      label: "Document Verification",
      ok: docsLeft === 0 && docIssues.length === 0,
      detail: [
        docsLeft === 0
          ? `Seluruh ${c.documentVerification.length} dokumen sudah diberi status Ada / Tidak Ada.`
          : `${docsLeft} dokumen belum diberi status Ada / Tidak Ada.`,
        ...docIssues.map((issue) => `${issue}.`),
      ].join(" "),
      action: "Buka Document Verification",
      target: 1,
    },
    {
      id: "critical",
      label: "Critical Field Validation",
      ok: cellsLeft === 0 && mismatches === 0,
      detail:
        cellsLeft > 0
          ? `${cellsLeft} isian belum lengkap atau tidak valid.${mismatches > 0 ? ` Selain itu, ${mismatches} informasi TIDAK SESUAI perlu ditinjau.` : ""}`
          : mismatches > 0
            ? `${mismatches} informasi TIDAK SESUAI perlu ditinjau dan dikoreksi berdasarkan sumber.`
            : "Seluruh sumber terisi dan valid; Hasil Validasi sudah terhitung.",
      action: "Buka Critical Field Validation",
      target: 2,
    },
    {
      id: "opinion",
      label: "Opini ADK",
      ok: opinionOk,
      detail: opinionOk ? "Opini ADK sudah diisi." : "Opini ADK belum diisi.",
      action: "Isi Opini ADK",
      target: 3,
    },
  ];
}

export function canMarkDone(c: BankGuaranteeChecklist): boolean {
  return c.status === "Draft" && getDoneBlockers(c).length === 0;
}

/**
 * Persentase kelengkapan: 4 header + seluruh dokumen + seluruh isian critical field
 * (3 sumber per field; 1 untuk informasi bersama; seluruh isian detail Kontra Garansi) + opini.
 * Semua item diberi bobot sama.
 */
export function getCompletion(c: BankGuaranteeChecklist): {
  done: number;
  total: number;
  percent: number;
} {
  const headerTotal = 4;
  const headerDone = headerTotal - getMissingHeaderFields(c).length;

  const docTotal = c.documentVerification.length;
  const docDone = Math.max(0, docTotal - getUnansweredDocuments(c).length - getDocumentRuleIssues(c).length);

  const cellTotal = countTotalCells(c.criticalFields);
  const cellDone = Math.max(0, cellTotal - countEmptyCriticalCells(c));

  const opinionDone = isStep3Complete(c) ? 1 : 0;

  const total = headerTotal + docTotal + cellTotal + 1;
  const done = headerDone + docDone + cellDone + opinionDone;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Step awal saat checklist dibuka: Done -> Output, Draft -> step pertama yang belum lengkap. */
export function getInitialStep(c: BankGuaranteeChecklist): StepId {
  if (c.status === "Done") return 4;
  if (!isStep1Complete(c)) return 1;
  if (!isStep2Complete(c)) return 2;
  if (!isStep3Complete(c)) return 3;
  return 4;
}
