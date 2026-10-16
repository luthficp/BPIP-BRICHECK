import { Check, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";

import { SignatureSection } from "@/components/checklist/signature-section";
import { SokOpinionPrint } from "@/components/checklist/sok-opinion";
import { APP_FULL_NAME, LABEL_ADK_NAME } from "@/lib/checklist/config";
import { componentResultText } from "@/lib/checklist/display";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import {
  buildChecklistDocumentModel,
  type CriticalRowModel,
} from "@/lib/export/document-model";
import { formatDate, formatTimestamp, shortId } from "@/lib/export/format";
import { cn } from "@/lib/utils";

type PrintLayoutProps = {
  checklist: BankGuaranteeChecklist;
  /** Waktu dokumen dihasilkan (dicetak pada footer sebagai metadata sistem). */
  printedAt: Date;
};

const cell = "border border-neutral-600 px-1.5 py-1 align-top";
/** Header & judul kolom: biru BRI + teks putih (warna dikunci; print-color-adjust aktif di .print-sheet). */
const headCell = cn(cell, "bg-[#00529c] text-left font-bold text-white");

/**
 * Dokumen resmi checklist (A4). Sengaja berbeda dari tampilan web:
 * formal, padat, ramah hitam-putih, dengan ruang tulisan tangan untuk SOK.
 * Warna hanya penguat; status selalu memakai ikon + teks (✓ SESUAI / ✕ TIDAK SESUAI).
 * Warna di sini dikunci (bukan token tema) supaya hasil cetak selalu terang,
 * walau aplikasi sedang dalam dark mode.
 */
export function PrintLayout({ checklist, printedAt }: PrintLayoutProps) {
  // Isi tabel berasal dari model dokumen yang sama dengan PDF, Word, dan Pratinjau.
  const model = buildChecklistDocumentModel(checklist, { generatedAt: printedAt });
  const validation = model.validation;
  const hasMismatch = validation.kind === "mismatch" || validation.kind === "mismatch-incomplete";

  return (
    <article
      className="print-sheet bg-white text-[10.5px] leading-snug text-black"
      aria-label="Dokumen checklist verifikasi dan validasi bank garansi"
    >
      <header className="mb-3 border-b-2 border-neutral-800 pb-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-600">
          Bank Rakyat Indonesia · {APP_FULL_NAME}
        </p>
        <h1 className="text-[15px] font-bold uppercase leading-tight">
          Checklist Verifikasi &amp; Validasi Data Bank Garansi
        </h1>
      </header>

      <table className="mb-3 w-full">
        <tbody>
          <tr>
            <th className={cn(headCell, "w-[17%]")} scope="row">
              Atas Nama
            </th>
            <td className={cn(cell, "w-[33%]")}>{checklist.atasNama}</td>
            <th className={cn(headCell, "w-[17%]")} scope="row">
              {LABEL_ADK_NAME}
            </th>
            <td className={cn(cell, "w-[33%]")}>{checklist.adkName}</td>
          </tr>
          <tr>
            <th className={headCell} scope="row">
              CIF
            </th>
            <td className={cell}>{checklist.cif}</td>
            <th className={headCell} scope="row">
              Jenis Pengajuan
            </th>
            <td className={cell}>{checklist.jenisPengajuan}</td>
          </tr>
          <tr>
            <th className={headCell} scope="row">
              Nama Task
            </th>
            <td className={cell}>{checklist.taskName}</td>
            <th className={headCell} scope="row">
              Timestamp
            </th>
            <td className={cell}>
              {formatTimestamp(checklist.completedAt ?? checklist.updatedAt)}
            </td>
          </tr>
        </tbody>
      </table>

      <PrintSection title={model.documentsHeading}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={cn(headCell, "w-[7%] text-center")}>No</th>
              <th className={headCell}>Jenis Dokumen</th>
              <th className={cn(headCell, "w-[9%] text-center")}>Ada</th>
              <th className={cn(headCell, "w-[12%] text-center")}>Tidak Ada</th>
              <th className={cn(headCell, "w-[36%]")}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {model.documentGroups.map((group) => (
              <DocumentGroupRows key={group.no} group={group} />
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[9.5px] text-neutral-700">{model.documentsNote}</p>
      </PrintSection>

      <PrintSection title={model.criticalHeading}>
        <table className="w-full">
          <thead>
            <tr>
              {model.criticalHeaders.map((header, index) => (
                <th
                  key={header}
                  className={cn(
                    headCell,
                    CRITICAL_WIDTHS[index],
                    (index === 0 || index === model.criticalHeaders.length - 1) && "text-center",
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.criticalRows.map((row, index) => (
              <CriticalRow key={`${row.kind}-${row.no}-${row.name}-${index}`} row={row} />
            ))}
          </tbody>
        </table>

        {hasMismatch ? (
          <div className="print-avoid-break mt-2 flex gap-2 border-2 border-red-700 bg-red-50 px-3 py-2 text-red-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-bold uppercase">{validation.title}</p>
              <p className="font-bold">{validation.text}</p>
              <p className="font-bold">Field terkait: {validation.mismatchLabels.join(", ")}.</p>
              <p className="text-[9.5px]">
                {validation.action} Sel yang menyimpang dari Underlying Document ditebalkan dan
                digarisbawahi.
              </p>
              {validation.reasons.length > 0 && (
                <ul className="mt-0.5 list-disc pl-4 text-[9.5px]">
                  {validation.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : validation.kind === "all-match" ? (
          <div className="print-avoid-break mt-2 flex items-center gap-2 border border-green-800 bg-green-50 px-3 py-1.5 font-semibold text-green-900">
            <Check className="h-4 w-4 shrink-0" strokeWidth={3.5} aria-hidden="true" />
            {validation.text}
          </div>
        ) : null}

        {validation.incomplete && (
          <div className="print-avoid-break mt-2 border border-amber-700 bg-amber-50 px-3 py-1.5 text-amber-900">
            <span className="font-bold">{validation.incomplete.headline}:</span>{" "}
            {validation.incomplete.text}
          </div>
        )}
      </PrintSection>

      <PrintSection title="3. Opini ADK" avoidBreak>
        <div className="min-h-[26mm] whitespace-pre-wrap border border-neutral-700 px-3 py-2">
          {checklist.opiniAdk}
        </div>
      </PrintSection>

      <div className="mb-3">
        <SokOpinionPrint />
      </div>

      <div className="mb-3">
        <SignatureSection adkName={checklist.adkName} adkDate={checklist.completedAt} />
      </div>

      <footer className="print-avoid-break border-t border-neutral-400 pt-1.5 text-[8.5px] text-neutral-600">
        <p>
          ID {shortId(checklist.id)} · Status {checklist.status} · Dibuat{" "}
          {formatTimestamp(checklist.createdAt)} · Diperbarui {formatTimestamp(checklist.updatedAt)}
          {checklist.completedAt ? ` · Selesai ${formatTimestamp(checklist.completedAt)}` : ""}
        </p>
        <p>
          Dokumen dihasilkan sistem pada {formatTimestamp(printedAt)} ({formatDate(printedAt)}).
          Checklist ini adalah alat verifikasi &amp; validasi, bukan keputusan persetujuan.
        </p>
      </footer>
    </article>
  );
}

function PrintSection({
  title,
  children,
  avoidBreak = false,
}: {
  title: string;
  children: ReactNode;
  /** Judul dan isi dijaga satu halaman (opini yang lebih tinggi dari satu halaman tetap boleh mengalir). */
  avoidBreak?: boolean;
}) {
  return (
    <section className={cn("mb-3", avoidBreak && "print-avoid-break")}>
      <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

/** Lebar kolom tabel Critical Field Validation: No, Critical Field, tiga sumber, Hasil Validasi. */
const CRITICAL_WIDTHS = ["w-[6%]", "w-[13%]", "w-[22%]", "w-[21%]", "w-[21%]", "w-[17%]"];

function DocumentGroupRows({
  group,
}: {
  group: ReturnType<typeof buildChecklistDocumentModel>["documentGroups"][number];
}) {
  return (
    <>
      <tr className="break-after-avoid bg-neutral-200">
        <td className={cn(cell, "text-center font-bold")}>{group.no}</td>
        <td colSpan={4} className={cn(cell, "font-bold")}>
          {group.title}
        </td>
      </tr>
      {group.rows.length === 0 && group.emptyNote && (
        <tr>
          <td className={cell} />
          <td colSpan={4} className={cn(cell, "italic text-neutral-600")}>
            {group.emptyNote}
          </td>
        </tr>
      )}
      {group.rows.map((doc) => (
        <tr key={doc.no} className={doc.tidakAda ? "bg-neutral-100" : undefined}>
          <td className={cn(cell, "text-center tabular-nums")}>{doc.no}</td>
          <td className={cn(cell, doc.tidakAda && "font-semibold")}>{doc.name}</td>
          <td className={cn(cell, "text-center")}>{doc.ada && <Tick label="Ada" />}</td>
          <td className={cn(cell, "text-center")}>{doc.tidakAda && <Tick label="Tidak Ada" />}</td>
          <td className={cn(cell, "whitespace-pre-wrap")}>{doc.notes}</td>
        </tr>
      ))}
    </>
  );
}

function Lines({ lines }: { lines: { text: string; deviant: boolean; note?: string }[] }) {
  return (
    <>
      {lines.map((line, lineIndex) => (
        <div
          key={lineIndex}
          className={cn(
            "whitespace-pre-wrap",
            line.deviant && "bg-neutral-200 font-bold underline decoration-red-700",
            line.note === "muted" && "text-[9.5px] text-neutral-600",
            line.note === "invalid" && "font-semibold text-red-700",
          )}
        >
          {line.text}
        </div>
      ))}
    </>
  );
}

function ResultText({ row }: { row: CriticalRowModel }) {
  const { state } = row;
  return (
    <>
      {state === "SESUAI" && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-800">
          <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" />
          {row.stateLabel}
        </span>
      )}
      {state === "TIDAK SESUAI" && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-red-700">
          <X className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" />
          {row.stateLabel}
        </span>
      )}
      {(state === "BELUM LENGKAP" || state === "BERSAMA") && (
        <>
          <span className="font-normal text-neutral-600">{row.stateLabel}</span>
          {row.stateNote && (
            <div className="mt-0.5 text-[9.5px] font-normal text-neutral-600">{row.stateNote}</div>
          )}
        </>
      )}
      {row.components && row.components.length > 0 && (
        <ul className="mt-1 border-t border-neutral-400 pt-0.5 text-left text-[9.5px] font-normal">
          {row.components.map((component) => (
            <li
              key={component.id}
              className={cn(
                component.state === "TIDAK SESUAI" && "font-bold text-red-700",
                component.state === "SESUAI" && "text-green-800",
                component.state === "BELUM LENGKAP" && "text-neutral-600",
              )}
            >
              {componentResultText(component)}
            </li>
          ))}
        </ul>
      )}
      {row.info && (
        <div
          className={cn(
            "mt-1 break-words rounded-sm border px-1 py-0.5 text-left text-[9.5px] font-normal leading-tight",
            row.info.tone === "info" && "border-sky-700 bg-sky-50",
            (row.info.tone === "notice" || row.info.tone === "warning") && "border-amber-700 bg-amber-50",
            row.info.tone === "muted" && "border-neutral-400 bg-neutral-50",
          )}
          data-pks-info={row.info.state}
        >
          <div className="font-bold">{row.info.label}</div>
          <div className={cn(row.info.tone === "warning" && "font-semibold")}>
            {row.info.lead}
            {row.info.number && (
              <>
                {" "}
                <strong className="font-bold">{row.info.number}</strong>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CriticalRow({ row }: { row: CriticalRowModel }) {
  // Baris pemilihan Kontra Garansi tidak memiliki status; statusnya ada pada subbaris item.
  const mismatch = row.state === "TIDAK SESUAI" && row.kind !== "kontra";
  const groupHeader = row.kind === "item";
  return (
    <tr
      className={cn(
        mismatch && "bg-red-50",
        !mismatch && groupHeader && "break-after-avoid bg-neutral-100",
      )}
    >
      <td className={cn(cell, "text-center", mismatch && "border-l-4 border-l-red-700")}>
        {row.no}
      </td>
      <td
        className={cn(
          cell,
          row.kind === "item-field" ? "pl-4 font-medium" : "font-semibold",
        )}
      >
        {row.name}
      </td>
      {row.sources ? (
        row.sources.map((source) => (
          <td key={source.key} className={cn(cell, "break-words")}>
            <Lines lines={source.lines} />
          </td>
        ))
      ) : (
        <td colSpan={row.mergedSpansResult ? 4 : 3} className={cn(cell, "break-words")}>
          <Lines lines={row.merged ?? []} />
        </td>
      )}
      {!row.mergedSpansResult && (
        <td className={cn(cell, "text-center font-bold")}>
          <ResultText row={row} />
        </td>
      )}
    </tr>
  );
}

function Tick({ label }: { label: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={label}>
      <Check className="h-4 w-4" strokeWidth={3.5} aria-hidden="true" />
    </span>
  );
}
