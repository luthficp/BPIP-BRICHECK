/**
 * Pembaca teks Memorandum Analisa Bank Garansi (MABG) dan Putusan Bank Garansi (PTBG).
 *
 * Modul ini murni (tanpa React/DOM) dan hanya menerima TEKS hasil ekstraksi PDF.
 *
 * Prinsip pembacaan (sesuai spesifikasi fitur Upload PDF pada Critical Field Validation):
 *  - Berdasarkan KEYWORD dan KONTEKS, bukan nomor poin: nomor butir boleh berbeda, berulang,
 *    atau tidak ada; label dikenali dari katanya ("Nama Pengguna Jasa", "Plafond BG", dst.).
 *  - Bagian "Struktur, Tipe dan Syarat ..." dicari lebih dulu; bila isian tidak ada di sana,
 *    pencarian dilebarkan ke seluruh dokumen dan hasilnya diberi catatan agar diperiksa.
 *  - Bila ditemukan BEBERAPA nilai berbeda untuk satu field, field TIDAK diisi (ambigu) dan
 *    daftar kandidat dikembalikan; bila tidak ditemukan, field dibiarkan null. Tidak ada tebakan.
 *  - Setiap field berakhir pada salah satu dari tiga keadaan: terbaca jelas (Terisi), terbaca
 *    dengan alasan spesifik untuk diperiksa (nilai + `reasons`, atau `unresolved` tanpa nilai),
 *    atau tidak ditemukan. Alasan selalu berasal dari hasil bacaan aktual, tidak pernah dikarang.
 *  - Jenis Bank Garansi tidak dibaca langsung: ditentukan dari Tujuan Bank Garansi lewat mapping.
 *  - Kontra Garansi dan Underlying Document TIDAK dibaca; keduanya tetap diisi manual oleh ADK.
 *
 * Hasil hanyalah usulan pengisian. Perbandingan SESUAI / TIDAK SESUAI tetap dihitung oleh
 * validation engine yang sudah ada, bukan di sini.
 */

import { BG_TYPES, DEFAULT_CURRENCY } from "@/lib/checklist/config";
import { formatThousands, normalizeAmountString, parseMoneyText } from "@/lib/validation/amount";
import { normalizeDates } from "@/lib/validation/normalize";
import { calculateDurationDays } from "@/lib/validation/period";

import { parseTerbilang } from "./terbilang";

export type BgDocType = "mak" | "ptk";

/** Field Critical Field Validation yang dapat dibaca dari PDF. */
export type ExtractFieldId =
  | "jenisBg"
  | "tujuanBg"
  | "beneficiary"
  | "nilaiBg"
  | "jangkaWaktu"
  | "provisi"
  | "administrasi";

export type Found<T> = {
  value: T;
  /** Teks asli dari dokumen (sudah dirapikan spasinya), ditampilkan agar ADK bisa memverifikasi. */
  raw: string;
  /**
   * Alasan spesifik mengapa ADK perlu memeriksa nilai ini (mis. dibaca dari kalimat, angka dan
   * terbilang berbeda). Ada = status "Ditemukan, Perlu Konfirmasi"; tidak ada = "Terisi".
   * Setiap alasan berasal dari hasil bacaan aktual, tidak pernah dikarang.
   */
  reasons?: string[];
};

/** Informasi ditemukan pada dokumen, tetapi tidak dapat dijadikan nilai isian (kuning tanpa nilai). */
export type Unresolved = {
  /** Teks yang benar-benar terbaca dari PDF (kandidat nilai atau isi butir). */
  found: string[];
  /** Alasan nilai belum dapat dipastikan. */
  reason: string;
};

