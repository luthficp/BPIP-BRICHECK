import { DEFAULT_CURRENCY, KONTRA_TYPES, SOURCE_ORDER, getKontraTypeDef } from "./config";
import { generateId } from "./factory";
import type {
  AmountValue,
  KontraDetail,
  KontraFieldValue,
  KontraItem,
  KontraType,
  SourceKey,
} from "./types";

/**
 * Kontra Garansi: daftar item (jenis + jumlah) yang berlaku untuk transaksi.
 * Setiap item punya detail untuk ketiga sumber, sehingga ketiga sumber
 * dibandingkan terhadap item yang sama. Modul ini murni (tanpa React) agar
 * mudah diuji.
 */

export type KontraCounts = Record<KontraType, number>;

export function emptyKontraCounts(): KontraCounts {
  return { fixedAsset: 0, kendaraan: 0, cashCollateral: 0, asuransi: 0 };
}

export function emptyAmountValue(): AmountValue {
  return { currency: DEFAULT_CURRENCY, amount: "" };
}

/** Detail kosong sesuai field wajib jenisnya. */
export function emptyKontraDetail(type: KontraType): KontraDetail {
  const detail: KontraDetail = {};
  for (const field of getKontraTypeDef(type).fields) {
    detail[field.key] = field.kind === "currency" ? emptyAmountValue() : "";
  }
  return detail;
}

export function createKontraItem(type: KontraType): KontraItem {
  return {
    id: generateId(),
    type,
    values: {
      underlyingDocument: emptyKontraDetail(type),
      ptk: emptyKontraDetail(type),
      mak: emptyKontraDetail(type),
    },
  };
}

/** Nilai teks field detail ("" bila belum ada). */
export function getKontraText(detail: KontraDetail | undefined, key: string): string {
  const value = detail?.[key];
  return typeof value === "string" ? value : "";
}

/** Nilai nominal field detail (default IDR kosong). */
export function getKontraAmount(detail: KontraDetail | undefined, key: string): AmountValue {
  const value = detail?.[key];
  if (value && typeof value === "object") {
    return {
      currency: typeof value.currency === "string" && value.currency ? value.currency : DEFAULT_CURRENCY,
      amount: typeof value.amount === "string" ? value.amount : "",
    };
  }
  return emptyAmountValue();
}

function isFilledValue(value: KontraFieldValue | undefined): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (value && typeof value === "object") return typeof value.amount === "string" && /\d/.test(value.amount);
  return false;
}

/** Apakah item sudah berisi data (pada sumber mana pun). Dipakai untuk konfirmasi penghapusan. */
export function kontraItemHasData(item: KontraItem): boolean {
  return SOURCE_ORDER.some((source) =>
    getKontraTypeDef(item.type).fields.some((field) => isFilledValue(item.values?.[source]?.[field.key])),
  );
}

export function countKontraByType(items: readonly KontraItem[]): KontraCounts {
  const counts = emptyKontraCounts();
  for (const item of items) counts[item.type] += 1;
  return counts;
}

export function totalKontraCount(counts: KontraCounts): number {
  return KONTRA_TYPES.reduce((sum, def) => sum + counts[def.key], 0);
}

/** "Fixed Asset #1", "Fixed Asset #2", "Kendaraan #1" ... (nomor per jenis, urut daftar). */
export function kontraItemTitles(items: readonly KontraItem[]): Map<string, string> {
  const seen = emptyKontraCounts();
  const titles = new Map<string, string>();
  for (const item of items) {
    seen[item.type] += 1;
    titles.set(item.id, `${getKontraTypeDef(item.type).label} #${seen[item.type]}`);
  }
  return titles;
}

/** Ringkasan jumlah per jenis, mis. "Fixed Asset × 2, Kendaraan × 1". Kosong bila semua nol. */
export function describeKontraCounts(counts: KontraCounts): string {
  return KONTRA_TYPES.filter((def) => counts[def.key] > 0)
    .map((def) => `${def.label} × ${counts[def.key]}`)
    .join(", ");
}

/** Ringkasan konfigurasi item. Kosong bila belum ada item. */
export function describeKontraConfig(items: readonly KontraItem[]): string {
  return describeKontraCounts(countKontraByType(items));
}

