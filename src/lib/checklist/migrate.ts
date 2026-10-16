import {
  CRITICAL_FIELD_DEFS,
  DEFAULT_CURRENCY,
  defaultFeeComponents,
  DOCUMENT_CATEGORIES,
  FALLBACK_DOCUMENT_CATEGORY,
  KONTRA_TYPES,
  getCategoryStaticItems,
  REMOVED_DOCUMENT_CATEGORY_KEYS,
  SOURCE_ORDER,
  getKontraTypeDef,
  type CriticalFieldDef,
} from "./config";
import { normalizeDocumentName, resolveCategoryKey } from "./documents";
import {
  createEmptyCriticalField,
  createEmptyDocuments,
  deriveTaskName,
  generateId,
  nowIso,
} from "./factory";
import { emptyFeeValueFor } from "./fees";
import { emptyKontraDetail } from "./kontra";
import {
  SCHEMA_VERSION,
  type AmountValue,
  type BankGuaranteeChecklist,
  type CriticalField,
  type DocumentVerification,
  type FeeComponentDef,
  type FeesCriticalField,
  type KontraCriticalField,
  type KontraDetail,
  type KontraItem,
  type KontraType,
  type PerSourceCriticalField,
  type PeriodValue,
  type SourceKey,
} from "./types";
import { toCanonicalAmount } from "@/lib/validation/amount";
import { normalizeDates, parseAmount } from "@/lib/validation/normalize";
import { isValidIsoDate } from "@/lib/validation/period";
import { recalculateMatches } from "@/lib/validation/three-way-match";

/**
 * Migrasi data tersimpan ke skema terbaru.
 *
 * - Skema 1 (6 field, semua nilai berupa teks) -> skema 2 (8 field, nilai terstruktur).
 * - Skema 5 -> skema 6: tiga poin duplikat dihapus dari Document Verification (Surat Permohonan
 *   Bank Garansi dari Beneficiary, Surat Pengajuan Bank Garansi dari Applicant, dan Perjanjian
 *   Kerja Sama sebagai poin terpisah). Baris bawaan ketiganya dibuang; dokumen tambahan ADK di
 *   dalamnya TIDAK dibuang, melainkan dipindahkan ke "Surat-Surat Lainnya". Subpoin bernama sama
 *   di Underlying Transaction dan Perjanjian Kerja Sama di Identitas Beneficiary tidak tersentuh.
 * - Skema 4 -> skema 5: kategori Identitas Beneficiary dan Underlying Transaction ditambahkan
 *   (belum diperiksa). Biaya: komponen bawaan tinggal Provisi & Administrasi; Notaris / Lainnya
 *   lama yang berisi data pada sumber mana pun menjadi field Biaya tambahan (bernama sama, nilai
 *   ikut), sedangkan yang kosong di ketiga sumber dibuang.
 * - Skema 3 -> skema 4: (baris langsung poin 1-3 yang kini sudah dihapus pada skema 6).
 * - Skema 2 -> skema 3 (revisi 13 Oktober 2026):
 *     * Dokumen: 8 dokumen lama dipetakan ke kategori baru (status & keterangan ikut);
 *       yang tidak ada padanannya menjadi subkategori custom, bukan dibuang. Subkategori
 *       statis baru dimulai belum diperiksa.
 *     * Biaya: komponen Notaris & Lainnya ditambahkan (kosong).
 *     * Kontra Garansi: pilihan tunggal lama -> satu item dengan jenis itu (bila dikenali);
 *       isian lama disimpan pada `legacy` sebagai catatan.
 *     * Underlying / Dasar Penerbitan: nilai per sumber digabung menjadi satu nilai bersama
 *       (nilai berbeda disusun per baris sehingga tidak ada teks yang hilang).
 * - Isian lama yang dapat dibaca diubah ke bentuk terstruktur; yang tidak dapat
 *   dibaca (mis. "12 bulan", "Rp 400 juta") TIDAK dibuang: disimpan pada `legacy`
 *   dan ditampilkan sebagai catatan agar ADK mengisinya ulang.
 * - Status Draft/Done, timestamp, dan Opini ADK dipertahankan apa adanya.
 *   Checklist Done lama tidak diubah statusnya; Biaya & Kontra Garansi yang baru
 *   tampil "Belum lengkap" sampai dibuka kembali sebagai Draft dan diisi.
 * - Fungsi ini idempoten dan toleran terhadap data yang rusak sebagian.
 */

