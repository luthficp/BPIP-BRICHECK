import type { StorageLike } from "@/lib/storage/history-reset";

import type { SupabaseConfig } from "./config";

/**
 * Klien autentikasi Supabase (GoTrue REST) tanpa library tambahan:
 *   POST /auth/v1/token?grant_type=password | refresh_token,  POST /auth/v1/logout
 * Sesi disimpan di localStorage (seperti supabase-js) dan diperbarui otomatis sebelum kedaluwarsa.
 * Semua dependensi (fetch, storage, jam) disuntikkan agar dapat diuji.
 */
export type AuthUser = { id: string; email: string };

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Detik epoch kedaluwarsa access token. */
  expiresAt: number;
  user: AuthUser;
};

export type AuthErrorCode = "invalid_credentials" | "network" | "server" | "unknown";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const SESSION_STORAGE_KEY = "bricheck:supabase-session:v1";
/** Perbarui bila sisa umur token kurang dari ini (detik). */
const REFRESH_MARGIN_S = 60;

type Deps = {
  config: SupabaseConfig;
  storage: StorageLike;
  fetchImpl?: typeof fetch;
  /** Detik epoch. */
  nowSeconds?: () => number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string };
};

export class AuthClient {
  private readonly config: SupabaseConfig;
  private readonly storage: StorageLike;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private session: Session | null;
  private refreshing: Promise<Session | null> | null = null;
  private listeners = new Set<(s: Session | null) => void>();

  constructor(deps: Deps) {
    this.config = deps.config;
    this.storage = deps.storage;
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    this.session = this.readStored();
  }

  /** Sesi tersimpan apa adanya (bisa sudah kedaluwarsa). Sinkron. */
  peek(): Session | null {
    return this.session;
  }

  /** Access token yang masih berlaku, atau null. Sinkron (untuk fetch keepalive saat tab ditutup). */
  peekValidAccessToken(): string | null {
    const s = this.session;
    return s && s.expiresAt - this.now() > 5 ? s.accessToken : null;
  }

  onChange(listener: (s: Session | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Dipanggil saat tab lain mengubah sesi (event `storage`). */
  syncFromStorage(): void {
    const next = this.readStored();
    if (JSON.stringify(next) !== JSON.stringify(this.session)) {
      this.session = next;
      this.emit();
    }
  }

  async signInWithPassword(email: string, password: string): Promise<Session> {
    const res = await this.token("password", { email: email.trim().toLowerCase(), password });
    const session = this.toSession(res);
    if (!session) throw new AuthError("unknown", "Respons login tidak dikenali.");
    this.setSession(session);
    return session;
  }

  /**
   * Sesi yang siap dipakai. Memperbarui token bila hampir/sudah kedaluwarsa.
   * Gagal jaringan: sesi lama dikembalikan apa adanya (pengguna tetap masuk, sinkron menunggu koneksi).
   * Refresh token ditolak server: sesi dihapus dan null dikembalikan.
   */
  async getSession(): Promise<Session | null> {
    const s = this.session;
    if (!s) return null;
    if (s.expiresAt - this.now() > REFRESH_MARGIN_S) return s;
    return this.refresh();
  }

  /** Paksa perbarui token (mis. setelah 401). Panggilan bersamaan berbagi satu permintaan. */
  refresh(): Promise<Session | null> {
    if (this.refreshing) return this.refreshing;
    const current = this.session;
    if (!current) return Promise.resolve(null);
    this.refreshing = (async () => {
      try {
        const res = await this.token("refresh_token", { refresh_token: current.refreshToken });
        const next = this.toSession(res);
        if (!next) throw new AuthError("unknown", "Respons refresh tidak dikenali.");
        this.setSession(next);
        return next;
      } catch (error) {
        if (error instanceof AuthError && (error.code === "network" || error.code === "server")) {
          return this.session; // sementara tak terjangkau: pertahankan sesi
        }
        this.setSession(null);
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    const s = this.session;
    this.setSession(null);
    if (!s) return;
    try {
      await this.fetchImpl(`${this.config.url}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: this.config.anonKey, Authorization: `Bearer ${s.accessToken}` },
      });
    } catch {
      /* best-effort: sesi lokal sudah dihapus */
    }
  }

  /* ------------------------------- internal ------------------------------ */

  private async token(grant: "password" | "refresh_token", body: object): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.url}/auth/v1/token?grant_type=${grant}`, {
        method: "POST",
        headers: { apikey: this.config.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthError("network", "Tidak dapat terhubung ke server. Periksa koneksi internet.");
    }
    if (response.ok) return (await response.json()) as TokenResponse;
    if (response.status >= 500 || response.status === 429) {
      throw new AuthError("server", "Server sedang tidak tersedia. Coba lagi sebentar lagi.");
    }
    throw new AuthError(
      grant === "password" ? "invalid_credentials" : "unknown",
      grant === "password" ? "Email atau kata sandi salah." : "Sesi berakhir. Silakan masuk lagi.",
    );
  }

  private toSession(res: TokenResponse): Session | null {
    if (!res.access_token || !res.refresh_token || !res.user?.id) return null;
    const expiresAt = res.expires_at ?? this.now() + (res.expires_in ?? 3600);
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt,
      user: { id: res.user.id, email: res.user.email ?? "" },
    };
  }

  private setSession(session: Session | null): void {
    this.session = session;
    try {
      if (session) this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      else this.storage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* storage penuh/diblokir: sesi hanya hidup di memori */
    }
    this.emit();
  }

  private readStored(): Session | null {
    try {
      const raw = this.storage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as Partial<Session>;
      if (
        typeof s.accessToken === "string" &&
        typeof s.refreshToken === "string" &&
        typeof s.expiresAt === "number" &&
        typeof s.user?.id === "string"
      ) {
        return s as Session;
      }
    } catch {
      /* rusak: abaikan */
    }
    return null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.session);
  }
}
