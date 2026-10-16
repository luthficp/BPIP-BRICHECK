import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CreateChecklistDialog } from "@/components/dashboard/create-checklist-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP_NAME, LABEL_TASK_MONITORING, STEPS } from "@/lib/checklist/config";
import { ROUTE_TASKS } from "@/lib/routes";

/** Label tombol utama Home. Aksinya sama dengan "Create Checklist" di header (dialog Nama Lengkap ADK). */
export const HOME_PRIMARY_CTA = "Mulai Verifikasi";

/**
 * Home: halaman awal yang ringkas dan terstruktur.
 *
 * Hierarki (atas ke bawah): sambutan + judul -> deskripsi 1-2 kalimat -> satu tombol utama
 * (Mulai Verifikasi) dengan satu aksi sekunder (Task Monitoring) -> ringkasan 4 tahap sebagai
 * panduan singkat. Tidak ada angka/statistik/aktivitas dummy; semua tombol memakai
 * dialog/halaman yang sudah ada (tanpa alur baru). FAQ cukup lewat navigasi header.
 */
export function HomeView() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <section aria-labelledby="home-title">
        <Card className="px-6 py-8 sm:px-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Selamat datang di {APP_NAME}
          </p>
          <h1
            id="home-title"
            className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
          >
            Bank Garansi Document Verification
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Bantu ADK menyelesaikan checklist dokumen dan validasi data kritis Bank Garansi secara
            terstruktur, dari pengecekan kelengkapan hingga ringkasan siap cetak.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <CreateChecklistDialog>
              <Button size="lg" className="w-full sm:w-auto" data-home-cta="primary">
                {HOME_PRIMARY_CTA}
                <ArrowRight />
              </Button>
            </CreateChecklistDialog>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              data-home-cta="secondary"
            >
              <Link href={ROUTE_TASKS}>{LABEL_TASK_MONITORING}</Link>
            </Button>
          </div>
        </Card>
      </section>

      <section aria-labelledby="home-steps-title" className="space-y-3">
        <h2
          id="home-steps-title"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Tahapan verifikasi
        </h2>
        <Card className="overflow-hidden">
          <ol className="grid divide-y lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            {STEPS.map((step) => (
              <li key={step.id} className="flex items-start gap-3 px-5 py-4">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary"
                  aria-hidden="true"
                >
                  {step.id}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{step.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.hint}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