const SOURCES: readonly SourceKey[] = SOURCE_ORDER;

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** "14/09/2026 s/d 14/09/2027", "14 September 2026 - 14 September 2027", dst. */
function parseLegacyPeriod(text: string): PeriodValue | null {
  const normalized = normalizeDates(text.normalize("NFKC"));
  const match =
    /(\d{4}-\d{2}-\d{2})\s*(?:s\/d|s\.d\.?|sd|sampai dengan|sampai|hingga|until|to|-)\s*(\d{4}-\d{2}-\d{2})/i.exec(
      normalized,
    );
  if (!match) return null;
  const [, start, end] = match;
  return isValidIsoDate(start) && isValidIsoDate(end) ? { start, end } : null;
}

function coerceAmount(raw: unknown): { value: AmountValue; legacy?: string } {
  if (isDict(raw)) {
    return {
      value: {
        currency: str(raw.currency, DEFAULT_CURRENCY) || DEFAULT_CURRENCY,
        amount: toCanonicalAmount(str(raw.amount)),
      },
    };
  }
  const text = str(raw).trim();
  if (!text) return { value: { currency: DEFAULT_CURRENCY, amount: "" } };
  const parsed = parseAmount(text);
  if (parsed) return { value: { currency: parsed.currency, amount: parsed.value } };
  return { value: { currency: DEFAULT_CURRENCY, amount: "" }, legacy: text };
}

function coercePeriod(raw: unknown): { value: PeriodValue; legacy?: string } {
  if (isDict(raw)) {
    return { value: { start: str(raw.start), end: str(raw.end) } };
  }
  const text = str(raw).trim();
  if (!text) return { value: { start: "", end: "" } };
  const parsed = parseLegacyPeriod(text);
  if (parsed) return { value: parsed };
  return { value: { start: "", end: "" }, legacy: text };
}

/** Komponen Biaya dari data tersimpan (skema 5), dirapikan: Provisi & Administrasi selalu di awal. */
function coerceFeeComponents(raw: unknown): FeeComponentDef[] | null {
  if (!Array.isArray(raw)) return null;
  const defaults = defaultFeeComponents();
  const result: FeeComponentDef[] = [...defaults];
  const used = new Set(defaults.map((c) => c.id));
  const labels = new Set(defaults.map((c) => normalizeDocumentName(c.label)));
  for (const item of raw) {
    if (!isDict(item)) continue;
    const id = str(item.id).trim();
    const label = str(item.label).normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!id || !label || used.has(id) || labels.has(normalizeDocumentName(label))) continue;
    used.add(id);
    labels.add(normalizeDocumentName(label));
    result.push({ id, label, custom: true });
  }
  return result;
}

/** Komponen lama (Notaris, Lainnya) yang dipertahankan sebagai field tambahan bila berisi data. */
const LEGACY_FEE_COMPONENTS: readonly { id: string; label: string }[] = [
  { id: "notaris", label: "Notaris" },
  { id: "lainnya", label: "Lainnya" },
];

/**
 * Biaya: daftar komponen + nilai tiga sumber (satu kesatuan, karena komponen dimiliki field).
 * Skema 5 membawa `components`; skema 3/4 punya empat komponen tetap: Notaris / Lainnya hanya
 * dipertahankan (sebagai field tambahan) bila ada sumber yang sudah mengisinya.
 */
function coerceFees(field: FeesCriticalField, old: Dict): { legacy: Partial<Record<SourceKey, string>> } {
  const legacy = readLegacy(old);
  const stored = coerceFeeComponents(old.components);
  let components: FeeComponentDef[];

  if (stored) {
    components = stored;
  } else {
    components = defaultFeeComponents();
    for (const legacyComponent of LEGACY_FEE_COMPONENTS) {
      const hasData = SOURCES.some((source) => {
        const raw = old[source];
        return isDict(raw) && str(raw[legacyComponent.id]).trim() !== "";
      });
      if (hasData) components.push({ ...legacyComponent, custom: true });
    }
  }

  field.components = components;
  for (const source of SOURCES) {
    const raw = old[source];
    if (isDict(raw)) {
      const value = emptyFeeValueFor(components);
      for (const component of components) value[component.id] = str(raw[component.id]);
      field[source] = value;
    } else {
      field[source] = emptyFeeValueFor(components);
      const text = str(raw).trim();
      if (text) legacy[source] = text;
    }
  }
  return { legacy };
}

