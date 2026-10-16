import { CRITICAL_FIELD_DEFS, getKontraTypeDef } from "./config";
import { createEmptyChecklist, createEmptyCriticalField } from "./factory";
import { createKontraItem, patchKontraItemValue } from "./kontra";
import {
  addFeeComponent,
  applyKontraConfig,
  markDone,
  patchHeader,
  setAmountValue,
  setCriticalValue,
  setDocumentNotes,
  setDocumentStatus,
  setFeeValue,
  setKontraValue,
  setOpiniAdk,
  setPeriodValue,
  setSharedValue,
} from "./mutations";
import { recalculateMatches } from "../validation/three-way-match";
import type {
  AmountCriticalField,
  BankGuaranteeChecklist,
  CriticalFieldKey,
  FeeComponentDef,
  FeesCriticalField,
  KontraCriticalField,
  KontraItem,
  KontraType,
  PeriodCriticalField,
  SharedCriticalField,
  SourceKey,
  TextCriticalField,
} from "./types";

/**
 * Pembuat fixture untuk pengujian (tidak dipakai oleh aplikasi).
 * Setiap field dibuat dari pabrik yang sama dengan aplikasi, lalu diisi.
 */

function emptyField(key: CriticalFieldKey, id: number) {
  const def = CRITICAL_FIELD_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`Field tidak dikenal: ${key}`);
  return createEmptyCriticalField(def, id);
}

export function makeText(
  key: TextCriticalField["key"],
  underlyingDocument: string,
  ptk: string,
  mak: string,
  id = 1,
): TextCriticalField {
  return { ...(emptyField(key, id) as TextCriticalField), underlyingDocument, ptk, mak };
}

/** `amounts` = angka kanonik per sumber ("" = kosong); `currencies` default IDR. */
export function makeAmount(
  amounts: [string, string, string],
  currencies: [string, string, string] = ["IDR", "IDR", "IDR"],
  id = 4,
): AmountCriticalField {
  const base = emptyField("nilaiBg", id) as AmountCriticalField;
  return {
    ...base,
    underlyingDocument: { currency: currencies[0], amount: amounts[0] },
    ptk: { currency: currencies[1], amount: amounts[1] },
    mak: { currency: currencies[2], amount: amounts[2] },
  };
}

/** Setiap sumber = [tanggal mulai, tanggal akhir] dalam ISO yyyy-mm-dd ("" = kosong). */
export function makePeriod(
  underlyingDocument: [string, string],
  ptk: [string, string],
  mak: [string, string],
  id = 5,
): PeriodCriticalField {
  const base = emptyField("jangkaWaktu", id) as PeriodCriticalField;
  return {
    ...base,
    underlyingDocument: { start: underlyingDocument[0], end: underlyingDocument[1] },
    ptk: { start: ptk[0], end: ptk[1] },
    mak: { start: mak[0], end: mak[1] },
  };
}

/** Setiap sumber = [provisi, administrasi, notaris, lainnya]. */
export type FeeTuple = [string, string, string, string];

/**
 * Empat komponen untuk pengujian perbandingan per komponen: Provisi & Administrasi (bawaan)
 * ditambah Notaris & Lainnya sebagai field tambahan ADK (custom).
 */
export const TEST_FEE_COMPONENTS: FeeComponentDef[] = [
  { id: "provisi", label: "Provisi", custom: false },
  { id: "administrasi", label: "Administrasi", custom: false },
  { id: "notaris", label: "Notaris", custom: true },
  { id: "lainnya", label: "Lainnya", custom: true },
];

export function makeFees(
  underlyingDocument: FeeTuple,
  ptk: FeeTuple,
  mak: FeeTuple,
  id = 6,
): FeesCriticalField {
  const base = emptyField("biaya", id) as FeesCriticalField;
  const toFee = ([provisi, administrasi, notaris, lainnya]: FeeTuple) => ({
    provisi,
    administrasi,
    notaris,
    lainnya,
  });
  return {
    ...base,
    components: TEST_FEE_COMPONENTS.map((component) => ({ ...component })),
    underlyingDocument: toFee(underlyingDocument),
    ptk: toFee(ptk),
    mak: toFee(mak),
  };
}

/** Biaya dengan komponen bawaan saja: setiap sumber = [provisi, administrasi]. */
export function makeDefaultFees(
  underlyingDocument: [string, string],
  ptk: [string, string],
  mak: [string, string],
  id = 6,
): FeesCriticalField {
  const base = emptyField("biaya", id) as FeesCriticalField;
  const toFee = ([provisi, administrasi]: [string, string]) => ({ provisi, administrasi });
  return {
    ...base,
    underlyingDocument: toFee(underlyingDocument),
    ptk: toFee(ptk),
    mak: toFee(mak),
  };
}

/** Underlying / Dasar Penerbitan (satu field bersama). */
export function makeShared(value: string, id = 8): SharedCriticalField {
  return { ...(emptyField("underlying", id) as SharedCriticalField), value };
}

/**
 * Kontra Garansi dengan item yang diisi. `details[source]` = nilai per key field
 * (teks, atau angka kanonik untuk field nominal); kunci yang tidak ada dibiarkan kosong.
 */
