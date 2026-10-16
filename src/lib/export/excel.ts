import type { Cell as ExcelCell, Workbook, Worksheet } from "exceljs";

import {
  FEE_COMPONENTS,
  MISMATCH_WARNING_TEXT,
  MISMATCH_WARNING_TITLE,
  SOURCES,
} from "@/lib/checklist/config";
import type { BankGuaranteeChecklist, CriticalField, SourceKey } from "@/lib/checklist/types";
import { normalizeAmountString, toFeeKey } from "@/lib/validation/amount";
import {
  DURATION_RULE_NOTE,
  formatPeriodRange,
  getPeriodStatus,
  isoToUtcDate,
} from "@/lib/validation/period";
import {
  evaluateField,
  summarizeValidation,
  type ComponentEvaluation,
  type FieldEvaluation,
} from "@/lib/validation/three-way-match";
import { downloadBlob } from "./download";
import { buildFileBase, formatTimestamp, shortId } from "./format";

/**
 * Export Excel: data record yang bersih dan dapat dipakai ulang.
 *
 *  - Nominal (Nilai Bank Garansi, Provisi/Administrasi bernominal) ditulis sebagai
 *    ANGKA ASLI dengan number format ber-separator ribuan + kode mata uang,
 *    sehingga bisa dijumlah/disortir. Pemisah yang tampil mengikuti locale Excel.
 *  - Tanggal Jangka Waktu ditulis sebagai TANGGAL ASLI berformat dd/mm/yyyy,
 *    durasi hari sebagai angka.
 *  - Critical field bermultikomponen (Jangka Waktu, Biaya) dipecah menjadi sub-baris;
 *    hasil 3-Way Match digabung (merge) per field dan diberi conditional formatting
 *    (SESUAI hijau, TIDAK SESUAI merah, Belum lengkap amber) yang tetap bekerja
 *    bila isi sel diedit.
 */

const ARGB = {
  primary: "FF00529C",
  white: "FFFFFFFF",
  text: "FF111827",
  muted: "FF64748B",
  border: "FF94A3B8",
  greenText: "FF166534",
  greenFill: "FFDCFCE7",
  redText: "FFB91C1C",
  redFill: "FFFEE2E2",
  amberText: "FF92400E",
  amberFill: "FFFEF3C7",
};

const THIN_BORDER = {
  top: { style: "thin" as const, color: { argb: ARGB.border } },
  left: { style: "thin" as const, color: { argb: ARGB.border } },
  bottom: { style: "thin" as const, color: { argb: ARGB.border } },
  right: { style: "thin" as const, color: { argb: ARGB.border } },
};

/** A No | B Critical Field | C Komponen | D Underlying | E PTK | F MAK | G 3-Way Match | H Catatan */
const COLUMN_WIDTHS = [6, 26, 19, 27, 27, 27, 18, 40];
const LAST_COL = "H";
const COLUMN_COUNT = COLUMN_WIDTHS.length;

const SOURCE_COLUMN: Record<SourceKey, number> = { underlyingDocument: 4, ptk: 5, mak: 6 };
const MATCH_COLUMN = 7;
const NOTE_COLUMN = 8;

const DATE_FORMAT = "dd/mm/yyyy";
const DAYS_FORMAT = '#,##0 "hari"';

const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

/** Perkiraan tinggi baris untuk teks yang di-wrap (exceljs tidak auto-fit). */
function estimateHeight(texts: Array<{ text: string; width: number }>, min = 18): number {
  let lines = 1;
  for (const { text, width } of texts) {
    const charsPerLine = Math.max(8, Math.floor(width * 1.05));
    const count = text
      .split(/\r?\n/)
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    lines = Math.max(lines, count);
  }
  return Math.max(min, lines * 14.5 + 4);
}

function styleHeaderCell(cell: ExcelCell, center: boolean) {
  cell.font = { bold: true, color: { argb: ARGB.white } };
  cell.fill = solid(ARGB.primary);
  cell.alignment = { vertical: "middle", horizontal: center ? "center" : "left", wrapText: true };
  cell.border = THIN_BORDER;
}

