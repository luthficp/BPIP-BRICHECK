/**
 * Nominal terstruktur: angka kanonik (tanpa pemisah) dipisahkan dari string
 * tampilan berseparator. Perbandingan SELALU memakai angka kanonik.
 *
 * Konvensi input (sesuai spesifikasi): koma = pemisah ribuan, titik = desimal.
 * Format Indonesia yang tidak ambigu tetap dikenali (mis. hasil paste
 * "1.250.000" atau "1.250.000,50"). Titik tunggal selalu dibaca sebagai desimal.
 *
 * Tidak bergantung pada React/Next agar mudah diuji dan dipindahkan ke backend.
 */

import { DEFAULT_CURRENCY } from "@/lib/checklist/config";
import type { AmountValue } from "@/lib/checklist/types";
import { normalizeText, parseAmount, stripCurrency } from "./normalize";

/** Batas digit bagian bulat agar tetap aman sebagai angka (JS). */
export const MAX_INTEGER_DIGITS = 15;

const ID_DECIMAL = /^\d{1,3}(\.\d{3})+,\d*$/; // 1.250.000,50
const ID_THOUSANDS = /^\d{1,3}(\.\d{3}){2,}$/; // 1.250.000 (minimal dua grup)
const ID_THOUSANDS_TRAILING_DOT = /^\d{1,3}(\.\d{3})+\.$/; // "400.000." saat mengetik 400.000.000

/**
 * Mengubah isian mentah (yang sedang diketik/di-paste) menjadi angka kanonik:
 * hanya digit dengan paling banyak satu titik desimal, tanpa nol di depan.
 * Mengembalikan "" bila tidak ada digit. Boleh berakhir "." (desimal sedang diketik).
 */
