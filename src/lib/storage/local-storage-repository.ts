import { hasRetiredPointData, migrateChecklist } from "@/lib/checklist/migrate";
import { SCHEMA_VERSION, type BankGuaranteeChecklist } from "@/lib/checklist/types";
import { resetHistoryOnce } from "./history-reset";
import type { ChecklistRepository } from "./repository";

/** Kunci tidak diganti agar draft lama tetap ditemukan; versi skema ada di dalam payload. */
const STORAGE_KEY = "bri-bg-checklist:v1";
/** Salinan data mentah sebelum migrasi skema 2 (disimpan sekali, tidak pernah ditimpa). */
const BACKUP_KEY = "bri-bg-checklist:v1:backup-before-schema-2";

type StoredShape = {
  version: number;
  items: unknown[];
};

/**
 * Salinan data mentah sebelum skema 6 membuang baris bawaan dari tiga poin Document Verification
 * yang dihapus (hanya dibuat bila baris itu sudah berisi isian; disimpan sekali, tidak ditimpa).
 */
const BACKUP_KEY_SCHEMA_6 = "bri-bg-checklist:v1:backup-before-schema-6";

function backupOnce(raw: string, key: string = BACKUP_KEY): void {
  try {
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, raw);
    }
  } catch {
    // Backup bersifat best-effort; kegagalan tidak boleh menghentikan aplikasi.
  }
}

/** Pembersihan riwayat lama cukup diperiksa sekali per pemuatan halaman. */
let historyResetChecked = false;

function readAll(key: string = STORAGE_KEY): BankGuaranteeChecklist[] {
  if (typeof window === "undefined") return [];
  // Pembersihan riwayat, cadangan migrasi: hanya untuk kunci data bawaan (mode lokal).
  const isDefault = key === STORAGE_KEY;
  if (isDefault && !historyResetChecked) {
    historyResetChecked = true;
    try {
      resetHistoryOnce(window.localStorage, STORAGE_KEY);
    } catch {
      // Storage tidak tersedia: lanjut tanpa pembersihan.
    }
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (!Array.isArray(parsed.items)) return [];

    const needsMigration =
      parsed.version !== SCHEMA_VERSION ||
      parsed.items.some(
        (item) =>
          typeof item !== "object" ||
          item === null ||
          (item as { schemaVersion?: unknown }).schemaVersion !== SCHEMA_VERSION,
      );
    if (needsMigration && isDefault) {
      backupOnce(raw);
      if (parsed.items.some(hasRetiredPointData)) backupOnce(raw, BACKUP_KEY_SCHEMA_6);
    }

    return parsed.items
      .map((item) => migrateChecklist(item))
      .filter((item): item is BankGuaranteeChecklist => item !== null);
  } catch {
    return [];
  }
}

function writeAll(items: BankGuaranteeChecklist[], key: string = STORAGE_KEY): void {
  const payload: StoredShape = { version: SCHEMA_VERSION, items };
  window.localStorage.setItem(key, JSON.stringify(payload));
}

/**
 * Repository berbasis localStorage pada kunci tertentu.
 * Catatan: operasi dikerjakan sinkron di dalam async function agar penyimpanan
 * terjadi seketika (penting untuk flush saat tab ditutup).
 * Data skema lama dimigrasi saat dibaca (lihat checklist/migrate.ts).
 *
 * Kunci bawaan = mode lokal (tanpa Supabase). Kunci lain dipakai sebagai cache per-akun pada mode Supabase.
 */
export type LocalCache = ChecklistRepository & {
  /** Ganti seluruh isi cache sekaligus (sinkron). */
  replaceAll(items: BankGuaranteeChecklist[]): void;
  /** Baca sinkron. */
  readAllSync(): BankGuaranteeChecklist[];
  /** Hapus seluruh cache (sinkron). */
  clear(): void;
};

export function createLocalStorageRepository(key: string = STORAGE_KEY): LocalCache {
  return {
    async list() {
      return readAll(key);
    },

    async get(id) {
      return readAll(key).find((item) => item.id === id) ?? null;
    },

    async save(checklist) {
      const items = readAll(key);
      const index = items.findIndex((item) => item.id === checklist.id);
      if (index === -1) items.push(checklist);
      else items[index] = checklist;
      writeAll(items, key);
    },

    async remove(id) {
      writeAll(
        readAll(key).filter((item) => item.id !== id),
        key,
      );
    },

    replaceAll(items) {
      writeAll(items, key);
    },
    readAllSync() {
      return readAll(key);
    },
    clear() {
      window.localStorage.removeItem(key);
    },
  };
}

export const localStorageRepository: LocalCache = createLocalStorageRepository(STORAGE_KEY);

export const STORAGE_EVENT_KEY = STORAGE_KEY;