/** Header kolom: biru BRI + teks putih. `merges` = rentang kolom yang digabung pada baris ini. */
function headerRow(ws: Worksheet, rowNumber: number, labels: string[], merges: string[] = []) {
  const row = ws.getRow(rowNumber);
  for (let c = 1; c <= COLUMN_COUNT; c++) {
    const cell = row.getCell(c);
    cell.value = labels[c - 1] ?? "";
    styleHeaderCell(cell, c === 1 || labels[c - 1] === "3-Way Match");
  }
  for (const range of merges) {
    const [from, to] = range.split(":");
    ws.mergeCells(`${from}${rowNumber}:${to}${rowNumber}`);
  }
  row.height = 22;
}

function sectionTitle(ws: Worksheet, rowNumber: number, title: string) {
  ws.mergeCells(`A${rowNumber}:${LAST_COL}${rowNumber}`);
  const cell = ws.getCell(`A${rowNumber}`);
  cell.value = title.toUpperCase();
  cell.font = { bold: true, size: 11, color: { argb: ARGB.primary } };
  cell.alignment = { vertical: "middle" };
  ws.getRow(rowNumber).height = 22;
}

function borderRow(ws: Worksheet, rowNumber: number) {
  for (let c = 1; c <= COLUMN_COUNT; c++) ws.getCell(rowNumber, c).border = THIN_BORDER;
}

/* ------------------------------------------------------------------ */
/* Isi sel Critical Field                                               */
/* ------------------------------------------------------------------ */

type ExcelValue = string | number | Date | null;

type SourceCell = {
  value: ExcelValue;
  numFmt?: string;
  right?: boolean;
  /** Menyimpang dari Underlying Document. */
  deviant: boolean;
  /** Teks pendukung/belum tersedia. */
  muted?: boolean;
  invalid?: boolean;
};

type SubRow = {
  /** Nama komponen (kolom C); kosong bila field hanya satu baris. */
  label: string;
  cells: Record<SourceKey, SourceCell>;
  note: string;
};

const EMPTY_CELL: SourceCell = { value: null, deviant: false };

function perSource(build: (source: SourceKey) => SourceCell): Record<SourceKey, SourceCell> {
  return {
    underlyingDocument: build("underlyingDocument"),
    ptk: build("ptk"),
    mak: build("mak"),
  };
}

function amountFormat(currency: string, normalizedAmount: string): string {
  const fraction = normalizedAmount.split(".")[1];
  const decimals = fraction ? `.${"0".repeat(Math.min(fraction.length, 6))}` : "";
  return `"${currency} "#,##0${decimals}`;
}

/** Sel nominal: angka asli + format ribuan dan kode mata uang. */
function moneyCell(currency: string, normalizedAmount: string, deviant: boolean): SourceCell {
  const value = Number(normalizedAmount);
  if (!Number.isFinite(value)) return { value: normalizedAmount, deviant };
  return {
    value,
    numFmt: amountFormat(currency, normalizedAmount),
    right: true,
    deviant,
  };
}

function sourceLabel(source: SourceKey): string {
  return SOURCES.find((s) => s.key === source)?.label ?? source;
}

/** Catatan komponen: perbedaan, sumber yang belum lengkap, atau tanggal yang tidak valid. */
function componentNote(component: ComponentEvaluation | undefined): string {
  if (!component) return "";
  const parts: string[] = [];
  if (component.reasons.length > 0) parts.push(component.reasons.join("; "));
  for (const item of component.invalid) parts.push(`${sourceLabel(item.source)}: ${item.message}`);
  const invalidSources = new Set(component.invalid.map((item) => item.source));
  const missing = component.incomplete.filter((source) => !invalidSources.has(source));
  if (missing.length > 0) {
    parts.push(`Belum lengkap: ${missing.map(sourceLabel).join(", ")}`);
  }
  return parts.join(" | ");
}

