/**
 * Jangka Waktu: tanggal mulai & akhir (ISO yyyy-mm-dd) + durasi hari.
 * Semua perhitungan tanggal terpusat di sini agar konsisten di UI, PDF, Word.
 * Tidak bergantung pada React/Next; memakai UTC agar bebas pengaruh zona waktu/DST.
 */

import type { PeriodValue } from "@/lib/checklist/types";

/**
 * ATURAN HITUNG HARI (default teknis): selisih tanggal kalender
 * `tanggal akhir - tanggal mulai`, kedua ujung TIDAK dihitung inklusif.
 * Contoh: 01/10/2026 s.d. 01/10/2027 = 365 hari.
 * Bila ketentuan bisnis menetapkan aturan lain (mis. inklusif +1), ubah HANYA
 * fungsi `calculateDurationDays` di bawah ini.
 */
export const DURATION_RULE_NOTE =
  "Durasi = tanggal akhir dikurangi tanggal mulai (selisih kalender, tidak inklusif).";

const MS_PER_DAY = 86_400_000;

export type YmdParts = { year: number; month: number; day: number };

/** Parsing ketat "yyyy-mm-dd" yang benar-benar ada di kalender; selain itu null. */
export function parseIsoDate(value: string): YmdParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? { year, month, day } : null;
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

function toUtcMs(parts: YmdParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/** Tanggal ISO -> objek Date pada tengah malam UTC (aman dari pergeseran zona waktu), atau null. */
export function isoToUtcDate(value: string): Date | null {
  const parts = parseIsoDate(value);
  return parts ? new Date(toUtcMs(parts)) : null;
}

/** "2026-10-01" -> "01/10/2026"; "" bila tidak valid. */
export function isoToDisplay(value: string): string {
  const parts = parseIsoDate(value);
  if (!parts) return "";
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

/** "01/10/2026" -> "2026-10-01"; null bila tidak lengkap/tidak valid. */
export function displayToIso(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

/**
 * Durasi hari antara dua tanggal ISO. null bila salah satu tidak valid atau
 * tanggal akhir lebih awal dari tanggal mulai. Satu-satunya tempat aturan hitung hari.
 */
export function calculateDurationDays(start: string, end: string): number | null {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (!a || !b) return null;
  const diff = Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
  return diff < 0 ? null : diff;
}

export type PeriodStatus = {
  /** empty: kosong semua | partial: salah satu kosong | invalid: salah/terbalik | valid */
  state: "empty" | "partial" | "invalid" | "valid";
  startValid: boolean;
  endValid: boolean;
  startMessage?: string;
  endMessage?: string;
  /** Hanya terisi bila state "valid". */
  days: number | null;
};

export function getPeriodStatus(value: PeriodValue): PeriodStatus {
  const startFilled = value.start.trim() !== "";
  const endFilled = value.end.trim() !== "";
  const startOk = startFilled && isValidIsoDate(value.start);
  const endOk = endFilled && isValidIsoDate(value.end);

  const status: PeriodStatus = {
    state: "empty",
    startValid: startOk,
    endValid: endOk,
    days: null,
  };

  if (startFilled && !startOk) status.startMessage = "Tanggal mulai tidak valid";
  if (endFilled && !endOk) status.endMessage = "Tanggal akhir tidak valid";

  if (startOk && endOk) {
    const days = calculateDurationDays(value.start, value.end);
    if (days === null) {
      status.endValid = false;
      status.endMessage = "Tanggal akhir lebih awal dari tanggal mulai";
      status.state = "invalid";
    } else {
      status.state = "valid";
      status.days = days;
    }
    return status;
  }

  if (status.startMessage || status.endMessage) {
    status.state = "invalid";
  } else if (startFilled || endFilled) {
    status.state = "partial";
  }
  return status;
}

export function formatDuration(days: number | null): string {
  return days === null ? "Belum tersedia" : `${days} hari`;
}

/** "01/10/2026 s.d. 01/10/2027"; sisi yang belum diisi/tidak valid ditulis "-". */
export function formatPeriodRange(value: PeriodValue): string {
  const start = isoToDisplay(value.start);
  const end = isoToDisplay(value.end);
  if (!start && !end) return "";
  return `${start || "-"} s.d. ${end || "-"}`;
}
