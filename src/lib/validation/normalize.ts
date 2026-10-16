/**
 * Normalisasi untuk comparison engine.
 *
 * Prinsip: kurangi false mismatch yang murni kosmetik (spasi, kapitalisasi,
 * format angka/mata uang, format tanggal, karakter unicode) TANPA menghapus
 * perbedaan substantif. "PT ABC" vs "PT ABCD" harus tetap berbeda.
 *
 * File ini tidak bergantung pada React/Next agar mudah diuji dan dipindahkan
 * ke backend.
 */

/* ------------------------------------------------------------------ */
/* Tanggal                                                             */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1,
  februari: 2, pebruari: 2, february: 2, feb: 2,
  maret: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  agustus: 8, august: 8, agu: 8, agt: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nopember: 11, nov: 11,
  desember: 12, december: 12, des: 12, dec: 12,
};

function pad2(value: number | string): string {
  return String(value).padStart(2, "0");
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Mengubah tanggal dalam berbagai format menjadi ISO (yyyy-mm-dd):
 *  - dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy  (konvensi Indonesia: hari dulu)
 *  - yyyy-mm-dd, yyyy/mm/dd
 *  - dd <nama bulan Indonesia/Inggris> yyyy
 * Teks lain dibiarkan apa adanya. Tanggal yang tidak valid (mis. 31/02/2026)
 * tidak diubah sehingga tetap terlihat berbeda bila memang salah ketik.
 */
export function normalizeDates(input: string): string {
  let s = input;

  s = s.replace(
    /(^|\D)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?!\d)/g,
    (match, pre: string, d: string, mo: string, y: string) =>
      isValidYmd(+y, +mo, +d) ? `${pre}${y}-${pad2(mo)}-${pad2(d)}` : match,
  );

  s = s.replace(
    /(^|\D)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?!\d)/g,
    (match, pre: string, y: string, mo: string, d: string) =>
      isValidYmd(+y, +mo, +d) ? `${pre}${y}-${pad2(mo)}-${pad2(d)}` : match,
  );

  s = s.replace(
    /(^|\D)(\d{1,2})\s+([A-Za-z]{3,10})\.?,?\s+(\d{4})(?!\d)/g,
    (match, pre: string, d: string, name: string, y: string) => {
      const mo = MONTHS[name.toLowerCase()];
      return mo && isValidYmd(+y, mo, +d) ? `${pre}${y}-${pad2(mo)}-${pad2(d)}` : match;
    },
  );

  return s;
}

/** "14-09-2026 s/d 14-09-2027", "... sampai dengan ...", "... - ..." dst. */
const DATE_RANGE_RE =
  /(\d{4}-\d{2}-\d{2})\s*(?:s\/d|s\.d\.?|sd|sampai dengan|sampai|hingga|until|to|-)\s*(\d{4}-\d{2}-\d{2})/g;

/* ------------------------------------------------------------------ */
/* Teks                                                                */
/* ------------------------------------------------------------------ */

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/**
 * Normalisasi teks bebas untuk perbandingan:
 *  - unicode NFKC, hapus zero-width/soft-hyphen
 *  - samakan variasi kutip & tanda hubung
 *  - trim + rapatkan spasi ganda (termasuk non-breaking space)
 *  - tanggal -> ISO, konektor rentang tanggal diseragamkan
 *  - tidak peka huruf besar/kecil
 *  - titik/koma yang bukan bagian angka dibuang ("PT." = "PT")
 *
 * Yang SENGAJA tidak dilakukan: menghapus kata, singkatan, atau karakter
 * bermakna lain.
 */
