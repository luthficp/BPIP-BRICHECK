/**
 * Data model aplikasi Checklist Verifikasi & Validasi Bank Garansi.
 * Dipisahkan dari UI agar mudah dipindahkan ke backend/database.
 *
 * Versi skema 2: nilai critical field disimpan terstruktur (nominal, tanggal,
 * Provisi/Administrasi), bukan sekadar teks tampilan.
 *
 * Versi skema 3 (revisi 13 Oktober 2026):
 *   - Document Verification berkategori (kategori utama + subkategori, dapat ditambah ADK).
 *   - Biaya memiliki komponen bawaan Provisi & Administrasi dan field tambahan bernama bebas
 *     (`components`, dibuat/dihapus serentak pada ketiga sumber).
 *   - Kontra Garansi berupa daftar item (jenis + jumlah) dengan detail per sumber.
 *   - Underlying / Dasar Penerbitan menjadi satu field bersama (tidak dibandingkan).
 *
 * Versi skema 4: kategori Document Verification tanpa subitem (poin 1-3) memiliki satu baris
 * bawaan.
 *
 * Versi skema 5: kategori Identitas Beneficiary dan Underlying Transaction; dua baris langsung
 * diganti nama; Biaya memakai daftar komponen (Provisi & Administrasi bawaan + komponen
 * tambahan bernama bebas) yang sama untuk ketiga sumber.
 *
 * Versi skema 6: tiga poin duplikat (baris langsung 1-3) dihapus dari Document Verification;
 * kategori kini seluruhnya berupa accordion dengan subpoin.
 */

/** Naikkan bila bentuk data berubah; migrasi ada di `migrate.ts`. */
export const SCHEMA_VERSION = 6;

export type ChecklistStatus = "Draft" | "Done";

export type DocumentStatus = "Ada" | "Tidak Ada";

/** Hasil akhir Hasil Validasi yang tegas. */
export type MatchResult = "SESUAI" | "TIDAK SESUAI";

/**
 * State Hasil Validasi yang disimpan & ditampilkan.
 *  - "BELUM LENGKAP": masih ada isian sumber yang kosong/tidak valid; baris tidak
 *    disimpulkan SESUAI maupun TIDAK SESUAI dan bukan mismatch.
 *  - "BERSAMA": informasi bersama (Underlying / Dasar Penerbitan) yang tidak
 *    dibandingkan antar sumber; bukan SESUAI dan bukan mismatch.
 */
export type MatchState = MatchResult | "BELUM LENGKAP" | "BERSAMA";

export type CriticalFieldKey =
  | "jenisBg"
  | "tujuanBg"
  | "beneficiary"
  | "nilaiBg"
  | "jangkaWaktu"
  | "biaya"
  | "kontraGaransi"
  | "underlying";

/** Jenis input/komparasi per critical field. */
export type FieldKind = "select" | "text" | "currency" | "period" | "fees" | "kontra" | "shared";

/** Tiga sumber yang dibandingkan. Underlying Document adalah acuan utama. */
export type SourceKey = "underlyingDocument" | "ptk" | "mak";

export type DocumentVerification = {
  id: number;
  documentName: string;
  status: DocumentStatus | null;
  notes: string;
  /** Kunci kategori utama (lihat `DOCUMENT_CATEGORIES` di config.ts). */
  categoryKey: string;
  /** true = subkategori/dokumen yang ditambahkan ADK lewat tombol "+". */
  custom: boolean;
};

/* ------------------------------------------------------------------ */
/* Nilai terstruktur per sumber                                         */
/* ------------------------------------------------------------------ */

/**
 * Nilai Bank Garansi. `amount` adalah angka kanonik TANPA pemisah ribuan
 * ("4000000", "1250000.5"; boleh berakhir "." sementara ADK mengetik desimal).
 * String berseparator ("4,000,000") hanya dibuat saat ditampilkan.
 */
export type AmountValue = {
  /** Kode mata uang, default "IDR". */
  currency: string;
  amount: string;
};

/** Jangka Waktu: tanggal ISO (yyyy-mm-dd); string kosong = belum diisi. */
export type PeriodValue = {
  start: string;
  end: string;
};

/**
 * Satu komponen Biaya. Daftar komponen dimiliki field Biaya (bukan per sumber), sehingga nama dan
 * urutan komponen selalu sama pada Underlying Document, Memorandum, dan Putusan.
 */
