import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StorageLike } from "@/lib/storage/history-reset";

import { AuthClient, SESSION_STORAGE_KEY } from "./auth-client";
import { createRemoteApi, RemoteError } from "./remote";

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
const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>, expiresAt = 9_999_999_999) {
  const storage = new MemoryStorage();
  storage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ accessToken: "tok-1", refreshToken: "ref-1", expiresAt, user: { id: "u", email: "a@x" } }),
  );
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init, calls.length - 1);
  }) as unknown as typeof fetch;
  const auth = new AuthClient({ config, storage, fetchImpl, nowSeconds: () => 1000 });
  return { remote: createRemoteApi({ config, auth, fetchImpl }), calls, auth };
}

describe("createRemoteApi", () => {
  it("memanggil RPC yang benar dengan apikey + Bearer, tanpa menyentuh tabel", async () => {
    const { remote, calls } = setup((url) => (url.endsWith("bricheck_list_checklists") ? json(200, [{ id: "1" }]) : json(200, null)));
    assert.deepEqual(await remote.list(), [{ id: "1" }]);
    assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/rpc/bricheck_list_checklists");
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h.apikey, "anon");
    assert.equal(h.Authorization, "Bearer tok-1");
    assert.equal(await remote.get("abc"), null);
    assert.equal(calls[1].url.endsWith("/rpc/bricheck_get_checklist"), true);
    assert.deepEqual(JSON.parse(String(calls[1].init.body)), { p_id: "abc" });
    for (const c of calls) assert.equal(/\/rest\/v1\/(?!rpc\/)/.test(c.url), false);
  });

  it("save membungkus payload sebagai {p}; remove memakai p_id", async () => {
    const { remote, calls } = setup(() => json(200, { saved: true, updatedAt: "t" }));
    const r = await remote.save({ id: "T1" });
    assert.equal(r.saved, true);
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { p: { id: "T1" } });
    await remote.remove("T1");
    assert.deepEqual(JSON.parse(String(calls[1].init.body)), { p_id: "T1" });
  });

  it("401 -> refresh token sekali lalu ulangi; tetap 401 -> RemoteError auth", async () => {
    let step = 0;
    const { remote, calls } = setup((url) => {
      if (url.includes("/auth/v1/token"))
        return json(200, { access_token: "tok-2", refresh_token: "ref-2", expires_at: 9_999_999_999, user: { id: "u", email: "a@x" } });
      step++;
      return step === 1 ? json(401, { message: "JWT expired" }) : json(200, []);
    });
    assert.deepEqual(await remote.list(), []);
    assert.equal((calls[2].init.headers as Record<string, string>).Authorization, "Bearer tok-2");

    const dead = setup((url) => (url.includes("/auth/v1/token") ? json(400, {}) : json(401, {})));
    await assert.rejects(dead.remote.list(), (e: RemoteError) => e.kind === "auth");
  });

  it("klasifikasi galat: jaringan, server (5xx/429), ditolak (4xx), auth (28000)", async () => {
    const kinds: Record<string, (() => Response) | "throw"> = {
      network: "throw",
      server: () => json(503, {}),
      "server ": () => json(429, {}),
      rejected: () => json(400, { code: "22023", message: "Payload tidak valid" }),
      "rejected ": () => json(403, { code: "42501", message: "Task bukan milik akun ini" }),
      auth: () => json(400, { code: "28000", message: "Tidak terautentikasi" }),
    };
    for (const [name, make] of Object.entries(kinds)) {
      const { remote } = setup(() => {
        if (make === "throw") throw new TypeError("fetch failed");
        return make();
      });
      await assert.rejects(remote.list(), (e: RemoteError) => e.kind === name.trim(), name);
    }
    const rej = setup(() => json(403, { code: "42501", message: "Task bukan milik akun ini" }));
    await assert.rejects(rej.remote.save({ id: "x" }), /bukan milik akun/);
  });

  it("tanpa sesi -> RemoteError auth tanpa memanggil jaringan", async () => {
    const { remote, calls, auth } = setup(() => json(200, []));
    await auth.signOut();
    calls.length = 0;
    await assert.rejects(remote.list(), (e: RemoteError) => e.kind === "auth");
    assert.equal(calls.length, 0);
  });

  it("saveOnUnload: fetch keepalive dengan token berlaku; false bila token habis atau payload terlalu besar", () => {
    const { remote, calls } = setup(() => json(200, {}));
    assert.equal(remote.saveOnUnload({ id: "T" }), true);
    assert.equal((calls[0].init as RequestInit).keepalive, true);
    assert.equal(remote.saveOnUnload({ id: "T", blob: "x".repeat(70_000) }), false);
    const expired = setup(() => json(200, {}), 1000);
    assert.equal(expired.remote.saveOnUnload({ id: "T" }), false);
  });
});
