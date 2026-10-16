import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createEmptyChecklist } from "@/lib/checklist/factory";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { RemoteError, type RemoteChecklistApi, type SaveResult } from "@/lib/supabase/remote";

import { CloudRepository, cacheKeyFor, stableStringify, syncStateKeyFor } from "./cloud-repository";
import type { StorageLike } from "./history-reset";
import { createLocalStorageRepository } from "./local-storage-repository";

/* ------------------------------------------------------------------ fakes */
class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

/** Server tiruan: menyalin aturan fungsi database (milik satu akun, tolak bila versi server lebih baru). */
class FakeServer implements RemoteChecklistApi {
  rows = new Map<string, BankGuaranteeChecklist>();
  down: null | "network" | "server" | "auth" = null;
  rejectIds = new Set<string>();
  calls: string[] = [];
  unloadSent: string[] = [];
  beforeSaveResolves: (() => void) | null = null;

  private guard() {
    if (this.down === "network") throw new RemoteError("network", "putus");
    if (this.down === "server") throw new RemoteError("server", "503");
    if (this.down === "auth") throw new RemoteError("auth", "sesi");
  }
  async list() {
    this.calls.push("list");
    this.guard();
    return [...this.rows.values()].map((r) => JSON.parse(JSON.stringify(r)));
  }
  async get(id: string) {
    this.calls.push(`get:${id}`);
    this.guard();
    const r = this.rows.get(id);
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }
  async save(c: unknown): Promise<SaveResult> {
    const item = c as BankGuaranteeChecklist;
    this.calls.push(`save:${item.id}`);
    this.guard();
    if (this.rejectIds.has(item.id)) throw new RemoteError("rejected", "data tidak valid");
    this.beforeSaveResolves?.();
    const stored = this.rows.get(item.id);
    if (stored && item.updatedAt < stored.updatedAt) return { saved: false, reason: "stale", updatedAt: stored.updatedAt };
    this.rows.set(item.id, JSON.parse(JSON.stringify(item)));
    return { saved: true, updatedAt: item.updatedAt };
  }
  async remove(id: string) {
    this.calls.push(`remove:${id}`);
    this.guard();
    this.rows.delete(id);
  }
  saveOnUnload(c: unknown) {
    this.unloadSent.push((c as BankGuaranteeChecklist).id);
    return true;
  }
}

const USER = "11111111-1111-4111-8111-111111111111";
let storage: MemoryStorage;
let server: FakeServer;
let repos: CloudRepository[] = [];
let changed = 0;

function makeRepo(opts: { unloading?: () => boolean } = {}) {
  const repo = new CloudRepository({
    userId: USER,
    storage,
    remote: server,
    cache: createLocalStorageRepository(cacheKeyFor(USER)),
    notifyDataChanged: () => void changed++,
    isUnloading: opts.unloading,
  });
  repos.push(repo);
  return repo;
}
const task = (name: string, updatedAt?: string): BankGuaranteeChecklist => {
  const c = createEmptyChecklist("ADK Uji");
  return { ...c, taskName: name, updatedAt: updatedAt ?? c.updatedAt };
};

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  server = new FakeServer();
  repos = [];
  changed = 0;
});
afterEach(() => {
  for (const r of repos) r.dispose();
  delete (globalThis as { window?: unknown }).window;
});

