import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { AuthGate } from "@/components/auth/auth-gate";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { APP_FULL_NAME } from "@/lib/checklist/config";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_FULL_NAME,
  description:
    "Alat bantu verifikasi dan validasi Bank Garansi: membandingkan Underlying Document, Memorandum Analisa Bank Garansi, dan Putusan Bank Garansi secara otomatis. Bukan sistem approval.",
  // Favicon dari /public/bri-icon.svg (ubah ekstensi bila berkas Anda .png/.ico).
  icons: {
    icon: "/bri-icon.svg",
    shortcut: "/bri-icon.svg",
    apple: "/bri-icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={150}>
            <AuthProvider>
              {/* usePathname() di AppHeader butuh Suspense agar rute dinamis
                  (/checklist/[id]) bisa di-prerender (Next 16). Fallback
                  setinggi header agar tidak ada loncatan layout. */}
              <Suspense
                fallback={
                  <div
                    aria-hidden
                    className="h-14 border-b bg-card print:hidden"
                  />
                }
              >
                <AppHeader />
              </Suspense>
              <main>
                <AuthGate>{children}</AuthGate>
              </main>
            </AuthProvider>
          </TooltipProvider>
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
