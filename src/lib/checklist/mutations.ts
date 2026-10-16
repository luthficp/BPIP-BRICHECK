import { getDocumentCategory } from "./config";
import { findDuplicateDocument, nextDocumentId } from "./documents";
import { addFeeComponent as addFee, getFeeComponents, removeFeeComponent as removeFee, validateFeeName } from "./fees";
import { deriveTaskName, nowIso } from "./factory";
import { patchKontraItemValue, planKontraConfig, type KontraCounts, type KontraPlan } from "./kontra";
import type {
  AmountCriticalField,
  AmountValue,
  BankGuaranteeChecklist,
  CriticalField,
  DocumentStatus,
  FeeValue,
  FeesCriticalField,
  KontraCriticalField,
  PeriodCriticalField,
  PeriodValue,
  SharedCriticalField,
  SourceKey,
  TextCriticalField,
} from "./types";

/**
 * Perubahan data yang murni (tanpa React) agar mudah diuji dan dipakai ulang
 * di backend. `updatedAt` dan `matchStatus` diatur oleh editor hook.
 */

export type HeaderPatch = Partial<
  Pick<BankGuaranteeChecklist, "atasNama" | "cif" | "jenisPengajuan">
>;

export function patchHeader(
  c: BankGuaranteeChecklist,
  patch: HeaderPatch,
): BankGuaranteeChecklist {
  const next = { ...c, ...patch };
  if (patch.atasNama !== undefined && !c.taskNameCustom) {
    next.taskName = deriveTaskName(patch.atasNama);
  }
  return next;
}

/** Mengubah nama task manual. Dikosongkan => kembali otomatis. */
export function setTaskName(
  c: BankGuaranteeChecklist,
  value: string,
): BankGuaranteeChecklist {
  if (value.trim() === "") {
    return { ...c, taskName: deriveTaskName(c.atasNama), taskNameCustom: false };
  }
  return { ...c, taskName: value, taskNameCustom: true };
}

export function setDocumentStatus(
  c: BankGuaranteeChecklist,
  documentId: number,
  status: DocumentStatus | null,
): BankGuaranteeChecklist {
  return {
    ...c,
    documentVerification: c.documentVerification.map((d) =>
      d.id === documentId ? { ...d, status } : d,
    ),
  };
}

export function setDocumentNotes(
  c: BankGuaranteeChecklist,
  documentId: number,
  notes: string,
): BankGuaranteeChecklist {
  return {
    ...c,
    documentVerification: c.documentVerification.map((d) =>
      d.id === documentId ? { ...d, notes } : d,
    ),
  };
}

function mapField(
  c: BankGuaranteeChecklist,
  fieldId: number,
  mapper: (field: CriticalField) => CriticalField,
): BankGuaranteeChecklist {
  return {
    ...c,
    criticalFields: c.criticalFields.map((f) => (f.id === fieldId ? mapper(f) : f)),
  };
}

/** Isian teks / dropdown per sumber (Jenis BG, Tujuan, Beneficiary). */
export function setCriticalValue(
  c: BankGuaranteeChecklist,
  fieldId: number,
  source: SourceKey,
  value: string,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) =>
    f.key === "jenisBg" || f.key === "tujuanBg" || f.key === "beneficiary"
      ? ({ ...f, [source]: value } as TextCriticalField)
      : f,
  );
}

/** Underlying / Dasar Penerbitan: satu nilai bersama untuk seluruh sumber. */
export function setSharedValue(
  c: BankGuaranteeChecklist,
  fieldId: number,
  value: string,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) =>
    f.key === "underlying" ? ({ ...f, value } as SharedCriticalField) : f,
  );
}

/** Nilai Bank Garansi: mata uang dan/atau angka kanonik. */
export function setAmountValue(
  c: BankGuaranteeChecklist,
  fieldId: number,
  source: SourceKey,
  patch: Partial<AmountValue>,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) =>
    f.key === "nilaiBg"
      ? ({ ...f, [source]: { ...f[source], ...patch } } as AmountCriticalField)
      : f,
  );
}

/** Jangka Waktu: tanggal mulai dan/atau akhir (ISO yyyy-mm-dd, "" = kosong). */
export function setPeriodValue(
  c: BankGuaranteeChecklist,
  fieldId: number,
  source: SourceKey,
  patch: Partial<PeriodValue>,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) =>
    f.key === "jangkaWaktu"
      ? ({ ...f, [source]: { ...f[source], ...patch } } as PeriodCriticalField)
      : f,
  );
}

/** Biaya: nilai satu atau beberapa komponen (kunci = id komponen) pada satu sumber. */
export function setFeeValue(
  c: BankGuaranteeChecklist,
  fieldId: number,
  source: SourceKey,
  patch: Partial<FeeValue>,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) =>
    f.key === "biaya"
      ? ({ ...f, [source]: { ...f[source], ...patch } } as FeesCriticalField)
      : f,
  );
}

export type AddFeeResult =
  | { ok: true; checklist: BankGuaranteeChecklist; componentId: string }
  | { ok: false; message: string };

/**
 * Menambah field biaya (nama bebas) pada ketiga sumber sekaligus. Nama kosong, kembar, terlalu
 * panjang, atau melebihi batas ditolak dengan pesan.
 */
