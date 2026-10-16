import type { CriticalFieldKey, FeeComponentDef, FieldKind, KontraType, SourceKey } from "./types";

/**
 * Identitas & istilah resmi aplikasi. SEMUA teks yang tampil ke pengguna
 * (UI, cetak, PDF, Word, pratinjau) wajib memakai konstanta ini.
 *
 * Catatan: kunci data internal `ptk`, `mak`, dan `underlyingDocument` sengaja
 * tidak diganti agar data yang sudah tersimpan tetap terbaca. Hanya label yang
 * dilihat pengguna yang berubah.
 */
export const APP_NAME = "BRICHECK";
export const APP_TAGLINE = "BRI Checklist & Validation";
export const APP_FULL_NAME = `${APP_NAME} — ${APP_TAGLINE}`;

export const LABEL_UNDERLYING = "Underlying Document";
export const LABEL_PUTUSAN = "Putusan Bank Garansi";
export const LABEL_MEMORANDUM = "Memorandum Analisa Bank Garansi";
export const LABEL_RESULT = "Hasil Validasi";
export const LABEL_SUMMARY_OUTPUT = "Summary & Output";
export const LABEL_MARK_DONE = "Tandai Selesai (Done)";
export const LABEL_REOPEN = "Buka Kembali sebagai Draft";
export const LABEL_EXPORT_WORD = "Export Word";
export const LABEL_ADK_NAME = "Nama Lengkap ADK";
export const LABEL_TASK_MONITORING = "Task Monitoring";
export const LABEL_SHARED_INFO = "Informasi bersama";
/** Judul ringkasan (Summary & Output) untuk Underlying / Dasar Penerbitan. */
export const LABEL_SHARED_INFO_TITLE = "Informasi Bersama";

export const BG_TYPES = [
  "Advance Payment Bond",
  "Performance Bond",
  "Payment Bond",
  "Maintenance Bond",
  "Tender Bond",
  "Customs Bond",
] as const;

/** Mata uang yang dikenali engine (lihat CURRENCY_PATTERNS di validation/normalize). */
export const CURRENCIES = ["IDR", "USD", "EUR", "SGD", "JPY", "GBP", "AUD", "MYR", "CNY"] as const;
export const DEFAULT_CURRENCY = "IDR";

/* ------------------------------------------------------------------ */
/* Document Verification: kategori utama dan subkategori awal           */
/* ------------------------------------------------------------------ */

/**
 * Subpoin "Perjanjian Kerja Sama" pada kategori Identitas Beneficiary: bila dipilih Ada, Keterangan
 * wajib berisi Nomor PKS, dan informasi PKS ditampilkan pada Hasil Validasi Biaya (CFV).
 */
export const PKS_CATEGORY_KEY = "identitas-beneficiary";
export const PKS_DOCUMENT_NAME = "Perjanjian Kerja Sama";
export const PKS_NOTES_PLACEHOLDER = "Isi Nomor PKS (Jika Ada)";

/**
 * Kategori yang pernah menjadi baris langsung (poin 1-3) dan sudah dihapus dari Document
 * Verification karena duplikat dengan kategori lain (skema 6). Dipakai migrasi: baris bawaannya
 * dibuang, sedangkan dokumen tambahan ADK di dalamnya dipindahkan ke "Surat-Surat Lainnya".
 */
export const REMOVED_DOCUMENT_CATEGORY_KEYS: readonly string[] = [
  "surat-permohonan",
  "permohonan-distributor",
  "perjanjian-kerja-sama",
];

export type DocumentCategoryDef = {
  /** Kunci stabil (disimpan pada data). */
  key: string;
  /** Nama kategori utama (bukan dokumen). */
  title: string;
  /** Subkategori/dokumen awal; "Lainnya" tidak statis, ditambahkan ADK lewat tombol "+". */
  items: readonly string[];
};

