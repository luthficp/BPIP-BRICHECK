"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * Tombol tema satu klik: Light <-> Dark.
 *
 * - Tidak ada opsi untuk mengikuti pengaturan sistem. Bila di perangkat masih tersimpan pilihan
 *   lama "system" (dari versi sebelumnya), tema terbaca mengikuti sistem sekali
 *   dan klik pertama langsung membaliknya ke pilihan eksplisit.
 * - Pilihan tersimpan oleh next-themes (localStorage) dan dipakai ulang saat reload.
 * - Ikon ditukar lewat CSS `dark:` (bukan state React) agar tidak terjadi
 *   hydration mismatch; label aksesibilitas baru dirinci setelah mount.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = !mounted
    ? "Ganti tema tampilan"
    : isDark
      ? "Ganti ke mode terang (Light)"
      : "Ganti ke mode gelap (Dark)";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* Mode terang menampilkan bulan (klik = gelap); mode gelap menampilkan matahari (klik = terang). */}
      <Moon className="h-4 w-4 dark:hidden" aria-hidden="true" />
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden="true" />
    </Button>
  );
}
