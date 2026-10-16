"use client";

import * as React from "react";

import {
  CloudRepository,
  DATA_CHANGED_EVENT,
  cacheKeyFor,
  type SyncSnapshot,
} from "@/lib/storage/cloud-repository";
import { createLocalStorageRepository } from "@/lib/storage/local-storage-repository";
import { resetActiveRepository, setActiveRepository } from "@/lib/storage";
import { AuthClient, SESSION_STORAGE_KEY, type AuthUser } from "@/lib/supabase/auth-client";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createRemoteApi } from "@/lib/supabase/remote";

/** Selang tarik berkala dari server (ms) selama tab terlihat. */
const POLL_MS = 60_000;

export type AuthStatus = "local" | "loading" | "signed-out" | "signed-in";

export type SignOutResult = { done: true } | { done: false; pending: number };

type AuthContextValue = {
  /** "local" = Supabase tidak dikonfigurasi (localStorage seperti semula). */
  status: AuthStatus;
  user: AuthUser | null;
  /** Hanya ada setelah masuk. */
  sync: SyncSnapshot | null;
  signIn(email: string, password: string): Promise<void>;
  /** Tanpa `force`, keluar ditunda bila masih ada perubahan yang belum terkirim ke server. */
  signOut(options?: { force?: boolean }): Promise<SignOutResult>;
  syncNow(): void;
  /** Repository sinkron aktif (untuk impor data lokal). */
  repository: CloudRepository | null;
};

const IDLE_SNAPSHOT: SyncSnapshot = { status: "idle", pending: 0, failed: [], lastSyncAt: null };
const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext<AuthContextValue | null>(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Nilai env disisipkan saat build, jadi sama di server dan klien (tidak menyebabkan mismatch hydration).
  const config = React.useMemo(() => getSupabaseConfig(), []);
  const [status, setStatus] = React.useState<AuthStatus>(config ? "loading" : "local");
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [repository, setRepository] = React.useState<CloudRepository | null>(null);

  const authRef = React.useRef<AuthClient | null>(null);
  const repoRef = React.useRef<CloudRepository | null>(null);
  const teardownRef = React.useRef<(() => void) | null>(null);
  const unloadingRef = React.useRef(false);
  const activeUserIdRef = React.useRef<string | null>(null);

  const deactivate = React.useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
    repoRef.current?.dispose();
    repoRef.current = null;
    activeUserIdRef.current = null;
    resetActiveRepository();
    setRepository(null);
    setUser(null);
  }, []);

  const activate = React.useCallback(
    (nextUser: AuthUser) => {
      if (!config || !authRef.current) return;
      const auth = authRef.current;
      deactivate();
      const repo = new CloudRepository({
        userId: nextUser.id,
        storage: window.localStorage,
        cache: createLocalStorageRepository(cacheKeyFor(nextUser.id)),
        remote: createRemoteApi({ config, auth }),
        notifyDataChanged: () => window.dispatchEvent(new Event(DATA_CHANGED_EVENT)),
        isUnloading: () => unloadingRef.current || document.visibilityState === "hidden",
      });
      repoRef.current = repo;
      activeUserIdRef.current = nextUser.id;
      // Pasang SEBELUM UI anak dirender agar semua pembacaan memakai repository akun ini.
      setActiveRepository(repo);
      setRepository(repo);
      setUser(nextUser);
      setStatus("signed-in");
      void repo.sync();

      const onVisibility = () => {
        if (document.visibilityState === "hidden") repo.flushOnUnload();
        else void repo.sync();
      };
      const onPageHide = () => {
        unloadingRef.current = true;
        repo.flushOnUnload();
      };
      const onPageShow = () => {
        unloadingRef.current = false;
      };
      const onOnline = () => void repo.sync();
      const timer = setInterval(() => {
        if (document.visibilityState === "visible") void repo.sync();
      }, POLL_MS);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("pageshow", onPageShow);
      window.addEventListener("online", onOnline);
      teardownRef.current = () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("pageshow", onPageShow);
        window.removeEventListener("online", onOnline);
      };
    },
    [config, deactivate],
  );

  // Inisialisasi sesi tersimpan.
  React.useEffect(() => {
    if (!config) return;
    const auth = new AuthClient({ config, storage: window.localStorage });
    authRef.current = auth;
    let cancelled = false;

    void auth.getSession().then((session) => {
      if (cancelled) return;
      if (session) activate(session.user);
      else setStatus("signed-out");
    });

    // Sesi berakhir (refresh ditolak) atau keluar dari tab lain.
    const off = auth.onChange((session) => {
      if (cancelled) return;
      if (!session) {
        deactivate();
        setStatus("signed-out");
      } else if (session.user.id !== activeUserIdRef.current) {
        activate(session.user);
      }
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_STORAGE_KEY) auth.syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      off();
      window.removeEventListener("storage", onStorage);
      deactivate();
    };
  }, [config]);

  const sync = React.useSyncExternalStore(
    React.useCallback(
      (listener: () => void) => (repository ? repository.subscribe(listener) : () => undefined),
      [repository],
    ),
    () => (repository ? repository.getSnapshot() : IDLE_SNAPSHOT),
    () => IDLE_SNAPSHOT,
  );

  // Sesi berakhir saat sinkron: coba perbarui; bila gagal onChange akan mengeluarkan pengguna.
  React.useEffect(() => {
    if (sync.status === "auth") void authRef.current?.refresh().then((s) => s && repoRef.current?.sync());
  }, [sync.status]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const auth = authRef.current;
      if (!auth) throw new Error("Klien autentikasi belum siap.");
      const session = await auth.signInWithPassword(email, password);
      if (activeUserIdRef.current !== session.user.id) activate(session.user);
    },
    [activate],
  );

  const signOut = React.useCallback(async (options?: { force?: boolean }): Promise<SignOutResult> => {
    const repo = repoRef.current;
    if (repo) {
      await repo.sync();
      const pending = repo.getSnapshot().pending;
      if (pending > 0 && !options?.force) return { done: false, pending };
      // Data aman di server: hapus cache lokal agar tidak tertinggal di komputer bersama.
      repo.clearLocal();
    }
    deactivate();
    await authRef.current?.signOut();
    setStatus("signed-out");
    return { done: true };
  }, [deactivate]);

  const syncNow = React.useCallback(() => void repoRef.current?.sync(), []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ status, user, sync: repository ? sync : null, signIn, signOut, syncNow, repository }),
    [status, user, repository, sync, signIn, signOut, syncNow],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