export type ParsedBgDocument = {
  /** Jenis dokumen menurut judul; null bila judul tidak dikenali. */
  detectedType: BgDocType | null;
  jenisBg: Found<string> | null;
  tujuanBg: Found<string> | null;
  beneficiary: Found<string> | null;
  nilaiBg: Found<{ currency: string; amount: string }> | null;
  jangkaWaktu: Found<{ start: string; end: string }> | null;
  /** Provisi / Administrasi: sudah dalam bentuk isian Biaya ("23,557,959" atau "1%"). */
  provisi: Found<string> | null;
  administrasi: Found<string> | null;
  /**
   * Field yang informasinya ditemukan tetapi tidak dapat dijadikan nilai (beberapa nilai berbeda,
   * isi butir tidak terbaca, Tujuan tidak cocok dengan mapping Jenis). Tidak diisi; kandidat dan
   * alasannya ditampilkan untuk diperiksa ADK.
   */
  unresolved: Partial<Record<ExtractFieldId, Unresolved>>;
  /** Alasan sebuah field tidak ditemukan sama sekali (hanya bila ada penjelasan yang pasti). */
  notes: Partial<Record<ExtractFieldId, string>>;
  /** Catatan netral per field yang bukan alasan konfirmasi (mis. selisih hitungan hari). */
  infos: Partial<Record<ExtractFieldId, string>>;
  /** Catatan untuk seluruh dokumen (mis. bagian Struktur tidak ditemukan). */
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* Pembersihan teks                                                     */
/* ------------------------------------------------------------------ */

const HEADER_FOOTER_LINE =
  /^(?:PT\.?\s+)?BANK RAKYAT INDONESIA\b|^KANTOR CABANG\b|^[A-Za-z]{2,5} BG an\.|^Putusan B\.?\s?G\b|^\d{1,3}$|^\d{1,3}\s*\/\s*\d{1,3}$/i;

function squash(s: string): string {
  return s.normalize("NFKC").replace(/[​­]/g, "").replace(/\s+/g, " ").trim();
}

/** Kunci perbandingan teks: huruf kecil tanpa spasi/tanda baca. */
function textKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Baris-baris bersih; header/footer halaman dan baris kosong dibuang. */
export function cleanLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(squash)
    .filter((line) => line !== "" && !HEADER_FOOTER_LINE.test(line));
}

/* ------------------------------------------------------------------ */
/* Jenis dokumen                                                        */
/* ------------------------------------------------------------------ */

export function detectDocType(text: string): BgDocType | null {
  const head = squash(text.slice(0, 1500)).toUpperCase();
  const mak = head.indexOf("MEMORANDUM ANALISA BANK GARANSI");
  const ptk = head.indexOf("PUTUSAN BANK GARANSI");
  if (mak === -1 && ptk === -1) return null;
  if (mak === -1) return "ptk";
  if (ptk === -1) return "mak";
  return mak < ptk ? "mak" : "ptk";
}

/* ------------------------------------------------------------------ */
/* Butir berlabel                                                       */
/* ------------------------------------------------------------------ */

type Item = {
  label: string;
  /** Sisa label setelah kata kunci (butir bernomor tanpa titik dua: nilai ada di label). */
  inlineValue: string;
  /** Nilai pada baris label itu sendiri. */
  firstLine: string;
  /** Nilai lengkap termasuk baris lanjutan. */
  value: string;
};

const SECTION_START = /Struktur,?\s*Tipe\s+dan\s+Syarat/i;
const SECTION_END = /^(?:[A-Z]\.\s*)?Syarat\s*-?\s*Syarat\s+Lain/i;
/** Awalan butir: "3.", "3)", "(3)", "a.", "-", "•". */
const BULLET = /^(?:\(?\d{1,2}[.)]\s+|[A-Za-z][.)]\s+|[-•*·]\s+)/;
const LABELED = /^([^:]{2,70}?)\s*:\s*(.*)$/;

