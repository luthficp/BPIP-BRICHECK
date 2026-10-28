/**
 * Membaca angka terbilang bahasa Indonesia ("Lima Ratus Juta Rupiah" -> 500000000) untuk
 * memeriksa apakah nominal angka dan terbilang pada dokumen konsisten.
 *
 * Pembaca ini sengaja ketat: kata yang tidak dikenal, urutan satuan yang janggal, atau bagian
 * desimal membuat hasilnya null (tidak dapat dipastikan). Pemanggil hanya boleh menandai
 * ketidaksesuaian bila hasilnya angka; null tidak pernah dianggap sebagai "berbeda".
 */

const DIGITS: Record<string, number> = {
  nol: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
};

const SCALES: Record<string, number> = {
  ribu: 1e3,
  juta: 1e6,
  miliar: 1e9,
  milyar: 1e9,
  triliun: 1e12,
};

/** "seratus" = "satu ratus", "sebelas" = "satu belas", "seribu" = "satu ribu", dst. */
const SE_PREFIX = /^se(ratus|ribu|puluh|belas|juta|miliar|milyar|triliun)$/;

export function parseTerbilang(text: string): number | null {
  const tokens = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const words: string[] = [];
  for (const token of tokens) {
    const match = SE_PREFIX.exec(token);
    if (match) words.push("satu", match[1]);
    else words.push(token);
  }
  while (words.length > 0 && words[words.length - 1] === "rupiah") words.pop();
  if (words.length === 0) return null;

  let total = 0;
  let group = 0; // jumlah di bawah seribu pada kelompok yang sedang dibaca
  let unit: number | null = null; // satuan yang menunggu pengali (puluh/ratus/belas) atau berdiri sendiri
  let lastRank = 4; // ratus=3, puluh/belas=2, satuan=1: harus menurun dalam satu kelompok
  let lastScale = Number.POSITIVE_INFINITY;

  for (const word of words) {
    if (word in DIGITS) {
      if (unit !== null || lastRank <= 1) return null;
      unit = DIGITS[word];
    } else if (word === "belas") {
      if (unit === null || lastRank <= 2) return null;
      group += 10 + unit;
      unit = null;
      lastRank = 1; // sesudah "belas" tidak boleh ada satuan lagi
    } else if (word === "puluh" || word === "ratus") {
      const rank = word === "ratus" ? 3 : 2;
      if (unit === null || unit === 0 || lastRank <= rank) return null;
      group += unit * (word === "ratus" ? 100 : 10);
      unit = null;
      lastRank = rank;
    } else if (word in SCALES) {
      const scale = SCALES[word];
      const chunk = group + (unit ?? 0);
      if (chunk === 0 || scale >= lastScale) return null;
      total += chunk * scale;
      group = 0;
      unit = null;
      lastRank = 4;
      lastScale = scale;
    } else {
      return null;
    }
  }

  const value = total + group + (unit ?? 0);
  return Number.isSafeInteger(value) ? value : null;
}
