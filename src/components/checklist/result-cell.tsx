import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";

import { MatchStatusBadge } from "@/components/checklist/match-status";
import { PksInfoPanel } from "@/components/checklist/pks-info-panel";
import type { ComponentResultLine } from "@/lib/checklist/display";
import type { PksInfo } from "@/lib/checklist/pks";
import type { MatchState } from "@/lib/checklist/types";
import { cn } from "@/lib/utils";

type ResultCellProps = {
  state: MatchState;
  /**
   * Deskripsi di bawah badge (hanya baris Belum lengkap): "Belum lengkap : {N} field belum terisi"
   * pada baris biasa, atau "{N} field belum terisi" (ringkas) pada Biaya dan item Kontra Garansi.
   */
  note: string | null;
  /** Penjelasan perbedaan; hanya ditampilkan untuk baris TIDAK SESUAI. */
  reasons?: string[];
  /**
   * Hasil per komponen (Biaya) atau per informasi (item Kontra Garansi). Setiap baris hanya memuat
   * nama + status singkat; jumlah field belum terisi tidak diulang di sini (lihat `note`).
   */
  components?: ComponentResultLine[] | null;
  /**
   * Informasi tambahan (mis. PKS pada Biaya). Murni informatif: tidak mengubah status, hitungan,
   * maupun perbandingan; teksnya mengikuti Document Verification.
   */
  info?: Pick<PksInfo, "label" | "lead" | "number" | "tone" | "state"> | null;
  className?: string;
};

/**
 * Isi kolom Hasil Validasi: status + deskripsi dinamis. Warna bukan satu-satunya
 * penanda: setiap status memakai ikon dan teks.
 */
export function ResultCell({
  state,
  note,
  reasons = [],
  components,
  info,
  className,
}: ResultCellProps) {
  return (
    <div className={className}>
      <MatchStatusBadge state={state} />
      {state === "TIDAK SESUAI" && reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs font-medium text-danger">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {note && <p className="mt-1.5 text-xs font-medium text-muted-foreground">{note}</p>}
      {state === "BERSAMA" && (
        <p className="mt-1.5 text-xs text-muted-foreground">Tidak dibandingkan antar sumber.</p>
      )}
      {components && components.length > 0 && (
        <ul className="mt-2 space-y-1 border-t pt-2" aria-label="Hasil Validasi per komponen">
          {components.map((component) => (
            <li key={component.id} className="text-xs" data-state={component.state}>
              <span
                className={cn(
                  "flex items-center gap-1 font-semibold",
                  component.state === "SESUAI" && "text-success",
                  component.state === "TIDAK SESUAI" && "text-danger",
                  component.state === "BELUM LENGKAP" && "text-muted-foreground",
                )}
              >
                {component.state === "SESUAI" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : component.state === "TIDAK SESUAI" ? (
                  <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                {component.label}: {component.stateLabel}
              </span>
              {/* Penjelasan perbedaan hanya untuk TIDAK SESUAI; "belum terisi" tidak diulang per baris. */}
              {component.state === "TIDAK SESUAI" && component.note && (
                <span className="ml-[1.125rem] block font-medium text-muted-foreground">
                  {component.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {info && <PksInfoPanel info={info} className="mt-2" />}
    </div>
  );
}
