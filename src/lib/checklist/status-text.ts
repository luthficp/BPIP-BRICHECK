import type { ValidationSummary } from "@/lib/validation/three-way-match";

/**
 * Kalimat status Hasil Validasi untuk Summary & Output (UI, PDF, Word, Cetak).
 * Sumber tunggal agar teks selalu sama di semua tempat.
 *
 * Aturan angka:
 *   - N pada "terdapat N informasi yang belum sesuai" = jumlah critical field
 *     yang BENAR-BENAR berstatus TIDAK SESUAI.
 *   - Isian yang kosong / belum lengkap TIDAK ikut dihitung sebagai tidak
 *     sesuai; ia dilaporkan terpisah.
 *   - Kalimat "Seluruh sumber terisi ..." hanya muncul bila tidak ada satu pun
 *     isian sumber yang kosong atau tidak valid.
 */

export type ValidationStatusKind =
  | "all-match" // seluruh sumber terisi, tidak ada ketidaksesuaian
  | "mismatch" // seluruh sumber terisi, ada ketidaksesuaian
  | "mismatch-incomplete" // ada ketidaksesuaian sekaligus isian yang belum lengkap
  | "incomplete"; // belum ada ketidaksesuaian, tetapi masih ada isian kosong

export type ValidationStatusText = {
  kind: ValidationStatusKind;
  tone: "success" | "danger" | "warning";
  /** Judul singkat untuk banner. */
  title: string;
  /** Kalimat status utama. */
  text: string;
  /** Kalimat tambahan tentang isian yang belum lengkap (bila ada). */
  incompleteText: string | null;
};

export const TEXT_ALL_MATCH = "Seluruh sumber terisi dan hasil validasi sudah sesuai.";
export const TEXT_ALL_REQUIREMENTS_MET =
  'Seluruh syarat terpenuhi. Klik "Tandai Selesai (Done)" untuk menyelesaikan Task dan melanjutkan ke pilihan Output.';

export function mismatchText(count: number): string {
  return `Seluruh sumber terisi; terdapat ${count} informasi yang belum sesuai.`;
}

/**
 * Deskripsi status per baris Critical Field Validation. `missing` = jumlah nilai
 * sumber (0-3) yang belum terisi pada baris itu. Format persis sesuai spesifikasi.
 */
export function incompleteRowText(missing: number): string {
  return `Belum lengkap : ${missing} field belum terisi`;
}

/**
 * Versi ringkas untuk layar (baris Biaya dan item Kontra Garansi): status "Belum lengkap" sudah
 * tampil pada badge, sehingga hanya jumlahnya yang ditulis, sekali, di bawah badge.
 */
export function incompleteCountText(missing: number): string {
  return `${missing} field belum terisi`;
}

export function incompleteCellsText(cells: number, fields: number): string {
  return `Masih ada ${cells} isian sumber yang kosong atau tidak valid pada ${fields} critical field.`;
}

/** Informasi Bersama = Underlying / Dasar Penerbitan; bukan critical field yang dibandingkan. */
export const TEXT_SHARED_INFO_MISSING =
  "Informasi Bersama (Underlying / Dasar Penerbitan) belum diisi.";

/**
 * Kalimat isian belum lengkap. Hitungan critical field hanya mencakup field yang dibandingkan;
 * Informasi Bersama yang kosong disebut terpisah agar tidak terbaca sebagai critical field
 * yang belum lengkap.
 */
export function describeIncomplete(summary: ValidationSummary): string | null {
  if (summary.allSourcesFilled) return null;
  const parts: string[] = [];
  if (summary.comparedIncompleteCells > 0) {
    parts.push(incompleteCellsText(summary.comparedIncompleteCells, summary.comparedIncomplete));
  }
  if (summary.sharedMissing) parts.push(TEXT_SHARED_INFO_MISSING);
  return parts.join(" ");
}

/** Judul ringkas untuk blok output: "N dari 7 critical field belum lengkap" / Informasi Bersama. */
export function incompleteHeadline(summary: ValidationSummary): string {
  if (summary.comparedIncomplete > 0) {
    const base = `${summary.comparedIncomplete} dari ${summary.comparedTotal} critical field belum lengkap`;
    return summary.sharedMissing ? `${base}; Informasi Bersama belum diisi` : base;
  }
  return "Informasi Bersama belum diisi";
}

export function describeValidationStatus(summary: ValidationSummary): ValidationStatusText {
  const incompleteText = describeIncomplete(summary);

  if (summary.mismatch > 0 && summary.allSourcesFilled) {
    return {
      kind: "mismatch",
      tone: "danger",
      title: "Ketidaksesuaian Informasi",
      text: mismatchText(summary.mismatch),
      incompleteText: null,
    };
  }

  if (summary.mismatch > 0) {
    return {
      kind: "mismatch-incomplete",
      tone: "danger",
      title: "Ketidaksesuaian Informasi",
      text: `Terdapat ${summary.mismatch} informasi yang belum sesuai.`,
      incompleteText,
    };
  }

  if (!summary.allSourcesFilled) {
    return {
      kind: "incomplete",
      tone: "warning",
      title: "Belum lengkap",
      text: "Belum ada informasi yang terdeteksi tidak sesuai, tetapi Hasil Validasi belum final.",
      incompleteText,
    };
  }

  return {
    kind: "all-match",
    tone: "success",
    title: "Hasil Validasi sesuai",
    text: TEXT_ALL_MATCH,
    incompleteText: null,
  };
}