function readLegacy(old: Dict): Partial<Record<SourceKey, string>> {
  const legacy: Partial<Record<SourceKey, string>> = {};
  if (!isDict(old.legacy)) return legacy;
  for (const source of SOURCES) {
    const value = old.legacy[source];
    if (typeof value === "string" && value !== "") legacy[source] = value;
  }
  return legacy;
}

/* --- Underlying / Dasar Penerbitan: per sumber -> satu nilai bersama --------- */

function coerceSharedValue(old: Dict): string {
  if (typeof old.value === "string") return old.value;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const source of SOURCES) {
    const text = str(old[source]).trim();
    const key = normalizeDocumentName(text);
    if (text && !seen.has(key)) {
      seen.add(key);
      parts.push(text);
    }
  }
  return parts.join("\n");
}

/* --- Kontra Garansi ------------------------------------------------------------ */

const LEGACY_KONTRA_TYPES: Record<string, KontraType> = {
  "fixed asset": "fixedAsset",
  kendaraan: "kendaraan",
  "cash collateral": "cashCollateral",
  asuransi: "asuransi",
  "asuransi (sp3)": "asuransi",
};

function coerceKontraDetail(type: KontraType, raw: unknown): KontraDetail {
  const detail = emptyKontraDetail(type);
  if (!isDict(raw)) return detail;
  for (const field of getKontraTypeDef(type).fields) {
    const value = raw[field.key];
    if (field.kind === "currency") {
      detail[field.key] = coerceAmount(value).value;
    } else {
      detail[field.key] = str(value);
    }
  }
  return detail;
}

function coerceKontraItem(raw: unknown): KontraItem | null {
  if (!isDict(raw)) return null;
  const type = KONTRA_TYPES.find((def) => def.key === raw.type)?.key;
  if (!type) return null;
  const values = isDict(raw.values) ? raw.values : {};
  return {
    id: str(raw.id) || generateId(),
    type,
    values: {
      underlyingDocument: coerceKontraDetail(type, values.underlyingDocument),
      ptk: coerceKontraDetail(type, values.ptk),
      mak: coerceKontraDetail(type, values.mak),
    },
  };
}

function coerceKontra(field: KontraCriticalField, old: Dict): void {
  if (Array.isArray(old.items)) {
    const seen = new Set<string>();
    field.items = old.items.flatMap((raw) => {
      const item = coerceKontraItem(raw);
      if (!item || seen.has(item.id)) return [];
      seen.add(item.id);
      return [item];
    });
    // Catatan isian lama (dari migrasi skema 2) tetap dibawa sampai ADK menyelesaikan item.
    const kept = readLegacy(old);
    if (Object.keys(kept).length > 0) field.legacy = kept;
    return;
  }

  // Skema 2: tiga pilihan tunggal (satu per sumber). Jenis pertama yang dikenali (Underlying
  // Document, lalu Memorandum, lalu Putusan) menjadi satu item; seluruh isian lama dicatat.
  const legacy = readLegacy(old);
  let type: KontraType | undefined;
  for (const source of SOURCES) {
    const text = str(old[source]).trim();
    if (!text) continue;
    legacy[source] = text;
    type ??= LEGACY_KONTRA_TYPES[text.toLocaleLowerCase("id-ID")];
  }
  const item = type ? coerceKontraItem({ type }) : null;
  if (item) field.items = [item];
  if (Object.keys(legacy).length > 0) field.legacy = legacy;
}

/* --- Critical field ------------------------------------------------------------ */

function coerceField(def: CriticalFieldDef, id: number, old: Dict | undefined): CriticalField {
  const field = createEmptyCriticalField(def, id);
  if (!old) return field;

  if (field.key === "underlying") {
    field.value = coerceSharedValue(old);
    return field;
  }
  if (field.key === "kontraGaransi") {
    coerceKontra(field, old);
    return field;
  }

  if (field.key === "biaya") {
    const { legacy: feeLegacy } = coerceFees(field, old);
    if (Object.keys(feeLegacy).length > 0) field.legacy = feeLegacy;
    return field;
  }

  const legacy = readLegacy(old);
  const record = field as unknown as Record<SourceKey, unknown>;

  for (const source of SOURCES) {
    const raw = old[source];
    switch (def.key) {
      case "nilaiBg": {
        const result = coerceAmount(raw);
        record[source] = result.value;
        if (result.legacy) legacy[source] = result.legacy;
        break;
      }
      case "jangkaWaktu": {
        const result = coercePeriod(raw);
        record[source] = result.value;
        if (result.legacy) legacy[source] = result.legacy;
        break;
      }
      default:
        record[source] = str(raw);
    }
  }

  if (Object.keys(legacy).length > 0) (field as PerSourceCriticalField).legacy = legacy;
  return field;
}