export type FeeComponentDef = {
  /** Kunci stabil: "provisi" / "administrasi" (bawaan) atau id unik (tambahan). */
  id: string;
  label: string;
  /** true = ditambahkan ADK (dapat dihapus); false = Provisi / Administrasi. */
  custom: boolean;
};

/**
 * Nilai Biaya pada satu sumber: kunci = `FeeComponentDef.id`. Bila berbentuk angka, diformat
 * dengan pemisah ribuan; selain itu (mis. "1,25% p.a.") disimpan apa adanya.
 */
export type FeeValue = Record<string, string>;

/* ------------------------------------------------------------------ */
/* Kontra Garansi                                                       */
/* ------------------------------------------------------------------ */

export type KontraType = "fixedAsset" | "kendaraan" | "cashCollateral" | "asuransi";

/** Nilai satu field detail: teks, atau nominal terstruktur untuk field bertipe currency. */
export type KontraFieldValue = string | AmountValue;

/** Detail satu item pada satu sumber; kunci = `key` field pada `KONTRA_TYPES`. */
export type KontraDetail = Record<string, KontraFieldValue>;

/**
 * Satu item kontra garansi. Daftar item berlaku untuk transaksi (bukan per sumber):
 * ketiga sumber dibandingkan terhadap item yang sama, jadi detailnya disimpan
 * per sumber di dalam item.
 */
export type KontraItem = {
  id: string;
  type: KontraType;
  values: Record<SourceKey, KontraDetail>;
};

/* ------------------------------------------------------------------ */
/* Critical field                                                       */
/* ------------------------------------------------------------------ */

type CriticalFieldBase = {
  id: number;
  fieldName: string;
  /** Dihitung otomatis oleh validation engine; tidak pernah diketik ADK. */
  matchStatus: MatchState;
  /**
   * Isian lama (skema 1) yang tidak dapat dibaca sebagai nilai terstruktur.
   * Disimpan agar tidak ada data yang hilang; ADK mengisi ulang secara terstruktur.
   */
  legacy?: Partial<Record<SourceKey, string>>;
};

type PerSource<T> = { underlyingDocument: T; ptk: T; mak: T };

export type TextCriticalField = CriticalFieldBase &
  PerSource<string> & {
    key: "jenisBg" | "tujuanBg" | "beneficiary";
  };

/** Underlying / Dasar Penerbitan: satu nilai bersama, tidak dibandingkan antar sumber. */
export type SharedCriticalField = CriticalFieldBase & {
  key: "underlying";
  value: string;
};

/** Kontra Garansi: daftar item; setiap item punya detail untuk ketiga sumber. */
export type KontraCriticalField = CriticalFieldBase & {
  key: "kontraGaransi";
  items: KontraItem[];
};

export type AmountCriticalField = CriticalFieldBase & PerSource<AmountValue> & { key: "nilaiBg" };

export type PeriodCriticalField = CriticalFieldBase &
  PerSource<PeriodValue> & { key: "jangkaWaktu" };

export type FeesCriticalField = CriticalFieldBase &
  PerSource<FeeValue> & {
    key: "biaya";
    /** Komponen Biaya (urutan tampil). Selalu memuat Provisi dan Administrasi di awal. */
    components: FeeComponentDef[];
  };

export type CriticalField =
  | TextCriticalField
  | AmountCriticalField
  | PeriodCriticalField
  | FeesCriticalField
  | SharedCriticalField
  | KontraCriticalField;

/** Field yang nilainya disimpan per sumber (Underlying, Memorandum, Putusan). */
export type PerSourceCriticalField =
  | TextCriticalField
  | AmountCriticalField
  | PeriodCriticalField
  | FeesCriticalField;

export type BankGuaranteeChecklist = {
  id: string;
  /** Versi skema data; data tanpa field ini dianggap skema 1 dan dimigrasi. */
  schemaVersion: number;
  taskName: string;
  /** true bila ADK mengubah nama task secara manual (berhenti auto-derive). */
  taskNameCustom: boolean;
  adkName: string;
  atasNama: string;
  cif: string;
  jenisPengajuan: string;

  documentVerification: DocumentVerification[];
  criticalFields: CriticalField[];
  opiniAdk: string;

  status: ChecklistStatus;

  /** ISO 8601, dibuat oleh sistem. */
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
