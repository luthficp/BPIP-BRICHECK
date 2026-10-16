/**
 * Format tanggal/waktu Indonesia yang konsisten di dashboard, print, PDF, Word.
 * Contoh: "08 Oktober 2026, 16:03 WIB".
 */

const MONTHS_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

type FormatOptions = {
  /** Bulan disingkat (Okt) - dipakai pada tabel padat. */
  short?: boolean;
  /** IANA time zone; default mengikuti perangkat. */
  timeZone?: string;
};

function resolveTimeZone(timeZone?: string): string {
  if (timeZone) return timeZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function zoneLabel(date: Date, timeZone: string): string {
  if (timeZone === "Asia/Jakarta" || timeZone === "Asia/Pontianak") return "WIB";
  if (timeZone === "Asia/Makassar") return "WITA";
  if (timeZone === "Asia/Jayapura") return "WIT";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function getParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date, options: FormatOptions = {}): string {
  const date = toDate(value);
  if (!date) return "-";
  const tz = resolveTimeZone(options.timeZone);
  const p = getParts(date, tz);
  const month = (options.short ? MONTHS_SHORT : MONTHS_LONG)[p.month - 1];
  return `${String(p.day).padStart(2, "0")} ${month} ${p.year}`;
}

export function formatTimestamp(value: string | Date, options: FormatOptions = {}): string {
  const date = toDate(value);
  if (!date) return "-";
  const tz = resolveTimeZone(options.timeZone);
  const p = getParts(date, tz);
  const time = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  return `${formatDate(date, options)}, ${time} ${zoneLabel(date, tz)}`;
}

/** Nama file aman: "Checklist-BG_PT-Inbisco_20261008". */
export function buildFileBase(atasNama: string, isoDate: string | Date): string {
  const slug =
    atasNama
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40) || "Tanpa-Nama";
  const date = toDate(isoDate) ?? new Date();
  const p = getParts(date, resolveTimeZone());
  const stamp = `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
  return `Checklist-BG_${slug}_${stamp}`;
}

/** Id pendek untuk dicetak pada dokumen. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
