import { CheckCircle2, CircleDashed, Info, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LABEL_MEMORANDUM,
  LABEL_PUTUSAN,
  LABEL_RESULT,
  LABEL_UNDERLYING,
  MISMATCH_WARNING_ACTION,
  MISMATCH_WARNING_TITLE,
} from "@/lib/checklist/config";
import { describeValidationStatus, incompleteHeadline } from "@/lib/checklist/status-text";
import type { ValidationSummary as Summary } from "@/lib/validation/three-way-match";

type ValidationSummaryProps = {
  summary: Summary;
  emptyCells: number;
  totalCells: number;
  /** true bila TIDAK SESUAI menahan lanjut ke Opini ADK (task masih Draft). */
  blocking?: boolean;
};

/**
 * Banner persisten (bukan popup) untuk status Hasil Validasi.
 * Teks status berasal dari satu sumber (`describeValidationStatus`) agar UI,
 * cetak, PDF, dan Word memakai kalimat yang sama. Ketidaksesuaian dan
 * "belum lengkap" ditampilkan terpisah: data yang belum diisi tidak pernah
 * dinyatakan sesuai, dan juga tidak dihitung sebagai ketidaksesuaian.
 * Tinggi minimum dijaga konstan agar halaman tidak melompat saat ADK mengetik.
 */
export function ValidationSummaryBanner({
  summary,
  emptyCells,
  totalCells,
  blocking = false,
}: ValidationSummaryProps) {
  const filled = totalCells - emptyCells;
  const status = describeValidationStatus(summary);

  return (
    <div className="space-y-2">
      {status.kind === "mismatch" || status.kind === "mismatch-incomplete" ? (
        <Alert variant="danger" role="status" aria-live="polite" className="min-h-[5.5rem] border-2">
          <TriangleAlert aria-hidden="true" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div>
              <AlertTitle className="text-base">{MISMATCH_WARNING_TITLE}</AlertTitle>
              <AlertDescription>
                <p className="font-medium">{status.text}</p>
                <p className="text-muted-foreground">{MISMATCH_WARNING_ACTION}</p>
                {blocking && (
                  <p className="mt-1 font-medium text-danger">
                    Lanjut ke Opini ADK ditahan selama masih ada TIDAK SESUAI. Anda tetap dapat
                    mengubah isian di sini dan kembali ke Step sebelumnya, termasuk Step 1.
                  </p>
                )}
              </AlertDescription>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Field yang tidak sesuai">
                {summary.mismatchLabels.map((label) => (
                  <li
                    key={label}
                    className="rounded-md border border-danger-border bg-card px-2 py-0.5 text-xs font-semibold text-danger"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <p className="shrink-0 text-base font-bold text-danger sm:text-right">
              {summary.mismatch} tidak sesuai
              <span className="block text-xs font-medium text-muted-foreground">
                dari {summary.comparedTotal} critical field
              </span>
            </p>
          </div>
        </Alert>
      ) : status.kind === "all-match" ? (
        <Alert variant="success" role="status" aria-live="polite" className="min-h-[5.5rem]">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle className="text-base">{status.title}</AlertTitle>
          <AlertDescription>{status.text}</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info" role="status" aria-live="polite" className="min-h-[5.5rem]">
          <Info aria-hidden="true" />
          <AlertTitle className="text-base">{LABEL_RESULT} berjalan otomatis</AlertTitle>
          <AlertDescription>
            Isi {LABEL_UNDERLYING}, {LABEL_MEMORANDUM}, dan {LABEL_PUTUSAN} pada setiap critical
            field. Hasil SESUAI / TIDAK SESUAI muncul otomatis. {filled} dari {totalCells} kolom
            terisi.
          </AlertDescription>
        </Alert>
      )}

      {/* Indikator "belum lengkap" terpisah dari ketidaksesuaian. */}
      {status.incompleteText && (
        <Alert variant="warning" role="status" aria-live="polite">
          <CircleDashed aria-hidden="true" />
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div>
              <AlertTitle>Belum lengkap</AlertTitle>
              <AlertDescription>
                {status.incompleteText} Data yang belum lengkap tidak dianggap sesuai dan tidak
                dihitung sebagai ketidaksesuaian.
              </AlertDescription>
            </div>
            <p className="shrink-0 text-sm font-semibold text-warning sm:text-right">
              {summary.incompleteFieldCount} dari {summary.comparedTotal} critical field belum lengkap
            </p>
          </div>
        </Alert>
      )}
    </div>
  );
}
