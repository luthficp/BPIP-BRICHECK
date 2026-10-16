import {
  CRITICAL_FIELD_DEFS,
  DEFAULT_CURRENCY,
  defaultFeeComponents,
  DOCUMENT_CATEGORIES,
  getCategoryStaticItems,
  type CriticalFieldDef,
} from "./config";
import {
  SCHEMA_VERSION,
  type AmountValue,
  type BankGuaranteeChecklist,
  type CriticalField,
  type DocumentVerification,
  type FeeComponentDef,
  type FeeValue,
  type PeriodValue,
} from "./types";

/** crypto.randomUUID hanya ada di secure context; intranet http perlu fallback. */
export function generateId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const rand = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rand()}-${rand()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Nama task otomatis: "BG Verification - [Atas Nama]". */
export function deriveTaskName(atasNama: string): string {
  const name = atasNama.trim();
  return name ? `BG Verification - ${name}` : "BG Verification - Draft Baru";
}

export const emptyAmount = (): AmountValue => ({ currency: DEFAULT_CURRENCY, amount: "" });
export const emptyPeriod = (): PeriodValue => ({ start: "", end: "" });
/** Nilai Biaya kosong untuk satu sumber (komponen bawaan bila daftar tidak diberikan). */
export const emptyFee = (components: readonly FeeComponentDef[] = defaultFeeComponents()): FeeValue =>
  Object.fromEntries(components.map((c) => [c.id, ""]));

/** Critical field kosong sesuai tipe datanya (objek dibuat baru per sumber, tidak dibagi). */
export function createEmptyCriticalField(def: CriticalFieldDef, id: number): CriticalField {
  const base = { id, fieldName: def.label, matchStatus: "BELUM LENGKAP" as const };

  switch (def.key) {
    case "nilaiBg":
      return {
        ...base,
        key: "nilaiBg",
        underlyingDocument: emptyAmount(),
        ptk: emptyAmount(),
        mak: emptyAmount(),
      };
    case "jangkaWaktu":
      return {
        ...base,
        key: "jangkaWaktu",
        underlyingDocument: emptyPeriod(),
        ptk: emptyPeriod(),
        mak: emptyPeriod(),
      };
    case "biaya":
      return {
        ...base,
        key: "biaya",
        components: defaultFeeComponents(),
        underlyingDocument: emptyFee(),
        ptk: emptyFee(),
        mak: emptyFee(),
      };
    case "kontraGaransi":
      return { ...base, key: "kontraGaransi", items: [] };
    case "underlying":
      return { ...base, key: "underlying", value: "" };
    default:
      return { ...base, key: def.key, underlyingDocument: "", ptk: "", mak: "" };
  }
}

/** Dokumen awal: seluruh subkategori statis pada tiap kategori utama, belum diperiksa. */
export function createEmptyDocuments(): DocumentVerification[] {
  const documents: DocumentVerification[] = [];
  for (const category of DOCUMENT_CATEGORIES) {
    for (const documentName of getCategoryStaticItems(category)) {
      documents.push({
        id: documents.length + 1,
        documentName,
        status: null,
        notes: "",
        categoryKey: category.key,
        custom: false,
      });
    }
  }
  return documents;
}

export function createEmptyChecklist(adkName: string): BankGuaranteeChecklist {
  const now = nowIso();
  return {
    id: generateId(),
    schemaVersion: SCHEMA_VERSION,
    taskName: deriveTaskName(""),
    taskNameCustom: false,
    adkName: adkName.trim(),
    atasNama: "",
    cif: "",
    jenisPengajuan: "",
    documentVerification: createEmptyDocuments(),
    criticalFields: CRITICAL_FIELD_DEFS.map((def, index) =>
      createEmptyCriticalField(def, index + 1),
    ),
    opiniAdk: "",
    status: "Draft",
    createdAt: now,
    updatedAt: now,
  };
}