/* --- Dokumen --------------------------------------------------------------------- */

/** Nama dokumen lama -> kategori baru ketika tidak ada subkategori statis yang cocok. */
const LEGACY_DOCUMENT_CATEGORY: Record<string, string> = {
  "izin usaha": "identitas-usaha-debitur",
};

/** Urutan tetap: kategori, lalu subkategori statis (urutan konfigurasi), lalu custom (urutan data). */
export function orderDocuments(documents: DocumentVerification[]): DocumentVerification[] {
  const ordered: DocumentVerification[] = [];
  for (const category of DOCUMENT_CATEGORIES) {
    const own = documents.filter((d) => d.categoryKey === category.key);
    for (const name of getCategoryStaticItems(category)) {
      const found = own.find((d) => !d.custom && normalizeDocumentName(d.documentName) === normalizeDocumentName(name));
      if (found) ordered.push(found);
    }
    ordered.push(...own.filter((d) => d.custom));
  }
  return ordered;
}

function coerceStoredDocument(raw: Dict, index: number): DocumentVerification {
  return {
    id: typeof raw.id === "number" ? raw.id : index + 1,
    documentName: str(raw.documentName),
    status: raw.status === "Ada" || raw.status === "Tidak Ada" ? raw.status : null,
    notes: str(raw.notes),
    categoryKey: resolveCategoryKey(typeof raw.categoryKey === "string" ? raw.categoryKey : undefined),
    custom: raw.custom === true,
  };
}

function isRetiredCategoryKey(key: unknown): boolean {
  return typeof key === "string" && REMOVED_DOCUMENT_CATEGORY_KEYS.includes(key);
}

/** Dokumen tersimpan adalah baris bawaan (bukan tambahan ADK) pada kategori yang sudah dihapus. */
function isRetiredDefaultRow(raw: Dict): boolean {
  return isRetiredCategoryKey(raw.categoryKey) && raw.custom !== true;
}

/**
 * true bila data tersimpan memuat baris bawaan dari poin yang sudah dihapus (skema 6) yang
 * SUDAH diisi (status atau keterangan). Dipakai penyimpanan untuk membuat salinan cadangan
 * sebelum isian itu dibuang oleh migrasi.
 */
export function hasRetiredPointData(raw: unknown): boolean {
  if (!isDict(raw) || !Array.isArray(raw.documentVerification)) return false;
  return raw.documentVerification.filter(isDict).some(
    (d) =>
      isRetiredDefaultRow(d) &&
      (d.status === "Ada" || d.status === "Tidak Ada" || str(d.notes).trim() !== ""),
  );
}

/** Akhiran untuk dokumen yang dipindahkan dari poin yang dihapus bila namanya kembar. */
const MOVED_DOCUMENT_SUFFIX = "(dari poin lama)";

/**
 * Dokumen tambahan ADK di dalam poin yang dihapus tidak dibuang: kunci kategorinya tak dikenal
 * lagi sehingga dialihkan ke "Surat-Surat Lainnya". Bila namanya kembar dengan dokumen yang sudah
 * ada di sana, diberi akhiran agar tetap unik dan terbedakan.
 */
function uniquifyMovedDocuments(
  documents: DocumentVerification[],
  movedIds: ReadonlySet<number>,
): DocumentVerification[] {
  const taken = new Set(
    documents
      .filter((d) => d.categoryKey === FALLBACK_DOCUMENT_CATEGORY && !movedIds.has(d.id))
      .map((d) => normalizeDocumentName(d.documentName)),
  );
  return documents.map((d) => {
    if (!movedIds.has(d.id)) return d;
    let name = d.documentName;
    let n = 1;
    while (taken.has(normalizeDocumentName(name))) {
      name = n === 1 ? `${d.documentName} ${MOVED_DOCUMENT_SUFFIX}` : `${d.documentName} ${MOVED_DOCUMENT_SUFFIX} ${n}`;
      n += 1;
    }
    taken.add(normalizeDocumentName(name));
    return name === d.documentName ? d : { ...d, documentName: name };
  });
}

