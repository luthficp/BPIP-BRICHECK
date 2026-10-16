/**
 * Pembersihan satu kali untuk "History Task Monitoring".
 *
 * Permintaan: riwayat task lama dikosongkan, tetapi monitoring tetap aktif untuk
 * task baru. Karena data prototype tersimpan di browser (localStorage), pembersihan
 * dilakukan sekali per browser saat versi BRICHECK ini pertama kali dibuka:
 *
 *   1. Bila belum ada penanda `HISTORY_RESET_FLAG_KEY`, daftar task lama
 *      dipindahkan ke `ARCHIVE_KEY` (salinan tidak ditampilkan di aplikasi) dan
 *      kunci data aktif dikosongkan, sehingga Dashboard mulai kosong.
 *   2. Penanda ditulis. Sejak itu task baru tersimpan dan dimonitor seperti biasa,
 *      dan tidak pernah dibersihkan lagi.
 *
 * Fungsi ini murni terhadap objek penyimpanan yang diberikan agar mudah diuji.
 */

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Penanda bahwa pembersihan sudah dijalankan di browser ini. */
export const HISTORY_RESET_FLAG_KEY = "bricheck:history-reset:v1";
/** Salinan data lama (tidak dibaca aplikasi); dapat dihapus manual bila tidak diperlukan. */
export const HISTORY_ARCHIVE_KEY = "bri-bg-checklist:v1:archive-before-bricheck-reset";

export type HistoryResetResult = {
  /** true bila pembersihan dijalankan pada pemanggilan ini. */
  performed: boolean;
  /** true bila ada data lama yang dipindahkan ke arsip. */
  archived: boolean;
};

export function resetHistoryOnce(storage: StorageLike, dataKey: string): HistoryResetResult {
  try {
    if (storage.getItem(HISTORY_RESET_FLAG_KEY) !== null) {
      return { performed: false, archived: false };
    }

    const raw = storage.getItem(dataKey);
    let archived = false;
    if (raw !== null) {
      try {
        // Arsip lebih dulu, baru dikosongkan: bila arsip gagal pun permintaan
        // pengguna (riwayat kosong) tetap terpenuhi.
        storage.setItem(HISTORY_ARCHIVE_KEY, raw);
        archived = true;
      } catch {
        archived = false;
      }
      storage.removeItem(dataKey);
    }

    storage.setItem(HISTORY_RESET_FLAG_KEY, new Date().toISOString());
    return { performed: true, archived };
  } catch {
    // Storage tidak tersedia: aplikasi tetap berjalan tanpa pembersihan.
    return { performed: false, archived: false };
  }
}