/* ------------------------------------------------------------------ tests */
describe("CloudRepository", () => {
  it("simpan: tertulis lokal seketika (sinkron), tertunda, lalu terkirim dan tanda hilang", async () => {
    const repo = makeRepo();
    const c = task("A");
    const p = repo.save(c);
    // sebelum await apa pun: cache + penanda sudah ada
    assert.equal(createLocalStorageRepository(cacheKeyFor(USER)).readAllSync().length, 1);
    assert.equal(repo.getSnapshot().pending, 1);
    assert.ok(JSON.parse(storage.getItem(syncStateKeyFor(USER))!).dirty.includes(c.id));
    await p;
    await repo.sync();
    assert.equal(server.rows.get(c.id)?.taskName, "A");
    assert.equal(repo.getSnapshot().pending, 0);
    assert.equal(repo.getSnapshot().status, "idle");
    assert.deepEqual(JSON.parse(storage.getItem(syncStateKeyFor(USER))!).dirty, []);
  });

  it("offline: perubahan tidak hilang; status offline; terkirim saat koneksi kembali", async () => {
    const repo = makeRepo();
    server.down = "network";
    const c = task("Offline");
    await repo.save(c);
    await repo.sync();
    assert.equal(repo.getSnapshot().status, "offline");
    assert.equal(repo.getSnapshot().pending, 1);
    assert.equal((await repo.get(c.id))?.taskName, "Offline"); // tetap terbaca
    server.down = null;
    await repo.sync();
    assert.equal(server.rows.has(c.id), true);
    assert.equal(repo.getSnapshot().pending, 0);
  });

  it("perubahan tertunda selamat dari reload (instans baru membaca penanda tersimpan)", async () => {
    const first = makeRepo();
    server.down = "network";
    const c = task("Reload");
    await first.save(c);
    first.dispose();
    server.down = null;
    const second = makeRepo();
    assert.equal(second.getSnapshot().pending, 1);
    await second.sync();
    assert.equal(server.rows.get(c.id)?.taskName, "Reload");
    assert.equal(second.getSnapshot().pending, 0);
  });

  it("list(): menunggu sinkron awal dan memuat data akun dari server (perangkat baru)", async () => {
    const a = task("Dari server 1");
    const b = task("Dari server 2");
    server.rows.set(a.id, a);
    server.rows.set(b.id, b);
    const repo = makeRepo();
    const items = await repo.list();
    assert.deepEqual(items.map((i) => i.taskName).sort(), ["Dari server 1", "Dari server 2"]);
    assert.ok(changed >= 1);
  });

  it("tarik: task yang dihapus di perangkat lain dibuang; task lokal belum terkirim dipertahankan", async () => {
    const repo = makeRepo();
    const gone = task("Akan hilang");
    await repo.save(gone);
    await repo.sync();
    server.rows.delete(gone.id); // dihapus dari perangkat lain
    server.down = "network";
    const fresh = task("Baru lokal");
    await repo.save(fresh);
    server.down = null;
    await repo.sync();
    const names = (await repo.list()).map((i) => i.taskName);
    assert.deepEqual(names, ["Baru lokal"]);
    assert.equal(server.rows.has(fresh.id), true);
  });

  it("hapus: terkirim ke server; bila gagal tombstone menahan data agar tidak muncul lagi saat tarik", async () => {
    const repo = makeRepo();
    const c = task("Hapus");
    await repo.save(c);
    await repo.sync();
    server.down = "network";
    await repo.remove(c.id);
    assert.equal((await repo.list()).length, 0);
    assert.equal(repo.getSnapshot().pending, 1);
    await repo.sync(); // gagal, masih tertunda
    assert.equal(server.rows.has(c.id), true);
    server.down = null;
    await repo.sync();
    assert.equal(server.rows.has(c.id), false);
    assert.equal((await repo.list()).length, 0);
    assert.equal(repo.getSnapshot().pending, 0);
  });

  it("konflik: versi server lebih baru menang (simpan ditolak stale, cache diganti)", async () => {
    const repo = makeRepo();
    const base = task("Versi lama", "2026-10-16T01:00:00.000Z");
    await repo.save(base);
    await repo.sync();
    // perangkat lain menyimpan versi lebih baru
    server.rows.set(base.id, { ...base, taskName: "Versi perangkat lain", updatedAt: "2026-10-16T02:00:00.000Z" });
    // perangkat ini mengedit dari dasar lama (updatedAt lebih tua dari server)
    await repo.save({ ...base, taskName: "Edit basi", updatedAt: "2026-10-16T01:30:00.000Z" });
    await repo.sync();
    assert.equal((await repo.get(base.id))?.taskName, "Versi perangkat lain");
    assert.equal(server.rows.get(base.id)?.taskName, "Versi perangkat lain");
    assert.equal(repo.getSnapshot().pending, 0);
  });

  it("mengedit lagi saat pengiriman berlangsung: tetap tertunda dan terkirim pada putaran berikut", async () => {
    const repo = makeRepo();
    const c = task("v1", "2026-10-16T01:00:00.000Z");
    await repo.save(c);
    server.beforeSaveResolves = () => {
      server.beforeSaveResolves = null;
      void repo.save({ ...c, taskName: "v2", updatedAt: "2026-10-16T01:00:05.000Z" });
    };
    await repo.sync();
    assert.equal(server.rows.get(c.id)?.taskName, "v2");
    assert.equal(repo.getSnapshot().pending, 0);
  });

  it("ditolak server (rejected): masuk daftar gagal, tidak diulang, task lain tetap terkirim", async () => {
    const repo = makeRepo();
    const bad = task("Buruk");
    const good = task("Baik");
    server.rejectIds.add(bad.id);
    await repo.save(bad);
    await repo.save(good);
    await repo.sync();
    assert.equal(server.rows.has(good.id), true);
    assert.equal(repo.getSnapshot().failed.length, 1);
    assert.equal(repo.getSnapshot().failed[0].id, bad.id);
    assert.equal(repo.getSnapshot().pending, 0);
    const before = server.calls.filter((c) => c === `save:${bad.id}`).length;
    await repo.sync();
    assert.equal(server.calls.filter((c) => c === `save:${bad.id}`).length, before); // tidak diulang
    assert.equal((await repo.get(bad.id))?.taskName, "Buruk"); // data lokal utuh
    // diedit lagi -> dicoba lagi dan keluar dari daftar gagal
    server.rejectIds.clear();
    await repo.save({ ...bad, taskName: "Diperbaiki" });
    await repo.sync();
    assert.equal(repo.getSnapshot().failed.length, 0);
    assert.equal(server.rows.get(bad.id)?.taskName, "Diperbaiki");
  });

  it("sesi berakhir -> status auth (tanpa menghapus apa pun)", async () => {
    const repo = makeRepo();
    server.down = "auth";
    await repo.save(task("X"));
    await repo.sync();
    assert.equal(repo.getSnapshot().status, "auth");
    assert.equal(repo.getSnapshot().pending, 1);
  });

  it("server bermasalah (5xx) -> status error, data aman", async () => {
    const repo = makeRepo();
    server.down = "server";
    await repo.save(task("Y"));
    await repo.sync();
    assert.equal(repo.getSnapshot().status, "error");
    assert.equal((await repo.list()).length, 1);
  });

  it("get(): tidak ada di cache -> ambil dari server (tautan dari perangkat lain); tombstone tidak dihidupkan lagi", async () => {
    const remoteOnly = task("Hanya di server");
    server.rows.set(remoteOnly.id, remoteOnly);
    const repo = makeRepo();
    assert.equal((await repo.get(remoteOnly.id))?.taskName, "Hanya di server");
    await repo.remove(remoteOnly.id);
    server.down = "network";
    assert.equal(await repo.get(remoteOnly.id), null);
  });

  it("saat halaman ditutup: simpan juga mengirim keepalive; flushOnUnload mengirim semua yang tertunda", async () => {
    let unloading = true;
    const repo = makeRepo({ unloading: () => unloading });
    server.down = "network";
    const a = task("A");
    await repo.save(a);
    assert.deepEqual(server.unloadSent, [a.id]);
    unloading = false;
    const b = task("B");
    await repo.save(b);
    server.unloadSent.length = 0;
    repo.flushOnUnload();
    assert.deepEqual(server.unloadSent.sort(), [a.id, b.id].sort());
  });

  it("impor: hanya yang belum ada; tertunda lalu terkirim", async () => {
    const repo = makeRepo();
    const keep = task("Sudah ada");
    await repo.save(keep);
    await repo.sync();
    const n = await repo.importItems([keep, task("Lokal 1"), task("Lokal 2")]);
    assert.equal(n, 2);
    await repo.sync();
    assert.equal(server.rows.size, 3);
  });

  it("clearLocal: cache dan penanda akun dihapus", async () => {
    const repo = makeRepo();
    await repo.save(task("Z"));
    await repo.sync();
    repo.clearLocal();
    assert.equal(storage.getItem(cacheKeyFor(USER)), null);
    assert.equal(storage.getItem(syncStateKeyFor(USER)), null);
  });

  it("dua akun di browser yang sama memakai cache terpisah", async () => {
    const repo = makeRepo();
    await repo.save(task("Milik A"));
    const other = createLocalStorageRepository(cacheKeyFor("22222222-2222-4222-8222-222222222222"));
    assert.equal(other.readAllSync().length, 0);
  });
});

describe("stableStringify", () => {
  it("tidak peduli urutan kunci; mengabaikan undefined", () => {
    assert.equal(stableStringify({ b: 1, a: [{ d: 1, c: 2 }], u: undefined }), stableStringify({ a: [{ c: 2, d: 1 }], b: 1 }));
    assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
  });
});
