import { FileText, Info, TriangleAlert } from "lucide-react";

import type { PksInfo } from "@/lib/checklist/pks";
import { cn } from "@/lib/utils";

type PksInfoPanelProps = {
  info: Pick<PksInfo, "label" | "lead" | "number" | "tone" | "state">;
  className?: string;
};

const TONES = {
  // PKS ada: biru muda BRICHECK.
  info: {
    box: "border-primary/25 bg-primary-soft",
    label: "text-primary",
    icon: FileText,
  },
  // PKS tidak ada: amber lembut sebagai penekanan informasi (bukan status TIDAK SESUAI; tidak merah).
  notice: {
    box: "border-warning-border bg-warning-soft",
    label: "text-warning",
    icon: Info,
  },
  // PKS dipilih Ada tetapi Nomor PKS kosong: peringatan, tetap ringkas.
  warning: {
    box: "border-warning-border bg-warning-soft",
    label: "text-warning",
    icon: TriangleAlert,
  },
  // Status PKS belum dipilih di Document Verification.
  muted: {
    box: "border-border bg-muted/40",
    label: "text-muted-foreground",
    icon: Info,
  },
} as const;

/**
 * Panel ringkas "Informasi PKS" pada Hasil Validasi Biaya. Murni informatif: tidak mengubah status,
 * hitungan, maupun perbandingan Biaya. Makna tidak bergantung pada warna: ada label, ikon, dan teks.
 */
export function PksInfoPanel({ info, className }: PksInfoPanelProps) {
  const tone = TONES[info.tone];
  const Icon = tone.icon;
  return (
    <div
      className={cn("rounded-md border px-2 py-1.5 text-xs leading-snug", tone.box, className)}
      data-pks-info={info.state}
      data-tone={info.tone}
    >
      <p className={cn("flex items-center gap-1 font-semibold", tone.label)}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {info.label}
      </p>
      <p
        className={cn(
          "mt-0.5 min-w-0 break-words",
          info.tone === "warning" ? "font-semibold text-warning" : "font-medium text-foreground",
        )}
      >
        {info.lead}
        {info.number && (
          <>
            {" "}
            <strong className="break-all font-bold text-primary">{info.number}</strong>
          </>
        )}
      </p>
    </div>
  );
}
