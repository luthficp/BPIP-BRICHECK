import { defaultFeeComponents } from "./config";
import { generateId } from "./factory";
import type { FeeComponentDef, FeeValue, FeesCriticalField } from "./types";

/**
 * Pembantu komponen Biaya (murni, tanpa React).
 *
 * Provisi dan Administrasi adalah komponen bawaan. ADK dapat menambah komponen bernama bebas;
 * komponen itu dibuat serentak untuk ketiga sumber (satu daftar `components` pada field) dan
 * dihapus serentak dari ketiga sumber, tanpa menyisakan nilai yatim.
 */

export const MAX_FEE_NAME_LENGTH = 40;
/** Batas wajar agar kolom Biaya tetap terbaca. */
export const MAX_CUSTOM_FEE_COMPONENTS = 10;

/** Komponen Biaya sebuah field; data lama tanpa daftar memakai komponen bawaan. */
export function getFeeComponents(field: { components?: FeeComponentDef[] }): FeeComponentDef[] {
  return Array.isArray(field.components) && field.components.length > 0
    ? field.components
    : defaultFeeComponents();
}

export function emptyFeeValueFor(components: readonly FeeComponentDef[]): FeeValue {
  return Object.fromEntries(components.map((c) => [c.id, ""]));
}

/** Nama dirapikan: spasi berlebih dibuang. */
export function cleanFeeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function feeNameKey(name: string): string {
  return cleanFeeName(name).toLocaleLowerCase("id-ID");
}

/** Pesan kesalahan untuk nama komponen baru; null bila valid. */
export function validateFeeName(
  name: string,
  components: readonly FeeComponentDef[],
): string | null {
  const clean = cleanFeeName(name);
  if (!clean) return "Nama field biaya wajib diisi.";
  if (clean.length > MAX_FEE_NAME_LENGTH) {
    return `Nama field biaya maksimal ${MAX_FEE_NAME_LENGTH} karakter.`;
  }
  const key = feeNameKey(clean);
  if (components.some((c) => feeNameKey(c.label) === key)) {
    return `Field biaya "${clean}" sudah ada. Gunakan nama lain.`;
  }
  if (components.filter((c) => c.custom).length >= MAX_CUSTOM_FEE_COMPONENTS) {
    return `Maksimal ${MAX_CUSTOM_FEE_COMPONENTS} field biaya tambahan.`;
  }
  return null;
}

/** Komponen tambahan baru pada ketiga sumber sekaligus (nilai awal kosong). Nama tidak valid ditolak. */
export function addFeeComponent(
  field: FeesCriticalField,
  name: string,
  id: string = `fee-${generateId()}`,
): FeesCriticalField {
  const components = getFeeComponents(field);
  if (validateFeeName(name, components) !== null) return field;
  const label = cleanFeeName(name);
  return {
    ...field,
    components: [...components, { id, label, custom: true }],
    underlyingDocument: { ...field.underlyingDocument, [id]: "" },
    ptk: { ...field.ptk, [id]: "" },
    mak: { ...field.mak, [id]: "" },
  };
}

function without(value: FeeValue, id: string): FeeValue {
  const { [id]: _removed, ...rest } = value;
  void _removed;
  return rest;
}

/** Menghapus komponen tambahan dari ketiga sumber sekaligus. Komponen bawaan tidak dapat dihapus. */
export function removeFeeComponent(field: FeesCriticalField, id: string): FeesCriticalField {
  const target = getFeeComponents(field).find((c) => c.id === id);
  if (!target || !target.custom) return field;
  return {
    ...field,
    components: getFeeComponents(field).filter((c) => c.id !== id),
    underlyingDocument: without(field.underlyingDocument, id),
    ptk: without(field.ptk, id),
    mak: without(field.mak, id),
  };
}

/** Komponen sudah berisi nilai pada salah satu sumber (dasar konfirmasi sebelum menghapus). */
export function feeComponentHasData(field: FeesCriticalField, id: string): boolean {
  return (["underlyingDocument", "ptk", "mak"] as const).some(
    (source) => (field[source][id] ?? "").trim() !== "",
  );
}
