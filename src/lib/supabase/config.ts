/**
 * Konfigurasi Supabase dari environment. Hanya dua nilai PUBLIK yang dibaca aplikasi (browser):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (anon/publishable key bukan rahasia; data dilindungi login + fungsi database, lihat supabase/ di ZIP).
 * `service_role` TIDAK pernah dibaca atau dipakai oleh kode browser.
 *
 * Tanpa kedua nilai, aplikasi berjalan dalam "mode lokal" (localStorage) seperti sebelumnya.
 */
export type SupabaseConfig = {
  /** Tanpa garis miring di akhir, mis. https://abcd.supabase.co */
  url: string;
  anonKey: string;
};

const PLACEHOLDER = /YOUR_|CHANGE_ME|xxxx/i;

/** Murni (dapat diuji): validasi dan rapikan nilai mentah. null = tidak dikonfigurasi / tidak valid. */
export function parseSupabaseConfig(rawUrl: unknown, rawKey: unknown): SupabaseConfig | null {
  const url = typeof rawUrl === "string" ? rawUrl.trim().replace(/\/+$/, "") : "";
  const anonKey = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!url || !anonKey) return null;
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(anonKey)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) return null;
  return { url, anonKey };
}

/** Next.js hanya menyisipkan NEXT_PUBLIC_* bila ditulis literal seperti di bawah. */
export function getSupabaseConfig(): SupabaseConfig | null {
  return parseSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
