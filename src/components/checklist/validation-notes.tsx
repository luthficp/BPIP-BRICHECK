import * as React from "react";
import { Info } from "lucide-react";

import { VALIDATION_NOTES } from "@/lib/checklist/config";

/** Memecah teks pada tanda ` dan menampilkan segmen di dalamnya sebagai nilai contoh. */
function renderNote(text: string): React.ReactNode[] {
  return text.split("`").map((part, index) =>
    index % 2 === 1 ? (
      <code
        key={index}
        className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground"
      >
        {part}
      </code>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}

/**
 * Catatan validasi ringkas: empat baris berlabel, menggantikan paragraf
 * penjelasan panjang di bawah tabel Critical Field Validation.
 */
export function ValidationNotes() {
  return (
    <section aria-labelledby="catatan-validasi-heading" className="rounded-md border bg-muted/30 p-3">
      <h3
        id="catatan-validasi-heading"
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        Catatan validasi
      </h3>
      <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[10.5rem_1fr]">
        {VALIDATION_NOTES.map((note) => (
          <React.Fragment key={note.label}>
            <dt className="font-semibold text-foreground">{note.label}</dt>
            <dd className="text-muted-foreground sm:pb-0">{renderNote(note.text)}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}
