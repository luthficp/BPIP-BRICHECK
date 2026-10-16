import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StorageLike } from "@/lib/storage/history-reset";

import { AuthClient, AuthError, SESSION_STORAGE_KEY } from "./auth-client";

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

const config = { url: "https://x.supabase.co", anonKey: "anon" };
type Call = { url: string; init: RequestInit };

function tokenBody(n: number, expiresAt: number) {
  return {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    expires_at: expiresAt,
    user: { id: "u-1", email: "a@x.test" },
  };
}

function setup(handler: (call: Call, index: number) => Response | Promise<Response>, nowRef = { t: 1000 }) {
  const calls: Call[] = [];
  const storage = new MemoryStorage();
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as unknown as typeof fetch;
  const auth = new AuthClient({ config, storage, fetchImpl, nowSeconds: () => nowRef.t });
  return { auth, calls, storage, nowRef };
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("AuthClient", () => {
  it("login berhasil: kirim apikey + body, simpan sesi, beri tahu pendengar", async () => {
    const { auth, calls, storage } = setup(() => json(200, tokenBody(1, 5000)));
    const seen: unknown[] = [];
    auth.onChange((s) => seen.push(s?.user.id ?? null));
    const s = await auth.signInWithPassword("  A@X.test ", "pw");
    assert.equal(s.user.id, "u-1");
    assert.equal(calls[0].url, "https://x.supabase.co/auth/v1/token?grant_type=password");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { email: "a@x.test", password: "pw" });
    assert.equal((calls[0].init.headers as Record<string, string>).apikey, "anon");
    assert.ok(storage.getItem(SESSION_STORAGE_KEY));
    assert.deepEqual(seen, ["u-1"]);
  });

  it("kredensial salah -> AuthError invalid_credentials; jaringan putus -> network; 503 -> server", async () => {
    const bad = setup(() => json(400, { msg: "Invalid login credentials" }));
    await assert.rejects(bad.auth.signInWithPassword("a", "b"), (e: AuthError) => e.code === "invalid_credentials");
    assert.equal(bad.storage.getItem(SESSION_STORAGE_KEY), null);

    const net = setup(() => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(net.auth.signInWithPassword("a", "b"), (e: AuthError) => e.code === "network");

    const down = setup(() => json(503, {}));
    await assert.rejects(down.auth.signInWithPassword("a", "b"), (e: AuthError) => e.code === "server");
  });

  it("sesi dipulihkan dari storage (reload)", async () => {
    const a = setup(() => json(200, tokenBody(1, 5000)));
    await a.auth.signInWithPassword("a@x.test", "pw");
    const again = new AuthClient({ config, storage: a.storage, nowSeconds: () => 1000 });
    assert.equal(again.peek()?.user.email, "a@x.test");
  });

  it("getSession: masih lama -> tanpa permintaan; hampir habis -> refresh", async () => {
    const t = { t: 1000 };
    const { auth, calls } = setup((_c, i) => json(200, tokenBody(i + 1, t.t + 3600)), t);
    await auth.signInWithPassword("a@x.test", "pw");
    assert.equal((await auth.getSession())?.accessToken, "access-1");
    assert.equal(calls.length, 1);
    t.t += 3600 - 30; // sisa 30 detik < batas 60
    const s = await auth.getSession();
    assert.equal(s?.accessToken, "access-2");
    assert.match(calls[1].url, /grant_type=refresh_token/);
    assert.deepEqual(JSON.parse(String(calls[1].init.body)), { refresh_token: "refresh-1" });
  });

  it("refresh bersamaan berbagi satu permintaan", async () => {
    const t = { t: 1000 };
    const { auth, calls } = setup((_c, i) => json(200, tokenBody(i + 1, t.t + 3600)), t);
    await auth.signInWithPassword("a@x.test", "pw");
    t.t += 4000;
    const [x, y] = await Promise.all([auth.getSession(), auth.getSession()]);
    assert.equal(x?.accessToken, y?.accessToken);
    assert.equal(calls.length, 2);
  });

  it("refresh gagal karena jaringan: tetap masuk; ditolak server: sesi dihapus", async () => {
    const t = { t: 1000 };
    let mode: "ok" | "net" | "reject" = "ok";
    const { auth, storage } = setup(() => {
      if (mode === "net") throw new TypeError("offline");
      if (mode === "reject") return json(400, { error_code: "refresh_token_not_found" });
      return json(200, tokenBody(1, t.t + 100));
    }, t);
    await auth.signInWithPassword("a@x.test", "pw");
    t.t += 500;
    mode = "net";
    assert.equal((await auth.getSession())?.user.id, "u-1"); // sesi dipertahankan
    mode = "reject";
    assert.equal(await auth.getSession(), null);
    assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
  });

  it("peekValidAccessToken: null bila hampir/sudah kedaluwarsa", async () => {
    const t = { t: 1000 };
    const { auth } = setup(() => json(200, tokenBody(1, 1100)), t);
    await auth.signInWithPassword("a@x.test", "pw");
    assert.equal(auth.peekValidAccessToken(), "access-1");
    t.t = 1097;
    assert.equal(auth.peekValidAccessToken(), null);
  });

  it("signOut: sesi lokal langsung hilang, logout dikirim best-effort (walau gagal)", async () => {
    const { auth, calls, storage } = setup((c) =>
      c.url.includes("logout") ? json(500, {}) : json(200, tokenBody(1, 5000)),
    );
    await auth.signInWithPassword("a@x.test", "pw");
    await auth.signOut();
    assert.equal(auth.peek(), null);
    assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
    assert.match(calls[1].url, /\/auth\/v1\/logout$/);
    assert.equal((calls[1].init.headers as Record<string, string>).Authorization, "Bearer access-1");
  });

  it("syncFromStorage: perubahan dari tab lain diteruskan", async () => {
    const { auth, storage } = setup(() => json(200, tokenBody(1, 5000)));
    await auth.signInWithPassword("a@x.test", "pw");
    const seen: unknown[] = [];
    auth.onChange((s) => seen.push(s?.user.id ?? null));
    storage.removeItem(SESSION_STORAGE_KEY);
    auth.syncFromStorage();
    assert.deepEqual(seen, [null]);
  });
});
