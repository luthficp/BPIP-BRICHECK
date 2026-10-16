import {
  APP_FULL_NAME,
  LABEL_ADK_NAME,
  LABEL_EXPORT_WORD,
  LABEL_MARK_DONE,
  LABEL_MEMORANDUM,
  LABEL_PUTUSAN,
  LABEL_REOPEN,
  LABEL_RESULT,
  LABEL_SUMMARY_OUTPUT,
  LABEL_TASK_MONITORING,
  LABEL_UNDERLYING,
} from "@/lib/checklist/config";

/**
 * Isi halaman FAQ. Dipisahkan dari komponen agar mudah diperiksa/diuji.
 * Semua penjelasan hanya menggambarkan perilaku aplikasi dan alur kerja yang
 * sudah ditetapkan; tidak menambah kebijakan operasional baru.
 */

export type FaqItem = {
  id: string;
  question: string;
  /** Paragraf pembuka (opsional). */
  answer: string[];
  /** Daftar poin (opsional). */
  points?: string[];
};

export type FaqSection = {
  id: string;
  title: string;
  description: string;
  /** "steps" = daftar langkah berurutan; lainnya = tanya jawab biasa. */
  kind: "qa" | "steps" | "glossary";
  items: FaqItem[];
};

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "tentang",
    title: "Tentang BRICHECK",
    description: "Apa itu BRICHECK dan untuk apa dipakai.",
    kind: "qa",
    items: [
      {
        id: "apa-itu",
        question: `Apa itu ${APP_FULL_NAME}?`,
        answer: [
          "BRICHECK adalah alat bantu verifikasi dan validasi untuk ADK saat memeriksa kesesuaian informasi Bank Garansi pada beberapa sumber, kemudian menghasilkan dokumen checklist untuk di-review secara manual oleh SOK.",
          "BRICHECK bukan sistem approval: aplikasi ini tidak menyetujui atau menolak pengajuan, dan tidak menggantikan review manual SOK.",
        ],
      },
      {
        id: "fungsi",
        question: "Apa saja fungsi dan tujuan BRICHECK?",
        answer: ["BRICHECK dibuat untuk:"],
        points: [
          "memandu ADK dalam melakukan verifikasi, mulai dari kelengkapan dokumen hingga pengisian critical field;",
          "membandingkan informasi yang sama pada beberapa sumber;",
          `menghitung ${LABEL_RESULT} secara otomatis (tidak perlu diketik);`,
          "menyorot informasi yang tidak sesuai agar tidak terlewat;",
          "membantu mengurangi kesalahan manusia (human error);",
          "mendukung dokumentasi review manual SOK melalui dokumen cetak atau ekspor.",
        ],
      },
      {
        id: "bukan-approval",
        question: "Apakah BRICHECK menyetujui atau menolak pengajuan?",
        answer: [
          "Tidak. Keputusan tetap berada pada proses review manual. SOK menulis opini dengan tangan pada dokumen hasil cetak atau ekspor, lalu menandatangani secara basah; tidak ada persetujuan atau tanda tangan digital di aplikasi ini.",
        ],
      },
      {
        id: "penyimpanan",
        question: "Di mana data task disimpan?",
        answer: [
          "Pada versi prototype ini, data task tersimpan di browser perangkat yang dipakai. Task tidak terlihat dari browser atau perangkat lain.",
        ],
      },
    ],
  },
  {
    id: "panduan",
    title: "Panduan langkah demi langkah",
    description: "Alur kerja dari membuat task sampai review SOK.",
    kind: "steps",
    items: [
      {
        id: "langkah-1",
        question: `Buka ${LABEL_TASK_MONITORING}`,
        answer: [
          `Home adalah halaman pertama saat BRICHECK dibuka; dari sana pilih ${LABEL_TASK_MONITORING} (atau gunakan menu di bagian atas). ${LABEL_TASK_MONITORING} menampilkan daftar task beserta Nomor, Nama Task, Risk Owner, Status (Draft atau Done), dan Timestamp. Pilih task untuk melanjutkan, atau buat task baru.`,
        ],
      },
      {
        id: "langkah-2",
        question: `Create Checklist dan isi ${LABEL_ADK_NAME}`,
        answer: [
          `Klik Create Checklist (menu atas dan ${LABEL_TASK_MONITORING}) atau Mulai Verifikasi di Home, lalu isi ${LABEL_ADK_NAME}. Nama ini tercatat sebagai Risk Owner task di ${LABEL_TASK_MONITORING}.`,
        ],
      },
      {
        id: "langkah-3",
        question: "Isi Informasi Pengajuan",
        answer: [
          "Lengkapi Atas Nama, CIF, dan Jenis Pengajuan pada bagian atas halaman checklist. Nama Task dapat disesuaikan bila perlu.",
        ],
      },
      {
        id: "langkah-4",
        question: "Document Verification",
        answer: [
          "Document Verification terdiri atas kategori utama berbentuk accordion (Underlying Transaction, Identitas Debitur, Identitas Beneficiary, Pengikatan Agunan, dst.) yang selalu tertutup saat step dibuka. Klik baris kategori untuk membuka atau menutupnya; isian tidak hilang saat ditutup atau saat berpindah step. Kategori bukan dokumen sehingga tidak diberi status; pada setiap subkategori/dokumen, pilih Ada atau Tidak Ada (hanya salah satu), lalu isi Keterangan sesuai Jenis Dokumen. Seluruh dokumen harus diberi status sebelum lanjut.",
          "Dokumen bernama sama pada kategori berbeda (mis. Surat Permohonan Bank Garansi dari Beneficiary di Underlying Transaction) berdiri sendiri: status dan keterangannya tidak saling mengikuti.",
          "Pada Identitas Beneficiary, bila Perjanjian Kerja Sama dipilih Ada, kolom Keterangan wajib berisi Nomor PKS (petunjuk: \"Isi Nomor PKS (Jika Ada)\"); selama kosong, tampil peringatan dan Document Verification belum dinyatakan lengkap. Bila dipilih Tidak Ada, Keterangan tidak wajib. Nomor PKS tersebut ditampilkan sebagai informasi pada Hasil Validasi Biaya dan tidak mengubah hasil perbandingan.",
          'Bila ada dokumen yang belum tersedia sebagai pilihan, klik tombol "+" pada kategori accordion yang sesuai (tersedia di setiap kategori accordion), ketik nama dokumen, lalu simpan. Dokumen tambahan dapat dihapus kembali; bila sudah berisi status atau keterangan, aplikasi meminta konfirmasi lebih dulu.',
        ],
      },
      {
        id: "langkah-5",
        question: "Critical Field Validation",
        answer: [
          `Isi setiap critical field sebagaimana tertulis pada ${LABEL_UNDERLYING} (acuan utama), ${LABEL_MEMORANDUM}, dan ${LABEL_PUTUSAN}. Bila suatu informasi memang tidak tercantum pada sumber tertentu, isi "Tidak tercantum" agar perbedaannya terdeteksi.`,
          "Underlying / Dasar Penerbitan adalah satu kotak teks lebar untuk seluruh sumber dan tidak dibandingkan antar sumber. Tekan Enter untuk baris baru; teks otomatis dibungkus dan tinggi kotak menyesuaikan isi. Biaya awalnya berisi Provisi dan Administrasi pada setiap sumber; setiap komponen dibandingkan dan menampilkan Hasil Validasi sendiri. Klik tombol \"Tambah Field\" pada baris Biaya untuk menambah field biaya bernama bebas (mis. Notaris): field itu dibuat serentak pada ketiga sumber dan ikut dibandingkan. Ikon tempat sampah pada field tambahan menghapusnya dari ketiga sumber sekaligus (Provisi dan Administrasi tidak dapat dihapus). Di bawah Hasil Validasi Biaya tampil panel \"Informasi PKS\" dari Document Verification: biru muda berisi \"PKS ada dengan Nomor ...\" bila PKS ada, amber lembut berisi \"PKS Tidak Ada. Silakan merujuk pada SE yang berlaku.\" bila tidak ada, atau peringatan bila PKS dipilih Ada tetapi Nomor PKS belum diisi; ini hanya informasi dan tidak memengaruhi perbandingan.",
        ],
      },
      {
        id: "langkah-6",
        question: LABEL_RESULT,
        answer: [
          `${LABEL_RESULT} muncul otomatis pada setiap critical field: SESUAI, TIDAK SESUAI, atau Belum lengkap. Bila satu atau lebih dari tiga sumber pada sebuah baris masih kosong, baris menampilkan Belum lengkap beserta jumlah isian yang belum terisi (misalnya "Belum lengkap : 2 field belum terisi"). SESUAI atau TIDAK SESUAI baru muncul setelah ketiga sumber terisi. Periksa kembali isian yang ditandai TIDAK SESUAI.`,
        ],
      },
      {
        id: "langkah-7",
        question: "Opini ADK",
        answer: [
          "Tulis kesimpulan ADK. Opini ADK baru dapat dibuka bila tidak ada lagi informasi TIDAK SESUAI pada Critical Field Validation; bila masih ada, tinjau dan koreksi isian berdasarkan sumbernya terlebih dahulu.",
        ],
      },
      {
        id: "langkah-8",
        question: LABEL_SUMMARY_OUTPUT,
        answer: [
          `Halaman ini berisi empat accordion Syarat Penyelesaian: Informasi Aplikasi, Document Verification, Critical Field Validation, dan Opini ADK. Buka setiap accordion untuk melihat status dan ringkasannya; syarat yang belum terpenuhi menampilkan tindakan yang dibutuhkan. Pada Document Verification, ringkasan menampilkan jumlah dokumen berstatus Ada dan Tidak Ada. Bila semua dokumen Ada, statusnya badge hijau "Lengkap". Bila ada dokumen berstatus Tidak Ada, statusnya "Terdapat Dokumen yang Tidak Ada" (amber) disertai panel daftar dokumen tersebut. Bila ada dokumen yang belum diberi status, tampil badge biru "Belum Diperiksa" beserta jumlah dan panel nama dokumennya (nama kategori sebagai keterangan kecil); jika dua kondisi ini muncul bersamaan, keduanya ditampilkan terpisah dan status utama memprioritaskan "Terdapat Dokumen yang Tidak Ada". Tidak Ada hanya informasi hasil pemeriksaan, bukan otomatis berarti persyaratan Bank Garansi tidak terpenuhi, dan rincian per kategori tetap ada di Step 1. Pada Critical Field Validation, ringkasan dipisah: "Critical Field Sesuai 7/7" menghitung tujuh critical field yang dibandingkan, sedangkan Informasi Bersama (Underlying / Dasar Penerbitan) ditampilkan terpisah dengan status Terisi atau Belum diisi dan tidak dihitung sebagai critical field kedelapan. Tombol "${LABEL_MARK_DONE}" aktif setelah seluruh syarat terpenuhi. Setelah Done, pilih output: Export PDF, ${LABEL_EXPORT_WORD}, Print, atau Pratinjau.`,
        ],
      },
      {
        id: "langkah-9",
        question: LABEL_REOPEN,
        answer: [
          `Bila task yang sudah Done perlu diubah, klik "${LABEL_REOPEN}". Status kembali menjadi Draft, seluruh data tetap tersimpan, dan isian dapat diedit. Setelah selesai, tandai Done kembali.`,
        ],
      },
      {
        id: "langkah-10",
        question: "Review SOK dengan tanda tangan basah",
        answer: [
          "SOK memeriksa dokumen hasil cetak atau ekspor secara manual, menulis Opini SOK dengan tangan pada area yang tersedia, mengisi nama dan tanggal, lalu menandatangani secara basah.",
        ],
      },
    ],
  },
  {
    id: "pertanyaan",
    title: "Pertanyaan yang sering muncul",
    description: "Jawaban singkat atas hal-hal yang sering ditanyakan.",
    kind: "qa",
    items: [
      {
        id: "kontra-garansi",
        question: "Mengisi Kontra Garansi",
        answer: [
          'Kontra Garansi adalah baris 7 pada Critical Field Validation dan dapat terdiri dari lebih dari satu jenis dan lebih dari satu item. Pada baris tersebut, atur jumlah tiap jenis (Fixed Asset, Kendaraan, Cash Collateral, Asuransi (SP3)) dengan tombol minus/plus (awalnya 0; pilih minimal satu), lalu klik "Terapkan Detail Kontra Garansi". Setiap item tampil sebagai sub-baris bernomor (7.1, 7.2, dan seterusnya).',
          'Setiap item diisi sendiri pada tiga sumber dan memiliki Hasil Validasi sendiri; baris 7 hanya menampilkan ringkasan pilihan. Untuk mengubah pilihan, klik "Ubah Pilihan", atur jumlahnya, lalu "Terapkan Perubahan" (atau "Batal" untuk memulihkan pilihan dan isian semula). Item yang tetap ada menyimpan isiannya; item baru kosong. Setiap pengurangan item, terisi maupun kosong, meminta konfirmasi lebih dulu ("Ya, Terapkan Perubahan"), dan hanya item yang dikurangi yang kehilangan datanya. Nomor tampil dapat bergeser, sedangkan isian tetap melekat pada itemnya.',
        ],
        points: [
          "Fixed Asset: Nomor SHM, Nilai (NPW), Atas Nama, dan Pengikatan;",
          "Kendaraan: Nomor BPKB, Nilai Kendaraan, Atas Nama, dan Pengikatan;",
          "Cash Collateral: Jenis Cash Coll, Nilai, dan Pengikatan;",
          "Asuransi (SP3): Nomor SP3 dan Nilai Asuransi.",
        ],
      },
      {
        id: "done-nonaktif",
        question: `Mengapa tombol "${LABEL_MARK_DONE}" tidak aktif?`,
        answer: [
          `Tombol aktif hanya bila seluruh syarat penyelesaian terpenuhi. Pada halaman ${LABEL_SUMMARY_OUTPUT}, accordion setiap syarat yang belum terpenuhi menampilkan statusnya beserta tombol untuk melengkapinya:`,
        ],
        points: [
          `Informasi Aplikasi (${LABEL_ADK_NAME}, Atas Nama, CIF, dan Jenis Pengajuan) terisi lengkap;`,
          "seluruh dokumen pada Document Verification sudah diberi status, dan Nomor PKS terisi bila Perjanjian Kerja Sama (Identitas Beneficiary) dipilih Ada;",
          "seluruh sumber pada Critical Field Validation terisi dan valid, serta tidak ada informasi yang TIDAK SESUAI;",
          "Opini ADK sudah diisi.",
        ],
      },
      {
        id: "mismatch-blokir",
        question: "Apakah informasi yang TIDAK SESUAI menghalangi lanjut ke Opini ADK?",
        answer: [
          `Ya. Selama masih ada ${LABEL_RESULT} TIDAK SESUAI pada Critical Field Validation, tombol lanjut ke Opini ADK ditahan dan aplikasi menampilkan alasannya. Tinjau dan koreksi isian berdasarkan ${LABEL_UNDERLYING}, ${LABEL_MEMORANDUM}, dan ${LABEL_PUTUSAN}.`,
          "Anda tetap dapat mengubah isian dan kembali ke step sebelumnya, termasuk Step 1. Task tidak dikunci dan data tidak dihapus. Isian yang belum lengkap tidak dihitung sebagai TIDAK SESUAI.",
        ],
      },
      {
        id: "belum-lengkap",
        question: "Apa bedanya TIDAK SESUAI dengan Belum lengkap?",
        answer: [
          'TIDAK SESUAI berarti ketiga sumber pada informasi itu sudah terisi dan ada perbedaan nyata di antaranya. Belum lengkap berarti masih ada nilai sumber yang kosong atau tidak valid; baris menampilkan "Belum lengkap : N field belum terisi". Selama masih ada nilai yang kosong, baris tidak disimpulkan sesuai maupun tidak sesuai, dan tidak dihitung sebagai ketidaksesuaian. Pada Biaya dan Kontra Garansi, komponen atau item yang sudah terisi tetap menampilkan hasilnya sendiri.',
        ],
      },
      {
        id: "ubah-done",
        question: "Bagaimana mengubah task yang sudah Done?",
        answer: [
          `Gunakan tombol "${LABEL_REOPEN}" pada halaman ${LABEL_SUMMARY_OUTPUT} (atau pada pengingat di bagian atas step lain). Seluruh data tetap tersimpan.`,
        ],
      },
    ],
  },
  {
    id: "glosarium",
    title: "Glosarium",
    description: "Istilah yang dipakai di BRICHECK.",
    kind: "glossary",
    items: [
      {
        id: "underlying",
        question: LABEL_UNDERLYING,
        answer: [
          "Dokumen dasar penerbitan Bank Garansi (misalnya kontrak, PO, atau SPK). Menjadi dokumen acuan utama saat membandingkan informasi.",
        ],
      },
      {
        id: "memorandum",
        question: LABEL_MEMORANDUM,
        answer: [
          `Salah satu sumber yang informasinya dibandingkan dengan ${LABEL_UNDERLYING} dan ${LABEL_PUTUSAN}.`,
        ],
      },
      {
        id: "putusan",
        question: LABEL_PUTUSAN,
        answer: [
          `Salah satu sumber yang informasinya dibandingkan dengan ${LABEL_UNDERLYING} dan ${LABEL_MEMORANDUM}.`,
        ],
      },
      {
        id: "hasil-validasi",
        question: LABEL_RESULT,
        answer: [
          `Hasil perbandingan otomatis per critical field: SESUAI bila seluruh sumber terisi dan sama, TIDAK SESUAI bila ada perbedaan, dan Belum lengkap bila masih ada isian kosong atau tidak valid. ${LABEL_RESULT} tidak diketik oleh ADK.`,
        ],
      },
      {
        id: "draft",
        question: "Draft",
        answer: ["Status task yang masih dapat diedit."],
      },
      {
        id: "done",
        question: "Done",
        answer: [
          `Status task yang sudah ditandai selesai. Isian terkunci dan pilihan Output tersedia. Task Done dapat dibuka kembali sebagai Draft.`,
        ],
      },
      {
        id: "opini-adk",
        question: "Opini ADK",
        answer: [
          "Kesimpulan tertulis ADK pada checklist, termasuk penjelasan bila ada informasi yang tidak sesuai.",
        ],
      },
      {
        id: "opini-sok",
        question: "Opini SOK",
        answer: [
          "Opini SOK yang ditulis tangan pada area yang disediakan di dokumen cetak atau ekspor. Tidak diisi melalui aplikasi.",
        ],
      },
    ],
  },
];

/** Istilah yang wajib ada di glosarium (dipakai pengujian). */
export const REQUIRED_GLOSSARY_TERMS = [
  LABEL_UNDERLYING,
  LABEL_MEMORANDUM,
  LABEL_PUTUSAN,
  LABEL_RESULT,
  "Draft",
  "Done",
  "Opini ADK",
  "Opini SOK",
] as const;