export const DOCUMENT_CATEGORIES: readonly DocumentCategoryDef[] = [
  {
    // Subpoin dengan nama yang mirip dokumen di kategori lain tetap berdiri sendiri: status dan
    // keterangan TIDAK disinkronkan (dibedakan oleh `categoryKey`).
    key: "underlying-transaction",
    title: "Underlying Transaction",
    items: [
      "PKS/Surat Penunjukkan antara Applicant & Beneficiary",
      "Surat Permohonan Bank Garansi dari Beneficiary",
      "Surat Pengajuan Bank Garansi dari Applicant",
    ],
  },
  {
    key: "identitas-debitur",
    title: "Identitas Debitur",
    items: [
      "KTP",
      "Kartu Keluarga",
      "Copy surat kewarganegaraan/surat keterangan ganti nama",
      "Foto debitur",
    ],
  },
  {
    key: PKS_CATEGORY_KEY,
    title: "Identitas Beneficiary",
    items: ["Nama Beneficiary", "Alamat", PKS_DOCUMENT_NAME],
  },
  {
    key: "identitas-usaha-debitur",
    title: "Identitas Usaha Debitur",
    items: ["Akta pendirian", "Akta perubahan", "SIUP", "NPWP"],
  },
  {
    key: "surat-utang",
    title: "Surat Utang",
    items: ["Surat utang", "Adendum surat utang"],
  },
  {
    key: "pengikatan-agunan",
    title: "Pengikatan Agunan",
    items: [
      "Sertifikat CV",
      "Sertifikat Hipotek",
      "Sertifikat HT",
      "Fidusia",
      "Gadai",
      "Cessie",
      "SKMHT",
      "Personal/Corporate Guarantee",
    ],
  },
  {
    key: "bukti-kepemilikan-agunan",
    title: "Bukti Kepemilikan Agunan",
    items: ["Hak atas tanah", "Bilyet deposito/buku tabungan", "BPKB", "Asuransi"],
  },
  {
    key: "pemeriksaan-agunan",
    title: "Pemeriksaan Agunan",
    items: ["Penilaian tanah", "Penilaian tanah dan bangunan"],
  },
  {
    key: "paket-bank-garansi",
    title: "Paket Bank Garansi",
    items: [
      "MABG",
      "LKN",
      "Penilaian agunan",
      "Pemeriksaan kelengkapan paket",
      "PTBG",
      "Offering Letter",
      "PPND",
    ],
  },
  { key: "surat-surat-lainnya", title: "Surat-Surat Lainnya", items: [] },
];

export const FALLBACK_DOCUMENT_CATEGORY = "surat-surat-lainnya";

export function getDocumentCategory(key: string): DocumentCategoryDef | undefined {
  return DOCUMENT_CATEGORIES.find((category) => category.key === key);
}

/** Dokumen bawaan (statis) sebuah kategori. */
export function getCategoryStaticItems(category: DocumentCategoryDef): readonly string[] {
  return category.items;
}

export type CriticalFieldDef = {
  key: CriticalFieldKey;
  label: string;
  kind: FieldKind;
  placeholder: string;
  /** true = boleh multi-baris (Enter membuat baris baru). */
  multiline: boolean;
  /** Pilihan dropdown (kind "select"). */
  options?: readonly string[];
};

/** Urutan di sini adalah urutan tampil, cetak, PDF, dan Word. */
export const CRITICAL_FIELD_DEFS: CriticalFieldDef[] = [
  {
    key: "jenisBg",
    label: "Jenis Bank Garansi",
    kind: "select",
    placeholder: "Pilih jenis",
    multiline: false,
    options: BG_TYPES,
  },
  {
    key: "tujuanBg",
    label: "Tujuan Bank Garansi",
    kind: "text",
    placeholder: "Tujuan penerbitan",
    multiline: true,
  },
  {
    key: "beneficiary",
    label: "Beneficiary",
    kind: "text",
    placeholder: "Nama penerima jaminan",
    multiline: false,
  },
  {
    key: "nilaiBg",
    label: "Nilai Bank Garansi",
    kind: "currency",
    placeholder: "0",
    multiline: false,
  },
  {
    key: "jangkaWaktu",
    label: "Jangka Waktu",
    kind: "period",
    placeholder: "dd/mm/yyyy",
    multiline: false,
  },
  {
    key: "biaya",
    label: "Biaya",
    kind: "fees",
    placeholder: "Nominal atau %",
    multiline: false,
  },
  {
    key: "kontraGaransi",
    label: "Kontra Garansi",
    kind: "kontra",
    placeholder: "",
    multiline: false,
  },
  {
    key: "underlying",
    label: "Underlying / Dasar Penerbitan",
    kind: "shared",
    placeholder: "Nomor & tanggal kontrak / PO / SPK",
    multiline: true,
  },
];

