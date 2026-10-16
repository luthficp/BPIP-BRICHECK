import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSupabaseConfig } from "./config";

describe("parseSupabaseConfig", () => {
  it("menerima URL https + key, merapikan spasi dan garis miring akhir", () => {
    assert.deepEqual(parseSupabaseConfig("  https://abc.supabase.co/ ", " key123 "), {
      url: "https://abc.supabase.co",
      anonKey: "key123",
    });
  });
  it("kosong / tidak ada = mode lokal (null)", () => {
    assert.equal(parseSupabaseConfig(undefined, undefined), null);
    assert.equal(parseSupabaseConfig("", "k"), null);
    assert.equal(parseSupabaseConfig("https://abc.supabase.co", ""), null);
  });
  it("placeholder dari .env.example tidak dianggap terkonfigurasi", () => {
    assert.equal(parseSupabaseConfig("https://YOUR_PROJECT_REF.supabase.co", "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"), null);
    assert.equal(parseSupabaseConfig("https://abc.supabase.co", "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"), null);
  });
  it("http hanya untuk localhost; URL rusak ditolak", () => {
    assert.equal(parseSupabaseConfig("http://abc.supabase.co", "k"), null);
    assert.deepEqual(parseSupabaseConfig("http://127.0.0.1:54321", "k"), { url: "http://127.0.0.1:54321", anonKey: "k" });
    assert.equal(parseSupabaseConfig("bukan url", "k"), null);
    assert.equal(parseSupabaseConfig(123, {}), null);
  });
});