function buildSubRows(field: CriticalField, evaluation: FieldEvaluation): SubRow[] {
  const component = (id: string) => evaluation.components.find((c) => c.id === id);
  const deviates = (source: SourceKey, id: string): boolean =>
    source !== "underlyingDocument" && component(id)?.deviating[source] === true;

  switch (field.key) {
    case "nilaiBg": {
      const amounts = field;
      return [
        {
          label: "",
          cells: perSource((source) => {
            const value = amounts[source];
            const normalized = normalizeAmountString(value.amount);
            return normalized
              ? moneyCell(value.currency, normalized, deviates(source, "amount"))
              : EMPTY_CELL;
          }),
          note: componentNote(component("amount")),
        },
      ];
    }

    case "jangkaWaktu": {
      const periods = field;
      const status = (source: SourceKey) => getPeriodStatus(periods[source]);

      const dateCell = (source: SourceKey, part: "start" | "end"): SourceCell => {
        const raw = periods[source][part].trim();
        if (!raw) return EMPTY_CELL;
        const valid = status(source)[part === "start" ? "startValid" : "endValid"];
        // Tanggal yang terbaca ditulis sebagai tanggal asli (termasuk tanggal akhir yang terbalik,
        // ditandai tidak valid); hanya isian yang tidak terbaca ditulis sebagai teks.
        const date = isoToUtcDate(raw);
        return date
          ? { value: date, numFmt: DATE_FORMAT, right: true, deviant: deviates(source, part), invalid: !valid }
          : { value: raw, deviant: false, invalid: true };
      };

      return [
        {
          label: "Periode",
          cells: perSource((source) => {
            const range = formatPeriodRange(periods[source]);
            return range
              ? {
                  value: range,
                  deviant: deviates(source, "start") || deviates(source, "end"),
                }
              : EMPTY_CELL;
          }),
          note: "",
        },
        {
          label: "Tanggal Mulai",
          cells: perSource((source) => dateCell(source, "start")),
          note: componentNote(component("start")),
        },
        {
          label: "Tanggal Akhir",
          cells: perSource((source) => dateCell(source, "end")),
          note: componentNote(component("end")),
        },
        {
          label: "Durasi (hari)",
          cells: perSource((source): SourceCell => {
            const { days } = status(source);
            return days === null
              ? { value: "Belum tersedia", deviant: false, muted: true }
              : { value: days, numFmt: DAYS_FORMAT, right: true, deviant: false };
          }),
          note: "Dihitung otomatis dari tanggal mulai & akhir",
        },
      ];
    }

    case "biaya": {
      const fees = field;
      return FEE_COMPONENTS.map((feeComponent) => ({
        label: feeComponent.label,
        cells: perSource((source): SourceCell => {
          const raw = fees[source][feeComponent.key].trim();
          if (!raw) return EMPTY_CELL;
          const deviant = deviates(source, feeComponent.key);
          const key = toFeeKey(raw);
          if (key.startsWith("amt:")) {
            const [, currency, amount] = key.split(":");
            return moneyCell(currency, amount, deviant);
          }
          return { value: raw, deviant };
        }),
        note: componentNote(component(feeComponent.key)),
      }));
    }

    default: {
      const texts = field;
      return [
        {
          label: "",
          cells: perSource((source) => {
            const text = texts[source].trim();
            return text ? { value: text, deviant: deviates(source, "value") } : EMPTY_CELL;
          }),
          note: componentNote(component("value")),
        },
      ];
    }
  }
}

function writeSourceCell(cell: ExcelCell, spec: SourceCell) {
  cell.value = spec.value;
  if (spec.numFmt) cell.numFmt = spec.numFmt;
  cell.border = THIN_BORDER;
  cell.alignment = {
    vertical: "top",
    wrapText: true,
    horizontal: spec.right ? "right" : "left",
  };
  if (spec.deviant) {
    cell.fill = solid(ARGB.redFill);
    cell.font = { bold: true, color: { argb: ARGB.redText } };
  } else if (spec.invalid) {
    cell.font = { color: { argb: ARGB.redText } };
  } else if (spec.muted) {
    cell.font = { italic: true, color: { argb: ARGB.muted } };
  }
}

function matchLabel(state: FieldEvaluation["state"]): string {
  return state === "BELUM LENGKAP" ? "Belum lengkap" : state;
}

