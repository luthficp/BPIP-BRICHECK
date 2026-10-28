"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-provider";
import { APP_FULL_NAME } from "@/lib/checklist/config";

/** Halaman masuk (hanya muncul bila Supabase dikonfigurasi). Akun dibuat oleh admin; tidak ada pendaftaran mandiri. */
export function LoginCard() {
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Email dan kata sandi wajib diisi.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal masuk. Coba lagi.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="items-center space-y-3 text-center">
          {/* Ikon BRI dari /public/bri-icon.svg (ubah ekstensi bila berkas .png). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bri-icon.svg" alt="BRI" className="h-14 w-14 object-contain" />
          <div className="space-y-1">
            <CardTitle className="text-xl">Masuk ke BRICHECK</CardTitle>
            <CardDescription>{APP_FULL_NAME}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                placeholder="nama@bri.co.id"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Kata sandi</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? "Memeriksa…" : "Masuk"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Akun dibuat oleh administrator. Task Anda tersimpan di akun ini dan hanya dapat dilihat oleh Anda.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