function coerceDocuments(raw: unknown): DocumentVerification[] {
  const fresh = createEmptyDocuments();
  if (!Array.isArray(raw) || raw.length === 0) return fresh;
  const incoming = raw.filter(isDict);

  // Skema 3+: pertahankan apa adanya, lengkapi subkategori statis yang belum ada.
  if (incoming.length > 0 && incoming.every((d) => typeof d.categoryKey === "string")) {
    // Poin yang sudah dihapus (skema 6): baris bawaannya dibuang; dokumen tambahan dipindahkan.
    const movedIds = new Set<number>();
    const coerced = incoming
      .map((raw, index) => ({ raw, index }))
      .filter(({ raw }) => !isRetiredDefaultRow(raw))
      .map(({ raw, index }) => {
        const doc = coerceStoredDocument(raw, index);
        if (isRetiredCategoryKey(raw.categoryKey)) movedIds.add(doc.id);
        return doc;
      });
    const stored = uniquifyMovedDocuments(coerced, movedIds);
    const usedIds = new Set(stored.map((d) => d.id));
    let nextId = Math.max(0, ...stored.map((d) => d.id)) + 1;
    const merged = [...stored];
    for (const base of fresh) {
      const exists = stored.some(
        (d) =>
          !d.custom &&
          d.categoryKey === base.categoryKey &&
          normalizeDocumentName(d.documentName) === normalizeDocumentName(base.documentName),
      );
      if (!exists) {
        while (usedIds.has(nextId)) nextId += 1;
        usedIds.add(nextId);
        merged.push({ ...base, id: nextId });
      }
    }
    return orderDocuments(merged);
  }

  // Skema 1/2: petakan dokumen lama ke struktur kategori.
  const result = [...fresh];
  const claimed = new Set<number>();
  let nextId = fresh.length + 1;
  for (const [index, old] of incoming.entries()) {
    const stored = coerceStoredDocument(old, index);
    const name = normalizeDocumentName(stored.documentName);
    const slot = result.find(
      (d) => !d.custom && !claimed.has(d.id) && normalizeDocumentName(d.documentName) === name,
    );
    if (slot) {
      claimed.add(slot.id);
      slot.status = stored.status;
      slot.notes = stored.notes;
      continue;
    }
    result.push({
      id: nextId++,
      documentName: stored.documentName || "Dokumen",
      status: stored.status,
      notes: stored.notes,
      categoryKey: LEGACY_DOCUMENT_CATEGORY[name] ?? FALLBACK_DOCUMENT_CATEGORY,
      custom: true,
    });
  }
  return orderDocuments(result);
}

/**
 * Mengubah data tersimpan (bentuk apa pun) menjadi `BankGuaranteeChecklist`
 * skema terbaru. Mengembalikan null hanya bila data bukan objek ber-id.
 */
export function migrateChecklist(raw: unknown): BankGuaranteeChecklist | null {
  if (!isDict(raw) || typeof raw.id !== "string" || raw.id === "") return null;

  const oldFields = Array.isArray(raw.criticalFields) ? raw.criticalFields.filter(isDict) : [];
  // Pengaman: draft dari build percobaan yang menyimpan Kontra Garansi pada `raw.kontraGaransi`
  // (di luar `criticalFields`) tetap dibaca, sehingga isiannya tidak hilang.
  const strayKontra = isDict(raw.kontraGaransi) ? raw.kontraGaransi : undefined;
  const criticalFields = CRITICAL_FIELD_DEFS.map((def, index) =>
    coerceField(
      def,
      index + 1,
      oldFields.find((f) => f.key === def.key) ??
        (def.key === "kontraGaransi" ? strayKontra : undefined),
    ),
  );

  const createdAt = str(raw.createdAt) || nowIso();
  const atasNama = str(raw.atasNama);
  const completedAt = str(raw.completedAt);

  const checklist: BankGuaranteeChecklist = {
    id: raw.id,
    schemaVersion: SCHEMA_VERSION,
    taskName: str(raw.taskName) || deriveTaskName(atasNama),
    taskNameCustom: raw.taskNameCustom === true,
    adkName: str(raw.adkName),
    atasNama,
    cif: str(raw.cif),
    jenisPengajuan: str(raw.jenisPengajuan),
    documentVerification: coerceDocuments(raw.documentVerification),
    criticalFields: recalculateMatches(criticalFields),
    opiniAdk: str(raw.opiniAdk),
    status: raw.status === "Done" ? "Done" : "Draft",
    createdAt,
    updatedAt: str(raw.updatedAt) || createdAt,
  };
  if (completedAt) checklist.completedAt = completedAt;
  return checklist;
}