function sectionLines(lines: string[]): string[] | null {
  const start = lines.findIndex((line) => SECTION_START.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => SECTION_END.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

type RawItem = {
  label: string;
  firstLine: string;
  continuation: string[];
  noColon: boolean;
  tailDropped?: boolean;
};

/**
 * Mengelompokkan baris menjadi butir. Butir dimulai oleh "label : nilai" (dengan atau tanpa
 * nomor) atau oleh baris bernomor; baris lain menyambung butir sebelumnya.
 */
function collectItems(lines: string[]): RawItem[] {
  const items: RawItem[] = [];
  for (const line of lines) {
    const numbered = BULLET.test(line);
    const body = line.replace(BULLET, "");
    const labeled = LABELED.exec(body);
    if (labeled) {
      items.push({ label: labeled[1].trim(), firstLine: labeled[2].trim(), continuation: [], noColon: false });
    } else if (numbered) {
      items.push({ label: body.trim(), firstLine: "", continuation: [], noColon: true });
    } else if (items.length > 0) {
      const last = items[items.length - 1];
      // Label dua baris ("Agunan/Kontra" + "Garansi"): sisa label bukan bagian nilai.
      const wrapped = !last.tailDropped && last.continuation.length === 0 && /^agunan\s*\/\s*kontra$/i.test(last.label);
      last.tailDropped = true;
      last.continuation.push(wrapped ? line.replace(/^Garansi\b\s*/i, "") : line);
    }
  }
  return items;
}

type ItemKey = "tujuan" | "jenis" | "beneficiary" | "nilai" | "periode" | "provisi" | "administrasi";

/** Kata kunci label (dicocokkan dari awal label). Kualifikator opsional ikut terbuang dari nilai. */
const LABEL_PATTERNS: Record<ItemKey, RegExp> = {
  tujuan: /^tujuan(?:\s+(?:penerbitan|bank\s+garansi|bg))?\b/i,
  jenis: /^jenis\s+(?:bank\s+garansi|bg)\b/i,
  beneficiary: /^(?:nama\s+)?pengguna\s+jasa\b|^beneficiary\b|^penerima\s+jaminan\b/i,
  nilai: /^(?:(?:plafond|jumlah|nilai)\s+(?:bg|bank\s+garansi)|plafond)\b/i,
  periode: /^jangka\s+waktu(?:\s+(?:bg|bank\s+garansi))?\b/i,
  provisi: /^(?:biaya\s+)?provisi(?:\s+(?:kredit|bg|bank\s+garansi))?\b/i,
  administrasi: /^(?:biaya\s+)?administrasi(?:\s+(?:kredit|bg|bank\s+garansi))?\b/i,
};

function itemsFor(lines: string[], key: ItemKey): Item[] {
  const found: Item[] = [];
  for (const raw of collectItems(lines)) {
    const match = LABEL_PATTERNS[key].exec(raw.label);
    if (!match) continue;
    const rest = raw.label.slice(match[0].length).trim();
    // Label berkolon harus persis kata kuncinya (boleh diikuti keterangan dalam kurung): "Tujuan
    // penggunaan fasilitas" bukan Tujuan BG dan "Provisi dan Administrasi" bukan Provisi.
    if (!raw.noColon && rest !== "" && !rest.startsWith("(")) continue;
    // Butir bernomor tanpa titik dua: nilai berada di sisa label itu sendiri.
    const firstLine = squash(raw.noColon ? `${rest} ${raw.firstLine}` : raw.firstLine);
    const value = squash(`${firstLine} ${raw.continuation.join(" ")}`);
    found.push({ label: raw.label, inlineValue: rest, firstLine, value });
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Mapping Tujuan Bank Garansi -> Jenis Bank Garansi                    */
/* ------------------------------------------------------------------ */

const JENIS_RULES: { pattern: RegExp; type: (typeof BG_TYPES)[number] }[] = [
  { pattern: /uang\s*muka|advance/, type: "Advance Payment Bond" },
  { pattern: /pelaksanaan|performance/, type: "Performance Bond" },
  { pattern: /pembayaran|payment/, type: "Payment Bond" },
  { pattern: /perbaikan|pemeliharaan|maintenance/, type: "Maintenance Bond" },
  { pattern: /penawaran|tender/, type: "Tender Bond" },
  { pattern: /\bbea\b|customs|kepabeanan/, type: "Customs Bond" },
];

/**
 * "Jaminan Pelaksanaan" -> "Performance Bond", "Jaminan Uang Muka" -> "Advance Payment Bond",
 * "Jaminan Pembayaran" -> "Payment Bond", "Jaminan Perbaikan" -> "Maintenance Bond",
 * "Jaminan Tender" -> "Tender Bond", "Jaminan Bea" -> "Customs Bond".
 * Huruf besar/kecil, spasi dan tanda baca diabaikan. Tidak cocok ATAU lebih dari satu jenis
 * cocok (ambigu) menghasilkan null: jenis tidak ditebak.
 */
export function mapJenisBg(raw: string): string | null {
  let l = squash(raw).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // Nama jenis berbahasa Inggris persis: pilih yang terpanjang ("Advance Payment Bond" memuat "Payment Bond").
  const english = BG_TYPES.filter((type) => l.includes(type.toLowerCase()));
  const longest = english.filter(
    (type) => !english.some((other) => other !== type && other.toLowerCase().includes(type.toLowerCase())),
  );
  if (longest.length === 1) return longest[0];
  if (longest.length > 1) return null;
  l = ` ${l} `;
  const matched = JENIS_RULES.filter((rule) => rule.pattern.test(l));
  return matched.length === 1 ? matched[0].type : null;
}

/** Frasa tujuan pada kalimat, mis. "Jaminan Pelaksanaan" (hanya dipakai bila tidak ada butir berlabel). */
const TUJUAN_PHRASE =
  /\b(Jaminan\s+(?:Pelaksanaan|Uang\s+Muka|Pembayaran|Perbaikan|Pemeliharaan|Penawaran|Tender|Bea(?:\s+Cukai)?))\b/gi;

/* ------------------------------------------------------------------ */
/* Pembaca nilai                                                        */
/* ------------------------------------------------------------------ */

type Money = { currency: string; amount: string };

/** Nominal pertama pada teks (kalimat terbilang dalam kurung dibuang). */
function readMoney(raw: string): Money | null {
  const withoutWords = raw.replace(/\([^)]*\)/g, " ");
  const match = /((?:Rp\.?|IDR|USD|EUR|SGD|JPY|GBP|AUD|MYR|CNY)\s*[\d][\d.,]*(?:\s*,-)?)/i.exec(withoutWords);
  if (match) {
    const parsed = parseMoneyText(match[1].replace(/\s*,-$/, ""));
    return parsed ? { currency: parsed.currency || DEFAULT_CURRENCY, amount: parsed.amount } : null;
  }
  // Angka murni tanpa simbol mata uang ("2.355.795.900,-"): hanya bila seluruh nilai berupa angka.
  const plain = /^\s*(\d[\d.,]*)(?:\s*,-)?\s*(?:\([^)]*\))?\s*$/.exec(raw);
  if (plain) {
    const parsed = parseMoneyText(plain[1]);
    return parsed ? { currency: parsed.currency || DEFAULT_CURRENCY, amount: parsed.amount } : null;
  }
  return null;
}

const MULTI = "MULTI";

/** Tepat dua tanggal -> periode. Tiga tanggal atau lebih -> MULTI (ambigu). Kurang -> null. */
function readPeriod(raw: string): { start: string; end: string } | typeof MULTI | null {
  const iso = normalizeDates(raw.replace(/\([^)]*\)/g, " "));
  const dates = [...new Set(iso.match(/\d{4}-\d{2}-\d{2}/g) ?? [])];
  if (dates.length === 2) return { start: dates[0], end: dates[1] };
  if (dates.length > 2) return MULTI;
  return null;
}

function formatFee(money: Money): string {
  const number = formatThousands(normalizeAmountString(money.amount));
  return money.currency === DEFAULT_CURRENCY ? number : `${money.currency} ${number}`;
}

/** Nominal setelah tanda "=" bila ada; bila tidak, nominal biasa; bila tidak, persentase. */
function readFee(raw: string): { value: string; percentOnly: boolean; money?: Money; moneyText?: string } | null {
  if (raw.includes("=")) {
    const afterEquals = raw.slice(raw.lastIndexOf("=") + 1);
    const money = readMoney(afterEquals) ?? parseMoneyText(afterEquals.trim());
    if (money) return { value: formatFee(money), percentOnly: false, money, moneyText: afterEquals };
  }
  const money = readMoney(raw);
  if (money) return { value: formatFee(money), percentOnly: false, money, moneyText: raw };
  const percent = /(\d+(?:[.,]\d+)?)\s*%/.exec(raw);
  if (percent) return { value: `${percent[1].replace(",", ".")}%`, percentOnly: true };
  return null;
}

/**
 * Nominal angka vs terbilang dalam kurung ("Rp. 500.000.000,- (Lima Ratus Juta Rupiah)").
 * Mengembalikan alasan HANYA bila terbilang berhasil dibaca sebagai angka dan nilainya berbeda;
 * terbilang yang tidak dapat dibaca (atau nominal berdesimal) tidak ditandai apa pun.
 */
function terbilangReason(text: string, money: Money): string | null {
  const digits = normalizeAmountString(money.amount);
  if (!/^\d+$/.test(digits) || digits.length > 15) return null;
  for (const group of text.matchAll(/\(([^)]{3,200})\)/g)) {
    const words = squash(group[1]);
    if (/\d/.test(words)) continue; // "(414 hari)" bukan terbilang rupiah
    const spelled = parseTerbilang(words);
    if (spelled === null || spelled === Number(digits)) continue;
    const label = money.currency === DEFAULT_CURRENCY ? "Rp" : money.currency;
    return `Nominal angka (${label} ${formatThousands(digits)}) berbeda dengan terbilang "${words}" yang terbaca ${label} ${formatThousands(String(spelled))}.`;
  }
  return null;
}