export function addFeeComponent(
  c: BankGuaranteeChecklist,
  fieldId: number,
  name: string,
): AddFeeResult {
  const field = c.criticalFields.find((f) => f.id === fieldId);
  if (!field || field.key !== "biaya") return { ok: false, message: "Field Biaya tidak ditemukan." };
  const message = validateFeeName(name, getFeeComponents(field));
  if (message) return { ok: false, message };
  const before = new Set(getFeeComponents(field).map((component) => component.id));
  const checklist = mapField(c, fieldId, (f) => (f.key === "biaya" ? addFee(f, name) : f));
  const updated = checklist.criticalFields.find((f) => f.id === fieldId);
  const created =
    updated?.key === "biaya"
      ? getFeeComponents(updated).find((component) => !before.has(component.id))
      : undefined;
  if (!created) return { ok: false, message: "Field biaya gagal ditambahkan." };
  return { ok: true, checklist, componentId: created.id };
}

/** Menghapus field biaya tambahan dari ketiga sumber sekaligus (Provisi & Administrasi tidak dapat dihapus). */
export function removeFeeComponent(
  c: BankGuaranteeChecklist,
  fieldId: number,
  componentId: string,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) => (f.key === "biaya" ? removeFee(f, componentId) : f));
}

/* ------------------------------------------------------------------ */
/* Kontra Garansi                                                       */
/* ------------------------------------------------------------------ */

function kontraFieldOf(c: BankGuaranteeChecklist, fieldId: number): KontraCriticalField | undefined {
  const field = c.criticalFields.find((f) => f.id === fieldId);
  return field?.key === "kontraGaransi" ? field : undefined;
}

/** Rencana perubahan konfigurasi (tanpa menerapkannya), untuk konfirmasi dampak. */
export function planKontraChange(
  c: BankGuaranteeChecklist,
  fieldId: number,
  counts: KontraCounts,
): KontraPlan | null {
  const field = kontraFieldOf(c, fieldId);
  return field ? planKontraConfig(field.items, counts) : null;
}

/**
 * Menerapkan konfigurasi jenis/jumlah item. Item yang tetap dipertahankan beserta
 * datanya; hanya item yang dikurangi yang dilepas. Pemanggil bertanggung jawab
 * meminta konfirmasi bila `planKontraChange(...).removedWithData` tidak kosong.
 */
export function applyKontraConfig(
  c: BankGuaranteeChecklist,
  fieldId: number,
  counts: KontraCounts,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) =>
    f.key === "kontraGaransi"
      ? ({ ...f, items: planKontraConfig(f.items, counts).items } as KontraCriticalField)
      : f,
  );
}

/** Mengubah satu field detail item kontra pada satu sumber. */
export function setKontraValue(
  c: BankGuaranteeChecklist,
  fieldId: number,
  itemId: string,
  source: SourceKey,
  key: string,
  value: string | Partial<AmountValue>,
): BankGuaranteeChecklist {
  return mapField(c, fieldId, (f) =>
    f.key === "kontraGaransi"
      ? ({
          ...f,
          items: f.items.map((item) =>
            item.id === itemId ? patchKontraItemValue(item, source, key, value) : item,
          ),
        } as KontraCriticalField)
      : f,
  );
}

/* ------------------------------------------------------------------ */
/* Document Verification: subkategori custom                            */
/* ------------------------------------------------------------------ */

export type AddDocumentResult =
  | { ok: true; checklist: BankGuaranteeChecklist; documentId: number }
  | { ok: false; reason: "empty" | "duplicate" | "unknown-category"; message: string };

/**
 * Menambah subkategori/dokumen custom pada kategori utama. Nama kosong atau kembar ditolak,
 * begitu pula kategori yang tidak dikenal.
 */
export function addCustomDocument(
  c: BankGuaranteeChecklist,
  categoryKey: string,
  name: string,
): AddDocumentResult {
  if (!getDocumentCategory(categoryKey)) {
    return { ok: false, reason: "unknown-category", message: "Kategori dokumen tidak ditemukan." };
  }
  const documentName = name.trim().replace(/\s+/g, " ");
  if (!documentName) {
    return { ok: false, reason: "empty", message: "Nama dokumen wajib diisi." };
  }
  if (findDuplicateDocument(c.documentVerification, categoryKey, documentName)) {
    return {
      ok: false,
      reason: "duplicate",
      message: `"${documentName}" sudah ada pada kategori ini. Gunakan nama lain atau periksa daftar di atas.`,
    };
  }
  const documentId = nextDocumentId(c.documentVerification);
  return {
    ok: true,
    documentId,
    checklist: {
      ...c,
      documentVerification: [
        ...c.documentVerification,
        { id: documentId, documentName, status: null, notes: "", categoryKey, custom: true },
      ],
    },
  };
}

/** Menghapus dokumen custom (subkategori statis tidak dapat dihapus). */
export function removeCustomDocument(
  c: BankGuaranteeChecklist,
  documentId: number,
): BankGuaranteeChecklist {
  return {
    ...c,
    documentVerification: c.documentVerification.filter((d) => !(d.id === documentId && d.custom)),
  };
}

export function setOpiniAdk(
  c: BankGuaranteeChecklist,
  value: string,
): BankGuaranteeChecklist {
  return { ...c, opiniAdk: value };
}

export function markDone(c: BankGuaranteeChecklist): BankGuaranteeChecklist {
  return { ...c, status: "Done", completedAt: nowIso() };
}

/** Membuka kembali checklist Done sebagai Draft; completedAt dihapus. */
export function reopenAsDraft(c: BankGuaranteeChecklist): BankGuaranteeChecklist {
  const { completedAt: _completedAt, ...rest } = c;
  void _completedAt;
  return { ...rest, status: "Draft" };
}
