import { CircleDashed, Info } from "lucide-react";

import type { DocumentItemRef, DocumentsRequirementSummary } from "@/lib/checklist/requirement-summary";
import { cn } from "@/lib/utils";

const METRIC_TONES = {
  // Ada: aksen hijau lembut.
  ada: "border-success-border bg-success-soft text-success",
  // Tidak Ada: amber lembut bila ada; netral bila nol (tidak ada yang perlu disorot).
  tidakAda: "border-warning-border bg-warning-soft text-warning",
  tidakAdaZero: "border-border bg-muted/60 text-foreground",
  // Belum Diperiksa: biru lembut.
  unchecked: "border-primary/25 bg-primary-soft text-primary",
} as const;

const PANEL_TONES = {
  tidakAda: {
    box: "border-warning-border bg-warning-soft",
    title: "text-warning",
    icon: Info,
  },
  unchecked: {
    box: "border-primary/25 bg-primary-soft",
    title: "text-primary",
    icon: CircleDashed,
  },
} as const;

function Metric({
  kind,
  label,
  value,
  className,
}: {
  kind: keyof typeof METRIC_TONES;
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-lg border px-4 py-3", METRIC_TONES[kind], className)}
      data-doc-metric={kind === "tidakAdaZero" ? "tidakAda" : kind}
    >
      <dt className="text-xs font-semibold">{label}</dt>
      <dd className="mt-1 text-3xl font-bold leading-none tabular-nums">{value}</dd>
    </div>
  );
}

/** Panel informasi berisi daftar nama dokumen (nama kategori sebagai teks pendamping kecil di bawah nama). */
function DocumentPanel({
  kind,
  title,
  hint,
  items,
}: {
  kind: keyof typeof PANEL_TONES;
  title: string;
  hint: string;
  items: DocumentItemRef[];
}) {
  const tone = PANEL_TONES[kind];
  const Icon = tone.icon;
  return (
    <section
      className={cn("rounded-lg border p-3 sm:p-4", tone.box)}
      aria-label={`${title} (${items.length})`}
      data-doc-panel={kind}
    >
      <h4 className={cn("flex items-center gap-2 text-sm font-semibold", tone.title)}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {title} <span className="tabular-nums">({items.length})</span>
        </span>
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => (
          <li
            key={`${item.categoryNo ?? "x"}-${item.name}-${index}`}
            className="min-w-0 rounded-md border bg-background/70 px-3 py-2"
            data-doc-panel-item
          >
            <p className="min-w-0 break-words text-sm font-medium leading-snug">{item.name}</p>
            {item.categoryTitle && (
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{item.categoryTitle}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Ringkasan Pemeriksaan Document Verification pada Summary & Output. Status utama (badge pada judul
 * accordion) dan isi ringkasan mengikuti data aktual:
 *  - semua Ada                  -> badge hijau "Lengkap" + jumlah Ada / Tidak Ada;
 *  - ada Tidak Ada              -> "Terdapat Dokumen yang Tidak Ada" (amber) + panel amber berisi daftarnya;
 *  - ada Belum Diperiksa        -> metrik dan panel biru berisi daftarnya (badge biru bila tidak ada Tidak Ada);
 *  - Tidak Ada + Belum Diperiksa -> keduanya tampil terpisah; Tidak Ada menjadi status utama.
 * Hanya informasi hasil pemeriksaan: Tidak Ada bukan otomatis kegagalan persyaratan Bank Garansi.
 * Seluruh angka berasal dari data DV aktual (termasuk dokumen tambahan ADK), bukan angka tetap.
 */
export function DocumentVerificationSummary({ summary }: { summary: DocumentsRequirementSummary }) {
  const hasTidakAda = summary.tidakAda.length > 0;
  const hasUnchecked = summary.unchecked.length > 0;
  return (
    <div className="space-y-3" data-doc-summary data-doc-condition={summary.condition}>
      <dl
        className={cn("grid grid-cols-2 gap-3", hasUnchecked && "sm:grid-cols-3")}
        aria-label="Jumlah dokumen berdasarkan status pemeriksaan"
      >
        <Metric kind="ada" label="Ada" value={summary.ada.length} />
        <Metric kind={hasTidakAda ? "tidakAda" : "tidakAdaZero"} label="Tidak Ada" value={summary.tidakAda.length} />
        {hasUnchecked && (
          <Metric
            kind="unchecked"
            label="Belum Diperiksa"
            value={summary.unchecked.length}
            className="col-span-2 sm:col-span-1"
          />
        )}
      </dl>
      <p className="text-xs text-muted-foreground" data-doc-total={summary.total}>
        Total {summary.total} dokumen. Rincian per kategori ada di Step 1 Document Verification.
      </p>

      {hasTidakAda && (
        <DocumentPanel
          kind="tidakAda"
          title="Dokumen Tidak Ada"
          hint="Informasi hasil pemeriksaan; Tidak Ada tidak otomatis berarti persyaratan tidak terpenuhi."
          items={summary.tidakAdaItems}
        />
      )}
      {hasUnchecked && (
        <DocumentPanel
          kind="unchecked"
          title="Belum Diperiksa"
          hint="Dokumen berikut belum diberi status Ada atau Tidak Ada."
          items={summary.uncheckedItems}
        />
      )}

      {summary.issues.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-doc-issues>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{summary.issues.join(" ")}</span>
        </p>
      )}
    </div>
  );
}
