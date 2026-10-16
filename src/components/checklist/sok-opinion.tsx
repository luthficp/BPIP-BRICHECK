import { PenLine } from "lucide-react";

/** Info di web: SOK tidak mengisi opini melalui aplikasi. */
export function SokOpinionNotice() {
  return (
    <div className="flex gap-3 rounded-md border border-dashed bg-muted/20 p-4 text-sm">
      <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-medium">Opini SOK</p>
        <p className="text-muted-foreground">
          Diisi manual oleh SOK pada dokumen hasil cetak: opini tulis tangan, nama, tanggal, dan
          tanda tangan basah. SOK tidak mengisi melalui aplikasi.
        </p>
      </div>
    </div>
  );
}

/**
 * Area Opini SOK pada dokumen cetak: ruang kosong bergaris untuk tulisan tangan.
 * Garis dibuat dari elemen border (bukan background) agar tetap tercetak
 * walau "background graphics" browser dimatikan.
 */
export function SokOpinionPrint({ lines = 7 }: { lines?: number }) {
  return (
    <section className="print-avoid-break" aria-label="Opini SOK">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide">4. Opini SOK</h3>
      <div className="border border-neutral-700 px-3 pt-1">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-[8.5mm] border-b border-dotted border-neutral-400 last:border-b-0" />
        ))}
      </div>
    </section>
  );
}