export type KontraPlan = {
  /** Daftar item hasil konfigurasi (dikelompokkan per jenis menurut urutan jenis). */
  items: KontraItem[];
  /** Item lama yang tetap dipertahankan beserta datanya. */
  kept: KontraItem[];
  /** Jumlah item baru (kosong). */
  added: number;
  /** Item yang hilang karena jumlah dikurangi. */
  removed: KontraItem[];
  /** Subset `removed` yang sudah berisi data (butuh konfirmasi eksplisit). */
  removedWithData: KontraItem[];
};

/**
 * Menyesuaikan daftar item dengan jumlah yang diinginkan per jenis.
 * Item yang sudah ada dipertahankan (data tidak diubah); bila jumlah dikurangi,
 * item TERAKHIR pada jenis itu yang dilepas; bila ditambah, item kosong baru
 * ditambahkan di akhir kelompok jenisnya.
 */
export function planKontraConfig(
  current: readonly KontraItem[],
  desired: KontraCounts,
): KontraPlan {
  const items: KontraItem[] = [];
  const kept: KontraItem[] = [];
  const removed: KontraItem[] = [];
  let added = 0;

  for (const def of KONTRA_TYPES) {
    const existing = current.filter((item) => item.type === def.key);
    const want = Math.max(0, Math.floor(desired[def.key] ?? 0));
    const keep = existing.slice(0, want);
    kept.push(...keep);
    removed.push(...existing.slice(want));
    items.push(...keep);
    for (let n = existing.length; n < want; n++) {
      items.push(createKontraItem(def.key));
      added += 1;
    }
  }

  return { items, kept, added, removed, removedWithData: removed.filter(kontraItemHasData) };
}

/** Mengubah satu field detail (teks, atau sebagian nilai nominal). Mengembalikan item baru. */
export function patchKontraItemValue(
  item: KontraItem,
  source: SourceKey,
  key: string,
  value: string | Partial<AmountValue>,
): KontraItem {
  const def = getKontraTypeDef(item.type).fields.find((field) => field.key === key);
  if (!def) return item;
  const detail = { ...(item.values?.[source] ?? emptyKontraDetail(item.type)) };
  if (def.kind === "currency") {
    detail[key] = { ...getKontraAmount(detail, key), ...(typeof value === "string" ? {} : value) };
  } else {
    detail[key] = typeof value === "string" ? value : "";
  }
  return { ...item, values: { ...item.values, [source]: detail } };
}

/* ------------------------------------------------------------------ */
/* Ringkasan dampak perubahan pilihan (untuk dialog konfirmasi)         */
/* ------------------------------------------------------------------ */

export type KontraRemovedGroup = {
  type: KontraType;
  label: string;
  /** Jumlah item jenis ini yang akan dihapus. */
  count: number;
  /** Judul item yang dihapus pada daftar saat ini, mis. "Fixed Asset #2". */
  titles: string[];
  /** Berapa dari item tersebut yang sudah berisi data. */
  withData: number;
};

export type KontraChangeSummary = {
  /** Item yang akan dihapus, dikelompokkan per jenis (urutan jenis). */
  removed: KontraRemovedGroup[];
  /** Item baru (kosong) per jenis. */
  added: { type: KontraType; label: string; count: number }[];
  /** Total item yang akan dihapus. */
  removedTotal: number;
};

/**
 * Merangkum apa yang akan terjadi bila `desired` diterapkan pada daftar item saat ini:
 * jenis dan jumlah item yang dihapus (dengan judulnya, dan mana yang sudah berisi), serta item
 * baru. Tidak mengubah apa pun; dipakai untuk dialog konfirmasi.
 */
export function summarizeKontraChange(
  current: readonly KontraItem[],
  desired: KontraCounts,
): KontraChangeSummary {
  const plan = planKontraConfig(current, desired);
  const titles = kontraItemTitles(current);
  const removed: KontraRemovedGroup[] = [];
  const added: KontraChangeSummary["added"] = [];

  for (const def of KONTRA_TYPES) {
    const gone = plan.removed.filter((item) => item.type === def.key);
    if (gone.length > 0) {
      removed.push({
        type: def.key,
        label: def.label,
        count: gone.length,
        titles: gone.map((item) => titles.get(item.id) ?? def.label),
        withData: gone.filter(kontraItemHasData).length,
      });
    }
    const before = current.filter((item) => item.type === def.key).length;
    const after = plan.items.filter((item) => item.type === def.key).length;
    if (after > before) added.push({ type: def.key, label: def.label, count: after - before });
  }

  return { removed, added, removedTotal: plan.removed.length };
}
