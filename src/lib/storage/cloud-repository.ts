import { migrateChecklist } from "@/lib/checklist/migrate";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { RemoteError, type RemoteChecklistApi } from "@/lib/supabase/remote";

import type { StorageLike } from "./history-reset";
import type { LocalCache } from "./local-storage-repository";
import type { ChecklistRepository } from "./repository";

/**
 * Repository mode Supabase: "simpan lokal dulu, sinkronkan ke server".
 *
 *  - Cache per-akun di localStorage = sumber baca/tulis UI (instan, tahan koneksi putus, sinkron saat tab ditutup).
 *  - Setiap simpan/hapus ditandai "tertunda" (disimpan permanen di localStorage) lalu didorong ke database
 *    lewat RPC; tanda dihapus hanya setelah server mengonfirmasi, jadi perubahan tidak hilang bila tab ditutup
 *    atau koneksi putus — dikirim ulang pada kunjungan berikutnya.
 *  - Tarik dari server: task milik akun ini yang tidak sedang tertunda ditimpa oleh versi server; task yang
 *    sudah tidak ada di server (dihapus dari perangkat lain) dibuang dari cache.
 *  - Konflik: "yang terakhir diubah menang" berdasarkan updatedAt (server menolak simpan bila versinya lebih baru).
 */
export type SyncStatus =
  /** Semua tersinkron. */
  | "idle"
  | "syncing"
  /** Tidak ada koneksi: perubahan menunggu. */
  | "offline"
  /** Server bermasalah sementara: akan dicoba lagi. */
  | "error"
  /** Sesi berakhir: perlu masuk lagi. */
  | "auth";

export type SyncSnapshot = {
  status: SyncStatus;
  /** Jumlah perubahan lokal yang belum dikonfirmasi server (simpan + hapus). */
  pending: number;
  /** Task yang ditolak server (tidak diulang otomatis). */
  failed: { id: string; message: string }[];
  lastSyncAt: string | null;
};

export const DATA_CHANGED_EVENT = "bricheck:data-changed";
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
const INITIAL_SYNC_TIMEOUT_MS = 6_000;

export const cacheKeyFor = (userId: string) => `bri-bg-checklist:v1:u:${userId}`;
export const syncStateKeyFor = (userId: string) => `bri-bg-checklist:sync:u:${userId}`;

type PersistedState = { dirty: string[]; deleted: string[]; failed: Record<string, string> };

export type CloudDeps = {
  userId: string;
  storage: StorageLike;
  remote: RemoteChecklistApi;
  cache: LocalCache;
  /** Dipanggil bila isi cache berubah karena data dari server (UI memuat ulang). */
  notifyDataChanged?: () => void;
  /** true bila halaman sedang ditutup (pagehide / tersembunyi). */
  isUnloading?: () => boolean;
  now?: () => Date;
};