export function getFieldDef(key: CriticalFieldKey): CriticalFieldDef {
  const def = CRITICAL_FIELD_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`Critical field tidak dikenal: ${key}`);
  return def;
}

/**
 * Komponen Biaya bawaan (tidak dapat dihapus). Komponen tambahan dibuat ADK lewat tombol "+"
 * (nama bebas) dan disimpan pada field Biaya (`components`), sama untuk ketiga sumber.
 */
export const DEFAULT_FEE_COMPONENTS = [
  { id: "provisi", label: "Provisi" },
  { id: "administrasi", label: "Administrasi" },
] as const;

export function defaultFeeComponents(): FeeComponentDef[] {
  return DEFAULT_FEE_COMPONENTS.map((c) => ({ id: c.id, label: c.label, custom: false }));
}

/* ------------------------------------------------------------------ */
/* Kontra Garansi: jenis dan field detail wajib per jenis               */
/* ------------------------------------------------------------------ */

export type KontraFieldDef = {
  key: string;
  label: string;
  /** "currency" = nominal + mata uang (dibandingkan sebagai angka); "text" = teks. */
  kind: "text" | "currency";
  placeholder: string;
};

export type KontraTypeDef = {
  key: KontraType;
  label: string;
  fields: readonly KontraFieldDef[];
};

/** Urutan di sini = urutan kontrol konfigurasi dan urutan item pada daftar. */
export const KONTRA_TYPES: readonly KontraTypeDef[] = [
  {
    key: "fixedAsset",
    label: "Fixed Asset",
    // Urutan = urutan baca layout 2 x 2: baris 1 (Nomor SHM, Nilai), baris 2 (Atas Nama, Pengikatan).
    fields: [
      { key: "noShm", label: "Nomor SHM", kind: "text", placeholder: "Nomor SHM" },
      { key: "nilaiNpw", label: "Nilai (NPW)", kind: "currency", placeholder: "0" },
      { key: "atasNama", label: "Atas Nama", kind: "text", placeholder: "Atas nama pemilik" },
      { key: "pengikatan", label: "Pengikatan", kind: "text", placeholder: "Jenis pengikatan" },
    ],
  },
  {
    key: "kendaraan",
    label: "Kendaraan",
    // Layout 2 x 2: baris 1 (Nomor BPKB, Nilai Kendaraan), baris 2 (Atas Nama, Pengikatan).
    fields: [
      { key: "noBpkb", label: "Nomor BPKB", kind: "text", placeholder: "Nomor BPKB" },
      { key: "nilaiKendaraan", label: "Nilai Kendaraan", kind: "currency", placeholder: "0" },
      { key: "atasNama", label: "Atas Nama", kind: "text", placeholder: "Atas nama pemilik" },
      { key: "pengikatan", label: "Pengikatan", kind: "text", placeholder: "Jenis pengikatan" },
    ],
  },
  {
    key: "cashCollateral",
    label: "Cash Collateral",
    fields: [
      { key: "jenisCashColl", label: "Jenis Cash Coll", kind: "text", placeholder: "Jenis cash collateral" },
      { key: "nilai", label: "Nilai", kind: "currency", placeholder: "0" },
      { key: "pengikatan", label: "Pengikatan", kind: "text", placeholder: "Jenis pengikatan" },
    ],
  },
  {
    key: "asuransi",
    label: "Asuransi (SP3)",
    fields: [
      { key: "noSp3", label: "Nomor SP3", kind: "text", placeholder: "Nomor SP3" },
      { key: "nilaiAsuransi", label: "Nilai Asuransi", kind: "currency", placeholder: "0" },
    ],
  },
];