export function normalizeText(input: string): string {
  let s = input.normalize("NFKC");

  s = s.replace(/[​-‍﻿­]/g, "");
  s = s.replace(/[‘’‚‛′`´]/g, "'");
  s = s.replace(/[“”„‟″]/g, '"');
  s = s.replace(/[‐-―−]/g, "-");
  s = s.replace(/\s+/g, " ").trim();

  s = normalizeDates(s);
  s = s.toLowerCase();
  s = s.replace(DATE_RANGE_RE, "$1 s/d $2");

  s = s.replace(/[.,]/g, (ch: string, offset: number, whole: string) =>
    isDigit(whole[offset - 1]) && isDigit(whole[offset + 1]) ? ch : "",
  );

  return s.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Nominal / mata uang                                                 */
/* ------------------------------------------------------------------ */

export type ParsedAmount = {
  currency: string;
  /** Angka kanonik tanpa pemisah ribuan, mis. "400000000" atau "1500.25". */
  value: string;
};

const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:rp|idr)(?![a-z])\.?|\brupiah\b/gi, "IDR"],
  [/\busd(?![a-z])|us\$|\$|\b(?:us\s)?dollars?\b|\bdolar\b/gi, "USD"],
  [/\beur(?![a-z])|€|\beuro\b/gi, "EUR"],
  [/\bsgd(?![a-z])|s\$/gi, "SGD"],
  [/\bjpy(?![a-z])|¥|\byen\b/gi, "JPY"],
  [/\bgbp(?![a-z])|£/gi, "GBP"],
  [/\baud(?![a-z])/gi, "AUD"],
  [/\bmyr(?![a-z])/gi, "MYR"],
  [/\bcny(?![a-z])|\brmb(?![a-z])/gi, "CNY"],
];

/**
 * Memisahkan simbol/kode mata uang dari teks ("Rp 500", "USD 1,000", "$5").
 * `ambiguous` = ditemukan lebih dari satu mata uang berbeda.
 */
export function stripCurrency(input: string): {
  rest: string;
  currency: string | null;
  ambiguous: boolean;
} {
  let s = input;
  const found = new Set<string>();
  for (const [pattern, code] of CURRENCY_PATTERNS) {
    s = s.replace(pattern, () => {
      found.add(code);
      return " ";
    });
  }
  return {
    rest: s,
    currency: found.size === 1 ? [...found][0] : null,
    ambiguous: found.size > 1,
  };
}

/** Mengubah string digit+pemisah menjadi angka kanonik, atau null bila ambigu/rusak. */
function canonicalNumber(raw: string): string | null {
  if (!/^\d[\d.,]*$/.test(raw)) return null;

  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let intPart = raw;
  let fracPart = "";

  if (lastDot !== -1 && lastComma !== -1) {
    // Dua jenis pemisah: yang paling akhir adalah desimal, yang lain ribuan.
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    const pieces = raw.split(decimalSep);
    if (pieces.length !== 2) return null;
    const [i, f] = pieces;
    if (f.includes(thousandSep)) return null;
    const groups = i.split(thousandSep);
    if (
      groups[0].length < 1 ||
      groups[0].length > 3 ||
      !groups.slice(1).every((g) => g.length === 3)
    ) {
      return null;
    }
    intPart = groups.join("");
    fracPart = f;
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? "." : ",";
    const parts = raw.split(sep);
    if (parts.length > 2) {
      // Pemisah berulang => ribuan: 1.000.000 / 1,000,000
      if (
        parts[0].length < 1 ||
        parts[0].length > 3 ||
        !parts.slice(1).every((p) => p.length === 3)
      ) {
        return null;
      }
      intPart = parts.join("");
    } else {
      const [i, f] = parts;
      if (f.length === 3 && i.length >= 1 && i.length <= 3 && i !== "0") {
        // 400.000 / 400,000 => ribuan (konvensi nominal rupiah)
        intPart = i + f;
      } else {
        intPart = i;
        fracPart = f;
      }
    }
  }

  intPart = intPart.replace(/^0+(?=\d)/, "");
  fracPart = fracPart.replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/**
 * Membaca nominal seperti "Rp400.000.000", "Rp. 400.000.000,-", "IDR 400,000,000.00",
 * "400000000", "USD 1.500,25". Teks terbilang dalam tanda kurung diabaikan.
 *
 * Mata uang tanpa simbol dianggap IDR. Karena itu "USD 400.000" tidak pernah
 * dianggap sama dengan "400.000".
 *
 * Mengembalikan null bila teks tidak dapat dibaca sebagai nominal murni;
 * pemanggil harus fallback ke perbandingan teks (lebih ketat, bukan lebih longgar).
 */
export function parseAmount(input: string): ParsedAmount | null {
  const stripped = stripCurrency(input.normalize("NFKC").replace(/\([^)]*\)/g, " "));
  if (stripped.ambiguous) return null;
  const currency = stripped.currency ?? "IDR";
  let s = stripped.rest;

  s = s.replace(/[,.]\s*-+\s*$/, "");
  s = s.replace(/[\s']/g, "");

  const value = canonicalNumber(s);
  if (value === null) return null;
  return { currency, value };
}

/** Format tampilan ala Indonesia: "IDR 400.000.000" / "USD 1.500,25". */
export function formatAmount(amount: ParsedAmount): string {
  const [intPart, frac] = amount.value.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount.currency} ${grouped}${frac ? `,${frac}` : ""}`;
}