/** JSON dengan kunci terurut: jsonb di database tidak mempertahankan urutan kunci. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export class CloudRepository implements ChecklistRepository {
  private readonly d: CloudDeps;
  private readonly dirty = new Set<string>();
  private readonly deleted = new Set<string>();
  private readonly failed = new Map<string, string>();
  private running: Promise<void> | null = null;
  /** true selama putaran sinkron berjalan (lebih awal daripada `running`, yang baru terisi setelah putaran mulai). */
  private active = false;
  private again = false;
  private initial: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private disposed = false;
  private status: SyncStatus = "idle";
  private lastSyncAt: string | null = null;
  private snapshot: SyncSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(deps: CloudDeps) {
    this.d = deps;
    this.load();
    this.snapshot = this.buildSnapshot();
  }

  /* ------------------------------ ChecklistRepository ----------------------------- */

  async list(): Promise<BankGuaranteeChecklist[]> {
    await this.ensureInitialSync();
    return this.d.cache.list();
  }

  async get(id: string): Promise<BankGuaranteeChecklist | null> {
    const cached = await this.d.cache.get(id);
    if (cached || this.deleted.has(id)) return cached;
    try {
      const found = migrateChecklist(await this.d.remote.get(id));
      if (found) {
        await this.d.cache.save(found);
        return found;
      }
    } catch {
      /* offline atau tidak ada: perlakukan sebagai tidak ditemukan */
    }
    return null;
  }

  async save(checklist: BankGuaranteeChecklist): Promise<void> {
    // Penulisan lokal dan penandaan terjadi SINKRON (sebelum await) agar aman saat tab ditutup.
    const written = this.d.cache.save(checklist);
    this.deleted.delete(checklist.id);
    this.failed.delete(checklist.id);
    this.dirty.add(checklist.id);
    this.persist();
    this.emit();
    // Saat halaman ditutup kirim juga dengan keepalive (idempoten; hasilnya tidak ditunggu).
    if (this.d.isUnloading?.()) this.d.remote.saveOnUnload(checklist);
    this.request();
    await written;
  }

  async remove(id: string): Promise<void> {
    const removed = this.d.cache.remove(id);
    this.dirty.delete(id);
    this.failed.delete(id);
    this.deleted.add(id);
    this.persist();
    this.emit();
    this.request();
    await removed;
  }

  /* --------------------------------- sinkronisasi --------------------------------- */

  getSnapshot = (): SyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Dorong perubahan tertunda lalu tarik data server. Panggilan bersamaan digabung. */
  sync(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.active = true;
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.cycle();
        } while (this.again && !this.disposed);
      } finally {
        this.active = false;
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Kirim semua perubahan tertunda dengan fetch keepalive (halaman sedang ditutup). */
  flushOnUnload(): void {
    if (this.dirty.size === 0) return;
    const items = this.d.cache.readAllSync();
    for (const id of this.dirty) {
      const item = items.find((i) => i.id === id);
      if (item) this.d.remote.saveOnUnload(item);
    }
  }

  /** Impor task dari penyimpanan lokal lama: hanya yang belum ada; ditandai tertunda lalu disinkronkan. */
  async importItems(items: BankGuaranteeChecklist[]): Promise<number> {
    const existing = new Set(this.d.cache.readAllSync().map((i) => i.id));
    let n = 0;
    for (const item of items) {
      if (existing.has(item.id)) continue;
      await this.d.cache.save(item);
      this.dirty.add(item.id);
      n++;
    }
    if (n > 0) {
      this.persist();
      this.emit();
      this.d.notifyDataChanged?.();
      void this.sync();
    }
    return n;
  }

  /** Hapus cache lokal akun ini (dipakai saat keluar; data aman di server). */
  clearLocal(): void {
    this.d.cache.clear();
    try {
      this.d.storage.removeItem(syncStateKeyFor(this.d.userId));
    } catch {
      /* abaikan */
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.listeners.clear();
  }

  /* ----------------------------------- internal ----------------------------------- */

  private ensureInitialSync(): Promise<void> {
    if (!this.initial) {
      this.initial = Promise.race([
        this.sync(),
        new Promise<void>((resolve) => setTimeout(resolve, INITIAL_SYNC_TIMEOUT_MS)),
      ]).catch(() => undefined);
    }
    return this.initial;
  }

  /** Minta sinkron setelah simpan/hapus. Bila sedang berjalan, putaran berjalan akan mengulang (tanpa jeda). */
  private request(): void {
    if (this.disposed) return;
    if (this.active) {
      this.again = true;
      return;
    }
    this.scheduleRetry(0);
  }

  private scheduleRetry(delayMs: number): void {
    if (this.disposed) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, delayMs);
  }

  private async cycle(): Promise<void> {
    this.setStatus("syncing");
    try {
      await this.push();
      await this.pull();
      this.attempt = 0;
      this.lastSyncAt = (this.d.now?.() ?? new Date()).toISOString();
      this.setStatus("idle");
    } catch (error) {
      const kind = error instanceof RemoteError ? error.kind : "network";
      if (kind === "auth") {
        this.setStatus("auth");
        return;
      }
      this.setStatus(kind === "network" ? "offline" : "error");
      const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
      this.attempt++;
      this.scheduleRetry(delay);
    }
  }

  private async push(): Promise<void> {
    for (const id of [...this.deleted]) {
      try {
        await this.d.remote.remove(id);
      } catch (error) {
        if (error instanceof RemoteError && error.kind === "rejected") {
          this.failed.set(id, error.message);
        } else {
          throw error;
        }
      }
      this.deleted.delete(id);
      this.persist();
      this.emit();
    }

    for (const id of [...this.dirty]) {
      const item = this.d.cache.readAllSync().find((i) => i.id === id);
      if (!item) {
        this.dirty.delete(id);
        continue;
      }
      let result;
      try {
        result = await this.d.remote.save(item);
      } catch (error) {
        if (error instanceof RemoteError && error.kind === "rejected") {
          this.failed.set(id, error.message);
          this.dirty.delete(id);
          this.persist();
          this.emit();
          continue;
        }
        throw error;
      }
      const current = this.d.cache.readAllSync().find((i) => i.id === id);
      if (result.saved) {
        // Bila pengguna mengedit lagi selama pengiriman, biarkan tertunda (dikirim pada putaran berikut).
        if (!current || current.updatedAt === item.updatedAt) this.dirty.delete(id);
      } else {
        // Server punya versi lebih baru: yang terakhir diubah menang.
        const remote = migrateChecklist(await this.d.remote.get(id));
        if (remote && (!current || remote.updatedAt > current.updatedAt)) {
          await this.d.cache.save(remote);
          this.dirty.delete(id);
          this.d.notifyDataChanged?.();
        } else if (!remote) {
          this.dirty.delete(id);
        }
      }
      this.persist();
      this.emit();
    }
  }

  private async pull(): Promise<void> {
    const remoteItems = (await this.d.remote.list())
      .map((raw) => migrateChecklist(raw))
      .filter((item): item is BankGuaranteeChecklist => item !== null);
    const local = this.d.cache.readAllSync();
    const localById = new Map(local.map((i) => [i.id, i]));

    const next: BankGuaranteeChecklist[] = [];
    const seen = new Set<string>();
    for (const r of remoteItems) {
      seen.add(r.id);
      if (this.deleted.has(r.id)) continue; // dihapus lokal, penghapusan belum terkirim
      const l = localById.get(r.id);
      next.push(this.dirty.has(r.id) && l ? l : r);
    }
    for (const l of local) {
      // Baru/belum terkirim, atau ditolak server: jangan dibuang dari perangkat (data pengguna).
      if (!seen.has(l.id) && (this.dirty.has(l.id) || this.failed.has(l.id))) next.push(l);
    }

    if (stableStringify(next) !== stableStringify(local)) {
      this.d.cache.replaceAll(next);
      this.d.notifyDataChanged?.();
    }
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.emit();
  }

  private buildSnapshot(): SyncSnapshot {
    return {
      status: this.status,
      pending: this.dirty.size + this.deleted.size,
      failed: [...this.failed].map(([id, message]) => ({ id, message })),
      lastSyncAt: this.lastSyncAt,
    };
  }

  private emit(): void {
    const next = this.buildSnapshot();
    if (stableStringify(next) === stableStringify(this.snapshot)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    const state: PersistedState = {
      dirty: [...this.dirty],
      deleted: [...this.deleted],
      failed: Object.fromEntries(this.failed),
    };
    try {
      this.d.storage.setItem(syncStateKeyFor(this.d.userId), JSON.stringify(state));
    } catch {
      /* storage penuh: tanda hanya di memori; data tetap ada di cache */
    }
  }

  private load(): void {
    try {
      const raw = this.d.storage.getItem(syncStateKeyFor(this.d.userId));
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<PersistedState>;
      for (const id of s.dirty ?? []) this.dirty.add(id);
      for (const id of s.deleted ?? []) this.deleted.add(id);
      for (const [id, msg] of Object.entries(s.failed ?? {})) this.failed.set(id, String(msg));
    } catch {
      /* rusak: mulai bersih */
    }
  }
}
