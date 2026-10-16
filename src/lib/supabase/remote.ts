import type { AuthClient } from "./auth-client";
import type { SupabaseConfig } from "./config";

/**
 * Pemanggil RPC ke fungsi database BRICHECK (supabase/migrations/…: public.bricheck_*).
 * Tabel tidak pernah diakses langsung dari browser; hanya 4 fungsi ini, dan database memeriksa
 * auth.uid() sehingga satu akun hanya dapat melihat/mengubah task miliknya.
 */
export type RemoteErrorKind =
  /** Tidak ada koneksi / server tak terjangkau: coba lagi nanti. */
  | "network"
  /** 5xx / 429: coba lagi nanti. */
  | "server"
  /** Sesi tidak berlaku (perlu masuk lagi). */
  | "auth"
  /** Ditolak database (data tidak valid / bukan milik akun): jangan diulang otomatis. */
  | "rejected";

export class RemoteError extends Error {
  constructor(
    public readonly kind: RemoteErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "RemoteError";
  }
}

export type SaveResult = { saved: boolean; reason?: string; updatedAt?: string };

export interface RemoteChecklistApi {
  list(): Promise<unknown[]>;
  get(id: string): Promise<unknown | null>;
  save(checklist: unknown): Promise<SaveResult>;
  remove(id: string): Promise<void>;
  /** Kirim saat halaman ditutup: fetch keepalive, tanpa menunggu hasil. true = permintaan dikirim. */
  saveOnUnload(checklist: unknown): boolean;
}

type Deps = { config: SupabaseConfig; auth: AuthClient; fetchImpl?: typeof fetch };

/** Batas body fetch keepalive di browser adalah 64 KiB (total). */
const KEEPALIVE_MAX_BYTES = 60_000;

export function createRemoteApi({ config, auth, fetchImpl }: Deps): RemoteChecklistApi {
  const doFetch: typeof fetch = fetchImpl ?? ((input, init) => fetch(input, init));
  const url = (fn: string) => `${config.url}/rest/v1/rpc/${fn}`;

  async function call<T>(fn: string, args: object, retried = false): Promise<T> {
    const session = await auth.getSession();
    if (!session) throw new RemoteError("auth", "Sesi berakhir. Silakan masuk lagi.");
    let response: Response;
    try {
      response = await doFetch(url(fn), {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
    } catch {
      throw new RemoteError("network", "Tidak dapat terhubung ke server.");
    }
    if (response.ok) {
      const text = await response.text();
      return (text ? JSON.parse(text) : null) as T;
    }
    if (response.status === 401 && !retried) {
      const next = await auth.refresh();
      if (next) return call<T>(fn, args, true);
    }
    if (response.status === 401) throw new RemoteError("auth", "Sesi berakhir. Silakan masuk lagi.");
    let detail = "";
    let code = "";
    try {
      const b = (await response.json()) as { message?: string; code?: string };
      detail = b.message ?? "";
      code = b.code ?? "";
    } catch {
      /* bukan JSON */
    }
    if (code === "28000") throw new RemoteError("auth", "Sesi berakhir. Silakan masuk lagi.");
    if (response.status >= 500 || response.status === 429 || response.status === 408) {
      throw new RemoteError("server", detail || `Server error (${response.status}).`);
    }
    throw new RemoteError("rejected", detail || `Ditolak server (${response.status}).`);
  }

  return {
    async list() {
      const out = await call<unknown>("bricheck_list_checklists", {});
      return Array.isArray(out) ? out : [];
    },
    async get(id) {
      return (await call<unknown | null>("bricheck_get_checklist", { p_id: id })) ?? null;
    },
    async save(checklist) {
      const out = await call<SaveResult | null>("bricheck_save_checklist", { p: checklist });
      return out ?? { saved: false };
    },
    async remove(id) {
      await call<boolean>("bricheck_delete_checklist", { p_id: id });
    },
    saveOnUnload(checklist) {
      const token = auth.peekValidAccessToken();
      if (!token) return false;
      const body = JSON.stringify({ p: checklist });
      if (new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) return false;
      try {
        void doFetch(url("bricheck_save_checklist"), {
          method: "POST",
          keepalive: true,
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body,
        }).catch(() => undefined);
        return true;
      } catch {
        return false;
      }
    },
  };
}