export async function buildChecklistWorkbook(
  checklist: BankGuaranteeChecklist,
  options: { timeZone?: string } = {},
): Promise<Workbook> {
  // exceljs adalah paket CommonJS: ambil `default` bila ada, jika tidak pakai modul itu sendiri.
  const excelModule = (await import("exceljs")) as unknown as {
    default?: typeof import("exceljs");
  } & typeof import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  const fmtTs = (value: string) => formatTimestamp(value, { timeZone: options.timeZone });

  const wb = new ExcelJS.Workbook();
  wb.creator = checklist.adkName || "BRI Bank Guarantee Verification";
  wb.created = new Date(checklist.createdAt);
  wb.modified = new Date(checklist.updatedAt);

  const ws = wb.addWorksheet("Checklist BG", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  let r = 1;

  /* Judul */
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const title = ws.getCell(`A${r}`);
  title.value = "CHECKLIST VERIFIKASI & VALIDASI DATA BANK GARANSI";
  title.font = { bold: true, size: 15, color: { argb: ARGB.primary } };
  title.alignment = { vertical: "middle" };
  ws.getRow(r).height = 28;
  r += 1;

  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const subtitle = ws.getCell(`A${r}`);
  subtitle.value = `BRI Bank Guarantee Verification  |  ID ${shortId(checklist.id)}  |  Status: ${checklist.status}`;
  subtitle.font = { size: 9, color: { argb: ARGB.muted } };
  r += 2;

  /* Informasi pengajuan */
  const info: Array<[string, string]> = [
    ["Nama ADK (Risk Owner)", checklist.adkName],
    ["Atas Nama", checklist.atasNama],
    ["CIF", checklist.cif],
    ["Jenis Pengajuan", checklist.jenisPengajuan],
    ["Nama Task", checklist.taskName],
    ["Status", checklist.status],
    ["Created At", fmtTs(checklist.createdAt)],
    ["Last Updated At", fmtTs(checklist.updatedAt)],
    ["Completed At", checklist.completedAt ? fmtTs(checklist.completedAt) : "-"],
  ];
  for (const [label, value] of info) {
    ws.mergeCells(`A${r}:B${r}`);
    ws.mergeCells(`C${r}:E${r}`);
    const labelCell = ws.getCell(`A${r}`);
    labelCell.value = label;
    styleHeaderCell(labelCell, false);
    ws.getCell(`B${r}`).border = THIN_BORDER;
    ws.getCell(`B${r}`).fill = solid(ARGB.primary);
    const valueCell = ws.getCell(`C${r}`);
    valueCell.value = value;
    valueCell.alignment = { wrapText: true, vertical: "top" };
    for (const col of ["C", "D", "E"]) ws.getCell(`${col}${r}`).border = THIN_BORDER;
    r += 1;
  }
  r += 1;

  /* 1. Document Verification */
  sectionTitle(ws, r, "1. Document Verification");
  r += 1;
  headerRow(ws, r, ["No", "Jenis Dokumen", "", "Ada", "Tidak Ada", "Keterangan", "", ""], [
    "B:C",
    "F:H",
  ]);
  r += 1;

  const notesWidth = COLUMN_WIDTHS[5] + COLUMN_WIDTHS[6] + COLUMN_WIDTHS[7];
  checklist.documentVerification.forEach((d, index) => {
    const row = ws.getRow(r);
    ws.mergeCells(`B${r}:C${r}`);
    ws.mergeCells(`F${r}:H${r}`);
    row.getCell(1).value = index + 1;
    row.getCell(2).value = d.documentName;
    row.getCell(4).value = d.status === "Ada" ? "✓" : "";
    row.getCell(5).value = d.status === "Tidak Ada" ? "✓" : "";
    row.getCell(6).value = d.notes;

    for (let c = 1; c <= COLUMN_COUNT; c++) {
      const cell = row.getCell(c);
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: "top",
        wrapText: true,
        horizontal: c === 1 || c === 4 || c === 5 ? "center" : "left",
      };
      if (d.status === "Tidak Ada") cell.fill = solid(ARGB.amberFill);
    }
    if (d.status === "Ada") row.getCell(4).font = { bold: true, color: { argb: ARGB.greenText } };
    if (d.status === "Tidak Ada") row.getCell(5).font = { bold: true, color: { argb: ARGB.redText } };
    row.height = estimateHeight([
      { text: d.notes, width: notesWidth },
      { text: d.documentName, width: COLUMN_WIDTHS[1] + COLUMN_WIDTHS[2] },
    ]);
    r += 1;
  });
  r += 1;

  /* 2. Critical Field Validation */
  sectionTitle(ws, r, "2. Critical Field Validation");
  r += 1;
  headerRow(ws, r, [
    "No",
    "Critical Field",
    "Komponen",
    "Underlying Document (acuan)",
    "PTK",
    "MAK",
    "3-Way Match",
    "Catatan",
  ]);
  r += 1;

  const firstMatchRow = r;
  checklist.criticalFields.forEach((field, index) => {
    const evaluation = evaluateField(field);
    const subRows = buildSubRows(field, evaluation);
    const first = r;
    const last = r + subRows.length - 1;
    const single = subRows.length === 1;

    subRows.forEach((sub, offset) => {
      const rowNumber = first + offset;
      const row = ws.getRow(rowNumber);
      borderRow(ws, rowNumber);

      row.getCell(3).value = sub.label;
      row.getCell(3).alignment = { vertical: "top", wrapText: true };
      for (const source of Object.keys(SOURCE_COLUMN) as SourceKey[]) {
        writeSourceCell(row.getCell(SOURCE_COLUMN[source]), sub.cells[source]);
      }
      const noteCell = row.getCell(NOTE_COLUMN);
      noteCell.value = sub.note;
      noteCell.alignment = { vertical: "top", wrapText: true };
      noteCell.font = {
        color: { argb: evaluation.state === "TIDAK SESUAI" ? ARGB.redText : ARGB.muted },
        size: 9,
      };

      row.height = estimateHeight(
        [
          ...SOURCES.map((s) => ({
            text: typeof sub.cells[s.key].value === "string" ? String(sub.cells[s.key].value) : "",
            width: COLUMN_WIDTHS[SOURCE_COLUMN[s.key] - 1],
          })),
          { text: sub.note, width: COLUMN_WIDTHS[NOTE_COLUMN - 1] },
          { text: sub.label, width: COLUMN_WIDTHS[2] },
          ...(single ? [{ text: field.fieldName, width: COLUMN_WIDTHS[1] + COLUMN_WIDTHS[2] }] : []),
        ],
        single ? 20 : 18,
      );
    });

    // No, nama field, dan hasil 3-Way Match digabung pada seluruh sub-baris.
    ws.getCell(first, 1).value = index + 1;
    ws.getCell(first, 2).value = field.fieldName;
    ws.getCell(first, MATCH_COLUMN).value = matchLabel(evaluation.state);
    if (single) ws.mergeCells(`B${first}:C${first}`);
    else ws.mergeCells(`B${first}:B${last}`);
    if (!single) {
      ws.mergeCells(`A${first}:A${last}`);
      ws.mergeCells(`G${first}:G${last}`);
    }

    ws.getCell(first, 1).alignment = { vertical: "top", horizontal: "center" };
    ws.getCell(first, 2).alignment = { vertical: "top", wrapText: true };
    ws.getCell(first, 2).font = { bold: true };

    const matchCell = ws.getCell(first, MATCH_COLUMN);
    matchCell.alignment = { vertical: "top", horizontal: "center", wrapText: true };
    const palette =
      evaluation.state === "SESUAI"
        ? { font: ARGB.greenText, fill: ARGB.greenFill }
        : evaluation.state === "TIDAK SESUAI"
          ? { font: ARGB.redText, fill: ARGB.redFill }
          : { font: ARGB.amberText, fill: ARGB.amberFill };
    matchCell.font = { bold: true, color: { argb: palette.font } };
    matchCell.fill = solid(palette.fill);

    for (let rowNumber = first; rowNumber <= last; rowNumber++) borderRow(ws, rowNumber);
    r = last + 1;
  });
  const lastMatchRow = r - 1;

  // Conditional formatting: tetap bekerja jika nilai sel diubah di Excel.
  ws.addConditionalFormatting({
    ref: `G${firstMatchRow}:G${lastMatchRow}`,
    rules: [
      {
        type: "cellIs",
        operator: "equal",
        formulae: ['"SESUAI"'],
        priority: 1,
        style: {
          font: { bold: true, color: { argb: ARGB.greenText } },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: ARGB.greenFill } },
        },
      },
      {
        type: "cellIs",
        operator: "equal",
        formulae: ['"TIDAK SESUAI"'],
        priority: 2,
        style: {
          font: { bold: true, color: { argb: ARGB.redText } },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: ARGB.redFill } },
        },
      },
      {
        type: "cellIs",
        operator: "equal",
        formulae: ['"Belum lengkap"'],
        priority: 3,
        style: {
          font: { bold: true, color: { argb: ARGB.amberText } },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: ARGB.amberFill } },
        },
      },
    ],
  });

  /* Ringkasan validasi: mismatch dan "belum lengkap" dilaporkan terpisah. */
  const summary = summarizeValidation(checklist.criticalFields);
  const summaryBox = (text: string, font: string, fill: string | null, height: number) => {
    r += 1;
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    const cell = ws.getCell(`A${r}`);
    cell.value = text;
    cell.font = { bold: true, color: { argb: font } };
    if (fill) cell.fill = solid(fill);
    cell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    ws.getRow(r).height = height;
  };

  if (summary.mismatch > 0) {
    summaryBox(
      `⚠ ${MISMATCH_WARNING_TITLE} — ${summary.mismatch} dari ${summary.total} critical fields tidak sesuai (${summary.mismatchLabels.join(", ")}).\n${MISMATCH_WARNING_TEXT}`,
      ARGB.redText,
      ARGB.redFill,
      44,
    );
  } else if (summary.match === summary.total) {
    summaryBox(
      `✓ Seluruh Critical Field telah sesuai (${summary.match} dari ${summary.total}).`,
      ARGB.greenText,
      ARGB.greenFill,
      24,
    );
  }
  if (summary.incomplete > 0) {
    summaryBox(
      `Belum lengkap: ${summary.incomplete} dari ${summary.total} critical fields (${summary.incompleteLabels.join(", ")}). Data yang belum lengkap atau tidak valid tidak dianggap sesuai.`,
      ARGB.amberText,
      ARGB.amberFill,
      32,
    );
  }
  r += 1;

  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const durationNote = ws.getCell(`A${r}`);
  durationNote.value = DURATION_RULE_NOTE;
  durationNote.font = { italic: true, size: 9, color: { argb: ARGB.muted } };
  durationNote.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r).height = 16;
  r += 2;

  /* 3. Opini ADK */
  sectionTitle(ws, r, "3. Opini ADK");
  r += 1;
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const opinion = ws.getCell(`A${r}`);
  opinion.value = checklist.opiniAdk;
  opinion.alignment = { vertical: "top", wrapText: true };
  borderRow(ws, r);
  ws.getRow(r).height = Math.min(
    409, // batas tinggi baris Excel
    estimateHeight([{ text: checklist.opiniAdk, width: COLUMN_WIDTHS.reduce((a, b) => a + b, 0) }], 60),
  );
  r += 2;

  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const footnote = ws.getCell(`A${r}`);
  footnote.value =
    "Opini SOK, tanda tangan, dan tanggal SOK diisi secara manual pada dokumen cetak. Checklist ini adalah alat verifikasi & validasi, bukan keputusan persetujuan.";
  footnote.font = { italic: true, size: 9, color: { argb: ARGB.muted } };
  footnote.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r).height = 26;

  return wb;
}

/** Hasil mentah (untuk pengujian / server-side). */
export async function buildChecklistExcelBytes(
  checklist: BankGuaranteeChecklist,
  options: { timeZone?: string } = {},
) {
  const wb = await buildChecklistWorkbook(checklist, options);
  const buffer = await wb.xlsx.writeBuffer();
  // Salin ke Uint8Array murni (di browser exceljs mengembalikan polyfill Buffer).
  return new Uint8Array(buffer);
}

/** Membuat dan mengunduh Excel di browser. */
export async function exportChecklistExcel(checklist: BankGuaranteeChecklist): Promise<string> {
  const buffer = await buildChecklistExcelBytes(checklist);
  const filename = `${buildFileBase(checklist.atasNama, checklist.completedAt ?? checklist.updatedAt)}.xlsx`;
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
  return filename;
}