export function getKontraTypeDef(type: KontraType): KontraTypeDef {
  const def = KONTRA_TYPES.find((d) => d.key === type);
  if (!def) throw new Error(`Jenis kontra garansi tidak dikenal: ${type}`);
  return def;
}

/**
 * Urutan sumber pada seluruh tampilan dan output:
 * Underlying Document (acuan) -> Memorandum Analisa Bank Garansi -> Putusan Bank Garansi -> Hasil Validasi.
 * Kunci data internal tetap `underlyingDocument`, `mak`, `ptk`.
 */
export const SOURCES: {
  key: SourceKey;
  label: string;
  /** Catatan singkat untuk header kolom. */
  note?: string;
}[] = [
  { key: "underlyingDocument", label: LABEL_UNDERLYING, note: "Acuan" },
  { key: "mak", label: LABEL_MEMORANDUM },
  { key: "ptk", label: LABEL_PUTUSAN },
];

/** Urutan kunci sumber (sama dengan `SOURCES`). */
export const SOURCE_ORDER: readonly SourceKey[] = SOURCES.map((s) => s.key);

/** Pesan saat navigasi ke Opini ADK diblokir karena masih ada TIDAK SESUAI. */
export function mismatchBlockText(count: number): string {
  return `Masih ada ${count} informasi TIDAK SESUAI pada Critical Field Validation. Tinjau dan koreksi berdasarkan ${LABEL_UNDERLYING}, ${LABEL_MEMORANDUM}, dan ${LABEL_PUTUSAN} sebelum melanjutkan ke Opini ADK.`;
}

export const STEPS = [
  { id: 1, title: "Document Verification", hint: "Cek kelengkapan dokumen" },
  { id: 2, title: "Critical Field Validation", hint: "Bandingkan 3 sumber" },
  { id: 3, title: "Opini ADK", hint: "Tulis kesimpulan" },
  { id: 4, title: LABEL_SUMMARY_OUTPUT, hint: "Selesaikan & cetak" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

/** Nilai yang dipakai ADK bila informasi memang tidak tercantum pada sumber; dihitung sebagai terisi. */
export const NOT_LISTED_VALUE = "Tidak tercantum";

/**
 * Catatan validasi ringkas di bawah tabel Critical Field Validation (empat poin
 * berlabel). Segmen di antara tanda ` ditampilkan sebagai kode/nilai contoh.
 * Isinya merangkum aturan validasi yang berlaku; tidak menambah aturan baru.
 */
export const VALIDATION_NOTES: readonly { label: string; text: string }[] = [
  {
    label: "Kelengkapan sumber",
    text: `Jika informasi tidak tercantum pada sumber, isi \`${NOT_LISTED_VALUE}\`.`,
  },
  {
    label: "Perbandingan teks",
    text: "Kapitalisasi, spasi berlebih, dan titik/koma pada singkatan seperti `PT.` diabaikan; perbedaan isi tetap terdeteksi.",
  },
  {
    label: "Nominal dan persentase",
    text: "Koma adalah pemisah ribuan dan titik adalah desimal (contoh: `1.25%`); nominal dibandingkan sebagai angka.",
  },
  {
    label: "Jangka waktu dan biaya",
    text: "Jangka waktu dibandingkan berdasarkan tanggal; durasi = tanggal akhir − tanggal mulai (selisih kalender, tidak inklusif). Provisi, Administrasi, dan setiap field biaya tambahan dibandingkan secara terpisah.",
  },
];

/** Teks peringatan global bila ada critical field TIDAK SESUAI (UI, print, PDF). */
export const MISMATCH_WARNING_TITLE = "Ketidaksesuaian Informasi";
export const MISMATCH_WARNING_ACTION = `Periksa kembali ${LABEL_UNDERLYING}, ${LABEL_MEMORANDUM}, dan ${LABEL_PUTUSAN} sebelum checklist dilanjutkan.`;
export const MISMATCH_WARNING_TEXT = `Ditemukan satu atau lebih critical field yang tidak sesuai. ${MISMATCH_WARNING_ACTION}`;