/** Tanggal numerik yang bisa dibaca dua cara (hari/bulan atau bulan/hari), mis. 03/04/2025. */
function numericDateReason(raw: string): string | null {
  for (const m of raw.matchAll(/(?<!\d)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?!\d)/g)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day >= 1 && day <= 12 && month >= 1 && month <= 12 && day !== month) {
      return `Tanggal ditulis numerik (${m[0]}) dan dibaca sebagai hari/bulan/tahun; bila dokumen memakai bulan/hari/tahun, tanggalnya berbeda.`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Penyelesaian satu field                                              */
/* ------------------------------------------------------------------ */

type Cand<T> = { value: T; raw: string; key: string; reasons: string[] };

/** null = tidak terbaca; "MULTI" pada key = nilainya sendiri ambigu. */
type Reader<T> = (text: string) => { value: T; key: string; reasons?: string[] } | null;

type Ctx = {
  all: string[];
  section: string[] | null;
};

type Resolution<T> = {
  found: Found<T> | null;
  ambiguous: string[] | null;
  /** Teks butir yang ditemukan tetapi nilainya tidak terbaca. */
  unreadable: string | null;
};

const REASON_SENTENCE =
  "Nilai dibaca dari kalimat, bukan dari butir berlabel, sehingga hubungan antara label dan nilainya kurang pasti.";
const REASON_OUTSIDE =
  'Nilai dibaca dari luar bagian "Struktur, Tipe dan Syarat", sehingga hubungan antara label dan nilainya kurang pasti.';
const REASON_NO_SECTION =
  'Bagian "Struktur, Tipe dan Syarat" tidak ditemukan, sehingga butir dicari dari seluruh dokumen berdasarkan kata kunci.';

function distinct<T>(cands: Cand<T>[]): Cand<T>[] {
  const seen = new Set<string>();
  return cands.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

/**
 * Mencari satu field: butir berlabel pada bagian Struktur, lalu kalimat pada bagian itu, lalu
 * (bila belum ada) butir berlabel dan kalimat pada seluruh dokumen. Pass pertama yang
 * menghasilkan kandidat menentukan hasil; beberapa kandidat berbeda = ambigu, tidak diisi.
 */
function resolve<T>(
  ctx: Ctx,
  opts: {
    keys: ItemKey[];
    read: Reader<T>;
    /** Pola kalimat; grup 1 (atau seluruh kecocokan) dibaca oleh `read`. */
    sentence?: RegExp[];
    /** Kecocokan kalimat dilewati bila teks tepat sebelumnya cocok (mis. "provisi dan" sebelum "administrasi"). */
    sentenceSkipAfter?: RegExp;
    /** Hanya baris pertama butir (nilai pendek, mis. tujuan). */
    firstLineOnly?: boolean;
  },
): Resolution<T> {
  type Pass = { kind: "label" | "sentence"; lines: string[]; reason?: string };
  const passes: Pass[] = ctx.section
    ? [
        { kind: "label", lines: ctx.section },
        { kind: "sentence", lines: ctx.section, reason: REASON_SENTENCE },
        { kind: "label", lines: ctx.all, reason: REASON_OUTSIDE },
        { kind: "sentence", lines: ctx.all, reason: REASON_OUTSIDE },
      ]
    : [
        { kind: "label", lines: ctx.all, reason: REASON_NO_SECTION },
        { kind: "sentence", lines: ctx.all, reason: REASON_SENTENCE },
      ];

  let unreadable: string | null = null;

  for (const pass of passes) {
    const cands: Cand<T>[] = [];
    const push = (read: { value: T; key: string; reasons?: string[] }, raw: string) =>
      cands.push({ ...read, raw, reasons: [...(pass.reason ? [pass.reason] : []), ...(read.reasons ?? [])] });
    if (pass.kind === "label") {
      for (const key of opts.keys) {
        for (const item of itemsFor(pass.lines, key)) {
          const text = opts.firstLineOnly && item.firstLine ? item.firstLine : item.value;
          const read = opts.read(text);
          if (read) push(read, text);
          else if (text) unreadable ??= text;
        }
        if (cands.length > 0) break; // label prioritas pertama yang berhasil menentukan
      }
    } else if (opts.sentence) {
      const text = pass.lines.join(" ");
      for (const pattern of opts.sentence) {
        for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
          const before = text.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
          if (opts.sentenceSkipAfter?.test(before)) continue;
          const part = squash(match[1] ?? match[0]);
          const read = opts.read(part);
          if (read) push(read, part);
        }
      }
    }

    const unique = distinct(cands);
    if (unique.length === 1) {
      const c = unique[0];
      return {
        found: { value: c.value, raw: c.raw, ...(c.reasons.length > 0 ? { reasons: c.reasons } : {}) },
        ambiguous: null,
        unreadable: null,
      };
    }
    if (unique.length > 1) {
      return { found: null, ambiguous: unique.slice(0, 4).map((c) => c.raw), unreadable: null };
    }
  }
  return { found: null, ambiguous: null, unreadable };
}

/* ------------------------------------------------------------------ */
/* Pintu masuk                                                          */
/* ------------------------------------------------------------------ */

export function emptyParsed(): ParsedBgDocument {
  return {
    detectedType: null,
    jenisBg: null,
    tujuanBg: null,
    beneficiary: null,
    nilaiBg: null,
    jangkaWaktu: null,
    provisi: null,
    administrasi: null,
    unresolved: {},
    notes: {},
    infos: {},
    warnings: [],
  };
}

const readText: Reader<string> = (text) => {
  const value = squash(text);
  return value ? { value, key: textKey(value) } : null;
};

const CURRENCY = "(?:Rp\\.?|IDR|USD|EUR|SGD|JPY|GBP|AUD|MYR|CNY)";
const CONNECT = "(?:\\s*(?:sebesar|senilai|adalah|sejumlah|=|:))?";

export function parseBgDocument(text: string): ParsedBgDocument {
  const result = emptyParsed();
  result.detectedType = detectDocType(text);

  const all = cleanLines(text);
  const section = sectionLines(all);
  if (!section) {
    result.warnings.push(
      'Bagian "Struktur, Tipe dan Syarat" tidak ditemukan; seluruh dokumen dicari berdasarkan kata kunci dan hasilnya perlu diperiksa.',
    );
  }
  const ctx: Ctx = { all, section };

  /** Meneruskan hasil resolve ke `result`; `what` = apa yang diharapkan dari isi butir. */
  const assign = <T>(
    id: ExtractFieldId,
    label: string,
    what: string,
    resolution: Resolution<T>,
    set: (found: Found<T>) => void,
  ) => {
    if (resolution.found) {
      set(resolution.found);
    } else if (resolution.ambiguous) {
      result.unresolved[id] = {
        found: resolution.ambiguous,
        reason: `Ditemukan ${resolution.ambiguous.length} nilai berbeda untuk ${label}; sistem tidak memilih salah satunya.`,
      };
    } else if (resolution.unreadable) {
      result.unresolved[id] = {
        found: [resolution.unreadable.slice(0, 160)],
        reason: `Butir ${label} ditemukan, tetapi isinya tidak dapat dibaca sebagai ${what}; nilainya belum dapat dipastikan.`,
      };
    }
  };

  /* ---- Tujuan Bank Garansi ("Tujuan ..." atau butir "Jenis Bank Garansi : Jaminan Pelaksanaan") ---- */
  const tujuan = resolve(ctx, {
    keys: ["tujuan", "jenis"],
    read: readText,
    firstLineOnly: true,
    sentence: [TUJUAN_PHRASE],
  });
  // Frasa kalimat dinormalkan ("jaminan  pelaksanaan" -> "Jaminan Pelaksanaan").
  if (tujuan.found?.reasons?.some((r) => r === REASON_SENTENCE || r === REASON_OUTSIDE)) {
    const v = tujuan.found.value.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    tujuan.found = { ...tujuan.found, value: v, raw: tujuan.found.raw };
  }
  assign("tujuanBg", "Tujuan Bank Garansi", "teks", tujuan, (found) => {
    result.tujuanBg = found;
  });

  /* ---- Jenis Bank Garansi: dari mapping Tujuan Bank Garansi ---- */
  if (result.tujuanBg) {
    const mapped = mapJenisBg(result.tujuanBg.value);
    if (mapped) {
      result.jenisBg = {
        value: mapped,
        raw: result.tujuanBg.raw,
        ...(result.tujuanBg.reasons ? { reasons: result.tujuanBg.reasons } : {}),
      };
    } else {
      result.unresolved.jenisBg = {
        found: [result.tujuanBg.raw],
        reason: `Tujuan "${result.tujuanBg.value}" tidak cocok (atau cocok lebih dari satu) dengan mapping Jenis Bank Garansi, sehingga Jenis belum dapat ditentukan.`,
      };
    }
  } else if (result.unresolved.tujuanBg) {
    const { found } = result.unresolved.tujuanBg;
    result.unresolved.jenisBg = {
      found,
      reason: "Tujuan Bank Garansi belum dapat dipastikan, sehingga Jenis Bank Garansi belum dapat ditentukan.",
    };
  } else {
    result.notes.jenisBg = "Tujuan Bank Garansi tidak ditemukan, sehingga Jenis Bank Garansi tidak dapat ditentukan.";
  }

  /* ---- Beneficiary: "Nama Pengguna Jasa" ---- */
  assign("beneficiary", "Nama Pengguna Jasa", "teks", resolve(ctx, { keys: ["beneficiary"], read: readText }), (found) => {
    result.beneficiary = found;
  });

  /* ---- Nilai Bank Garansi: "Plafond BG" / "Jumlah BG" ---- */
  assign(
    "nilaiBg",
    "Plafond BG",
    "nominal",
    resolve<Money>(ctx, {
      keys: ["nilai"],
      read: (text) => {
        const money = readMoney(text);
        if (!money) return null;
        const reason = terbilangReason(text, money);
        return {
          value: money,
          key: `${money.currency}:${normalizeAmountString(money.amount)}`,
          ...(reason ? { reasons: [reason] } : {}),
        };
      },
      sentence: [
        new RegExp(
          `\\b(?:plafond(?:\\s+(?:bg|bank\\s+garansi))?|jumlah\\s+(?:bg|bank\\s+garansi)|nilai\\s+(?:bg|bank\\s+garansi))${CONNECT}\\s*(${CURRENCY}\\s*\\d[\\d.,]*)`,
          "gi",
        ),
      ],
    }),
    (found) => {
      result.nilaiBg = found;
    },
  );

  /* ---- Jangka Waktu: "Jangka Waktu BG" ---- */
  assign(
    "jangkaWaktu",
    "Jangka Waktu BG",
    "periode (tepat dua tanggal)",
    resolve<{ start: string; end: string }>(ctx, {
      keys: ["periode"],
      read: (text) => {
        const period = readPeriod(text);
        if (period === null) return null;
        if (period === MULTI) return { value: { start: "", end: "" }, key: `${MULTI}:${textKey(text)}` };
        const reason = numericDateReason(text);
        return { value: period, key: `${period.start}|${period.end}`, ...(reason ? { reasons: [reason] } : {}) };
      },
      sentence: [/\bjangka\s+waktu(?:\s+(?:bg|bank\s+garansi))?\s*(?:selama|adalah|:|=)?\s*(.{0,140})/gi],
    }),
    (found) => {
      // Tiga tanggal atau lebih pada satu butir: bukan periode yang pasti -> kuning tanpa nilai.
      if (found.value.start === "" && found.value.end === "") {
        result.unresolved.jangkaWaktu = {
          found: [found.raw],
          reason: "Ditemukan lebih dari dua tanggal pada Jangka Waktu BG; sistem tidak menentukan tanggal mulai dan akhirnya.",
        };
        return;
      }
      result.jangkaWaktu = found;
      const stated = /\((\d{1,4})\s*hari\)/i.exec(found.raw);
      const computed = calculateDurationDays(found.value.start, found.value.end);
      if (stated && computed !== null && Number(stated[1]) !== computed) {
        result.infos.jangkaWaktu = `Dokumen menyebut ${stated[1]} hari, sedangkan aplikasi menghitung ${computed} hari (selisih tanggal, tidak inklusif). Yang dibandingkan adalah tanggalnya.`;
      }
    },
  );

  /* ---- Biaya: Provisi dan Administrasi (terpisah; kata "Kredit" tidak wajib) ---- */
  const feeReader: Reader<string> = (text) => {
    const fee = readFee(text);
    if (!fee) return null;
    const reasons: string[] = [];
    if (fee.percentOnly) {
      reasons.push(
        "Hanya persentase yang terbaca (tanpa nominal rupiah); periksa apakah dokumen lain memakai bentuk yang sama agar dapat dibandingkan.",
      );
    } else if (fee.money && fee.moneyText) {
      const reason = terbilangReason(fee.moneyText, fee.money);
      if (reason) reasons.push(reason);
    }
    return { value: fee.value, key: fee.value, ...(reasons.length > 0 ? { reasons } : {}) };
  };
  // "Provisi dan Administrasi Rp ..." adalah nilai gabungan, bukan nilai masing-masing biaya.
  const COMBINED_FEE = /(?:provisi|administrasi)(?:\s+(?:kredit|bg|bank\s+garansi))?\s*(?:dan|&|\/|,)\s*$/i;
  const feeSentence = (word: string) =>
    new RegExp(
      `\\b(?:biaya\\s+)?${word}(?:\\s+(?:kredit|bg|bank\\s+garansi))?${CONNECT}\\s*((?:\\d+(?:[.,]\\d+)?\\s*%[^=]{0,60}=\\s*)?${CURRENCY}\\s*\\d[\\d.,]*|\\d+(?:[.,]\\d+)?\\s*%)`,
      "gi",
    );
  assign(
    "provisi",
    "Provisi",
    "nominal atau persentase",
    resolve(ctx, { keys: ["provisi"], read: feeReader, sentence: [feeSentence("provisi")], sentenceSkipAfter: COMBINED_FEE }),
    (found) => {
      result.provisi = found;
    },
  );
  assign(
    "administrasi",
    "Administrasi",
    "nominal atau persentase",
    resolve(ctx, { keys: ["administrasi"], read: feeReader, sentence: [feeSentence("administrasi")], sentenceSkipAfter: COMBINED_FEE }),
    (found) => {
      result.administrasi = found;
    },
  );

  return result;
}