export function makeKontraItem(
  type: KontraType,
  details: Partial<Record<SourceKey, Record<string, string>>> = {},
  id?: string,
): KontraItem {
  let item = createKontraItem(type);
  if (id) item = { ...item, id };
  const def = getKontraTypeDef(type);
  for (const source of ["underlyingDocument", "mak", "ptk"] as SourceKey[]) {
    for (const [key, value] of Object.entries(details[source] ?? {})) {
      const field = def.fields.find((f) => f.key === key);
      item = patchKontraItemValue(item, source, key, field?.kind === "currency" ? { amount: value } : value);
    }
  }
  return item;
}

export function makeKontra(items: KontraItem[], id = 7): KontraCriticalField {
  return { ...(emptyField("kontraGaransi", id) as KontraCriticalField), items };
}

/** Isian detail lengkap dan identik untuk satu jenis (SESUAI pada ketiga sumber). */
export function fullKontraDetail(type: KontraType): Record<string, string> {
  const detail: Record<string, string> = {};
  for (const field of getKontraTypeDef(type).fields) {
    detail[field.key] = field.kind === "currency" ? "500000000" : `${field.label} contoh`;
  }
  return detail;
}

/* ------------------------------------------------------------------ */
/* Checklist contoh lengkap (untuk pengujian output)                    */
/* ------------------------------------------------------------------ */

const ALL_SOURCES: SourceKey[] = ["underlyingDocument", "ptk", "mak"];

/** Nomor PKS pada checklist contoh. */
export const SAMPLE_PKS_NUMBER = "PKS/045/BRI-BFLP/2026";

/**
 * Checklist Done yang seluruh sumbernya terisi.
 * "clean"    : seluruh field SESUAI.
 * "mismatch" : Beneficiary, Nilai Bank Garansi, Biaya (Provisi), dan satu field Kontra Garansi
 *              TIDAK SESUAI. (Hanya untuk pengujian output: pada aplikasi, checklist
 *              dengan TIDAK SESUAI tidak dapat melewati Step 2.)
 *
 * Kontra Garansi: satu Fixed Asset dan satu Kendaraan.
 */
export function makeSampleChecklist(mode: "clean" | "mismatch"): BankGuaranteeChecklist {
  let c = patchHeader(createEmptyChecklist("Andi Pratama"), {
    atasNama: "PT INBISCO NIAGATAMA",
    cif: "1234567",
    jenisPengajuan: "Baru",
  });
  // Dokumen: semua "Ada" kecuali Akta pendirian ("Tidak Ada"); satu Keterangan terisi.
  c.documentVerification.forEach((d) => {
    c = setDocumentStatus(c, d.id, d.documentName === "Akta pendirian" ? "Tidak Ada" : "Ada");
  });
  const firstDoc = c.documentVerification.find((d) => d.documentName === "KTP")!;
  c = setDocumentNotes(c, firstDoc.id, "Tanggal surat 14 September 2026");
  // Perjanjian Kerja Sama (Identitas Beneficiary) = Ada, sehingga Nomor PKS wajib terisi.
  const pksDoc = c.documentVerification.find(
    (d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama",
  )!;
  c = setDocumentNotes(c, pksDoc.id, SAMPLE_PKS_NUMBER);

  const id = (key: string) => c.criticalFields.find((f) => f.key === key)!.id;
  const bad = mode === "mismatch";
  // Satu field biaya tambahan ADK ("Notaris") selain Provisi dan Administrasi bawaan.
  const added = addFeeComponent(c, id("biaya"), "Notaris");
  if (!added.ok) throw new Error(added.message);
  c = added.checklist;
  const notarisId = added.componentId;
  for (const source of ALL_SOURCES) {
    c = setCriticalValue(c, id("jenisBg"), source, "Performance Bond");
    c = setCriticalValue(c, id("tujuanBg"), source, "Jaminan pelaksanaan pekerjaan");
    c = setCriticalValue(
      c,
      id("beneficiary"),
      source,
      bad && source === "mak" ? "PT INBISCO NIAGATAMA" : "PT INBISCO",
    );
    c = setAmountValue(c, id("nilaiBg"), source, {
      amount: bad && source === "ptk" ? "1249000000" : "1250000000",
    });
    c = setPeriodValue(c, id("jangkaWaktu"), source, { start: "2026-10-01", end: "2027-10-01" });
    c = setFeeValue(c, id("biaya"), source, {
      provisi: bad && source === "ptk" ? "600000" : "500000",
      administrasi: "250000",
      [notarisId]: "150000",
    });
  }

  // Kontra Garansi: 1 Fixed Asset + 1 Kendaraan, detail diisi pada ketiga sumber.
  c = applyKontraConfig(c, id("kontraGaransi"), {
    fixedAsset: 1,
    kendaraan: 1,
    cashCollateral: 0,
    asuransi: 0,
  });
  const kontra = c.criticalFields.find((f) => f.key === "kontraGaransi") as KontraCriticalField;
  for (const item of kontra.items) {
    const detail = fullKontraDetail(item.type);
    for (const source of ALL_SOURCES) {
      for (const [key, value] of Object.entries(detail)) {
        const isAmount = key.startsWith("nilai");
        const differs = bad && item.type === "fixedAsset" && source === "ptk" && key === "noShm";
        c = setKontraValue(
          c,
          id("kontraGaransi"),
          item.id,
          source,
          key,
          isAmount ? { amount: value } : differs ? "SHM 99999" : value,
        );
      }
    }
  }

  c = setSharedValue(c, id("underlying"), "Kontrak No. 123/ABC/2026");
  c = setOpiniAdk(c, "Opini ADK baris 1.\nOpini ADK baris 2.");
  c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };
  return markDone(c);
}