export function toCanonicalAmount(raw: string): string {
  let s = raw.normalize("NFKC").replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return "";

  if (ID_DECIMAL.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (ID_THOUSANDS.test(s) || ID_THOUSANDS_TRAILING_DOT.test(s)) {
    s = s.replace(/\./g, "");
  } else {
    s = s.replace(/,/g, "");
  }

  // Hanya satu titik desimal (yang pertama).
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  let [intPart, fracPart] = splitAtDot(s);
  intPart = intPart.replace(/^0+(?=\d)/, "").slice(0, MAX_INTEGER_DIGITS);
  if (intPart === "") intPart = "0";
  return fracPart === null ? intPart : `${intPart}.${fracPart}`;
}

function splitAtDot(s: string): [string, string | null] {
  const dot = s.indexOf(".");
  return dot === -1 ? [s, null] : [s.slice(0, dot), s.slice(dot + 1)];
}

/** "1250000.5" -> "1,250,000.5"; "400000." -> "400,000." (titik desimal dipertahankan). */
export function formatThousands(canonical: string): string {
  if (!canonical) return "";
  const [intPart, frac] = splitAtDot(canonical);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === null ? grouped : `${grouped}.${frac}`;
}

/** Bentuk tetap untuk perbandingan: tanpa titik akhir, nol di depan, dan nol desimal di belakang. */
export function normalizeAmountString(amount: string): string {
  const s = amount.replace(/\.$/, "");
  if (!/\d/.test(s)) return "";
  const [rawInt, rawFrac] = splitAtDot(s);
  const intPart = rawInt.replace(/^0+(?=\d)/, "") || "0";
  const fracPart = (rawFrac ?? "").replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

export function isAmountFilled(value: AmountValue): boolean {
  return normalizeAmountString(value.amount) !== "";
}

/** Kunci perbandingan nominal: mata uang + angka. "" bila belum diisi. */
export function amountKey(value: AmountValue): string {
  const normalized = normalizeAmountString(value.amount);
  if (!normalized) return "";
  return `amt:${value.currency || DEFAULT_CURRENCY}:${normalized}`;
}

/** Tampilan tabel/output: "IDR 4,000,000". Kosong bila belum diisi. */
export function formatAmountValue(value: AmountValue): string {
  const normalized = normalizeAmountString(value.amount);
  if (!normalized) return "";
  return `${value.currency || DEFAULT_CURRENCY} ${formatThousands(normalized)}`;
}

/**
 * Titik tunggal dibaca sebagai desimal. Bila bagian desimal >= 3 digit
 * (mis. "400.000"), kemungkinan ADK bermaksud pemisah ribuan gaya Indonesia;
 * UI memberi peringatan agar tidak salah baca.
 */
export function isSuspiciousDecimal(canonical: string): boolean {
  const [, frac] = splitAtDot(canonical);
  return frac !== null && frac.length >= 3;
}

/* ------------------------------------------------------------------ */
/* Biaya (Provisi / Administrasi)                                       */
/* ------------------------------------------------------------------ */

/**
 * Isian yang murni angka (digit, koma, dan satu titik desimal) diformat seperti
 * Nilai Bank Garansi: koma = pemisah ribuan (letaknya dihitung ulang setiap kali
 * ketik, jadi "5,0000" menjadi "50,000"), titik = desimal.
 * Teks lain ("1.25%", "Rp500.000", "USD 1,500.25") dibiarkan apa adanya selagi
 * diketik; perbandingan tetap membaca angkanya (lihat toFeeKey).
 * Persen ditulis dengan titik desimal ("1.25%"); koma yang diketik dianggap ribuan.
 */
const FEE_FORMATTABLE = /^[\d,]*\d[\d,]*(\.\d*)?$/;

export function formatFeeInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const compact = trimmed.replace(/\s/g, "");
  const formattable =
    FEE_FORMATTABLE.test(compact) ||
    ID_DECIMAL.test(compact) ||
    ID_THOUSANDS.test(compact) ||
    ID_THOUSANDS_TRAILING_DOT.test(compact);
  return formattable ? formatThousands(toCanonicalAmount(compact)) : raw;
}

/**
 * Hasil paste ke komponen Biaya. Dibaca dengan heuristik dokumen Indonesia seperti
 * paste Nilai Bank Garansi ("Rp 500.000,-" dan "500.000" = 500,000; "1,5" = 1.5), lalu
 * dijadikan format tampilan yang seragam. Mata uang selain IDR dipertahankan sebagai awalan.
 * null bila bukan angka murni (biarkan paste biasa, mis. "1.25%").
 */
export function formatPastedFee(text: string): string | null {
  const parsed = parsePastedAmount(text.trim(), DEFAULT_CURRENCY);
  if (!parsed) return null;
  const number = formatThousands(normalizeAmountString(parsed.amount));
  return parsed.currency === DEFAULT_CURRENCY ? number : `${parsed.currency} ${number}`;
}

/**
 * Membaca teks yang murni angka (opsional diawali mata uang), atau null.
 *  - ada simbol/kode mata uang ("Rp 500.000,-"): dibaca gaya dokumen Indonesia
 *    (titik ribuan), sama seperti saat paste.
 *  - tanpa simbol: aturan input aplikasi (koma ribuan, titik desimal).
 */
export function parseMoneyText(text: string): { currency: string; amount: string } | null {
  const stripped = stripCurrency(text);
  if (stripped.ambiguous) return null;

  if (stripped.currency !== null) {
    const liberal = parseAmount(text);
    if (!liberal) return null;
    return { currency: liberal.currency, amount: normalizeAmountString(liberal.value) };
  }

  let s = stripped.rest.replace(/[,.]\s*-+\s*$/, "").replace(/\s/g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  // Koma desimal gaya Indonesia: "1,5" / "1,25" (bukan "1,500" yang berarti ribuan).
  if (/^\d+,(\d{1,2}|\d{4,})$/.test(s)) s = s.replace(",", ".");

  const amount = normalizeAmountString(toCanonicalAmount(s));
  if (!amount) return null;
  return { currency: DEFAULT_CURRENCY, amount };
}

/**
 * Hasil paste nominal ("Rp 400.000.000,-", "USD 1,500.25", "400.000"): dibaca
 * dengan heuristik dokumen Indonesia agar "400.000" dari dokumen tidak salah
 * dibaca sebagai 400. Mata uang memakai simbol bila ada, selain itu tetap yang
 * sedang dipilih.
 */
export function parsePastedAmount(text: string, currentCurrency: string): AmountValue | null {
  const parsed = parseAmount(text);
  if (!parsed) return null;
  const explicit = stripCurrency(text).currency;
  return { currency: explicit ?? (currentCurrency || DEFAULT_CURRENCY), amount: parsed.value };
}

/** "1,25 %" / "1.250%" -> "1.25%" / "1.25%": desimal diseragamkan ke titik. */
function canonicalizePercents(text: string): string {
  return text.replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_match, num: string) => {
    const dotted = num.replace(",", ".");
    const trimmed = dotted.includes(".") ? dotted.replace(/0+$/, "").replace(/\.$/, "") : dotted;
    return `${trimmed}%`;
  });
}

/**
 * Kunci perbandingan satu komponen Biaya:
 *  - angka murni (+ mata uang)  -> dibandingkan sebagai nilai
 *  - selain itu (mis. persen)   -> teks ternormalisasi, persen diseragamkan
 */
export function toFeeKey(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const money = parseMoneyText(t);
  if (money) return `amt:${money.currency}:${money.amount}`;
  return `txt:${normalizeText(canonicalizePercents(t))}`;
}

/** Peringatan titik-desimal untuk komponen Biaya yang murni angka. */
export function feeHasSuspiciousDecimal(raw: string): boolean {
  const t = raw.trim().replace(/\s/g, "");
  return /^\d+\.\d{3,}$/.test(t);
}
