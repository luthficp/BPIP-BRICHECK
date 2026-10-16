import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HISTORY_ARCHIVE_KEY,
  HISTORY_RESET_FLAG_KEY,
  resetHistoryOnce,
  type StorageLike,
} from "./history-reset";

const DATA_KEY = "bri-bg-checklist:v1";

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

const OLD = JSON.stringify({ version: 2, items: [{ id: "lama-1" }, { id: "lama-2" }] });

describe("pembersihan History Task Monitoring (satu kali)", () => {
  it("mengosongkan riwayat lama dan menyimpan salinan di arsip", () => {
    const storage = new MemoryStorage();
    storage.setItem(DATA_KEY, OLD);

    const result = resetHistoryOnce(storage, DATA_KEY);
    assert.deepEqual(result, { performed: true, archived: true });
    assert.equal(storage.getItem(DATA_KEY), null, "daftar aktif kosong");
    assert.equal(storage.getItem(HISTORY_ARCHIVE_KEY), OLD, "salinan lama tidak hilang");
    assert.ok(storage.getItem(HISTORY_RESET_FLAG_KEY));
  });

  it("task baru setelah pembersihan tetap tersimpan dan tidak dibersihkan lagi", () => {
    const storage = new MemoryStorage();
    storage.setItem(DATA_KEY, OLD);
    resetHistoryOnce(storage, DATA_KEY);

    const fresh = JSON.stringify({ version: 2, items: [{ id: "baru-1" }] });
    storage.setItem(DATA_KEY, fresh);

    // Dibuka berkali-kali (reload): tidak ada pembersihan ulang.
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(resetHistoryOnce(storage, DATA_KEY), { performed: false, archived: false });
    }
    assert.equal(storage.getItem(DATA_KEY), fresh);
  });

  it("browser baru tanpa data: hanya memasang penanda sehingga task pertama aman", () => {
    const storage = new MemoryStorage();
    assert.deepEqual(resetHistoryOnce(storage, DATA_KEY), { performed: true, archived: false });
    assert.equal(storage.getItem(HISTORY_ARCHIVE_KEY), null);

    storage.setItem(DATA_KEY, OLD);
    assert.equal(resetHistoryOnce(storage, DATA_KEY).performed, false);
    assert.equal(storage.getItem(DATA_KEY), OLD);
  });

  it("tidak menyentuh kunci lain (mis. nama ADK terakhir)", () => {
    const storage = new MemoryStorage();
    storage.setItem("bri-bg-checklist:last-adk", "Andi");
    storage.setItem(DATA_KEY, OLD);
    resetHistoryOnce(storage, DATA_KEY);
    assert.equal(storage.getItem("bri-bg-checklist:last-adk"), "Andi");
  });

  it("storage yang melempar error tidak menghentikan aplikasi", () => {
    const broken: StorageLike = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(resetHistoryOnce(broken, DATA_KEY), { performed: false, archived: false });
  });

  it("arsip gagal (kuota penuh): riwayat tetap dikosongkan sesuai permintaan", () => {
    const storage = new MemoryStorage();
    storage.setItem(DATA_KEY, OLD);
    const original = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (key === HISTORY_ARCHIVE_KEY) throw new Error("QuotaExceededError");
      original(key, value);
    };
    assert.deepEqual(resetHistoryOnce(storage, DATA_KEY), { performed: true, archived: false });
    assert.equal(storage.getItem(DATA_KEY), null);
    assert.ok(storage.getItem(HISTORY_RESET_FLAG_KEY));
  });
});
