import type * as Docx from "docx";

import { APP_FULL_NAME, APP_NAME, APP_TAGLINE } from "@/lib/checklist/config";
import { componentResultText, type DisplayLine } from "@/lib/checklist/display";
import type { BankGuaranteeChecklist, MatchState } from "@/lib/checklist/types";
import { downloadBlob } from "./download";
import {
  buildChecklistDocumentModel,
  type ChecklistDocumentModel,
  type CriticalRowModel,
  type DocumentModelOptions,
  type SignatureModel,
} from "./document-model";
import { buildFileBase } from "./format";

/**
 * Export Word (.docx) sungguhan - bukan HTML yang diberi ekstensi .doc.
 * Seluruh isi memakai paragraf & tabel Word asli sehingga dapat diedit, dan
 * mengikuti model dokumen yang sama dengan PDF/Cetak (`document-model.ts`).
 *
 * Tata letak: A4 portrait, tabel lebar tetap (kolom DXA), baris tidak terpotong
 * antarhalaman, header tabel berulang, area Opini SOK berisi baris tulisan tangan
 * yang cukup, dan ruang tanda tangan basah.
 */

type DocxModule = typeof Docx;

/* ------------------------------------------------------------------ */
/* Konstanta tampilan                                                  */
/* ------------------------------------------------------------------ */

const PAGE_W = 11906; // A4, DXA
const PAGE_H = 16838;
const MARGIN_X = 850;
const MARGIN_TOP = 850;
const MARGIN_BOTTOM = 1100;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 10206

const FONT = "Arial";
const SYMBOL_FONT = "Segoe UI Symbol";

const COLOR = {
  primary: "00529C",
  white: "FFFFFF",
  text: "111827",
  muted: "64748B",
  border: "6B7280",
  success: "166534",
  successSoft: "DCFCE7",
  danger: "B91C1C",
  dangerSoft: "FEEEEE",
  dangerCell: "FECACA",
  warning: "92400E",
  warningSoft: "FEF3C7",
  rowAlt: "F1F5F9",
  groupSoft: "DBEAFE",
  infoSoft: "E8F1FB",
  line: "94A3B8",
} as const;

/** Lebar kolom (DXA) - jumlahnya harus sama dengan CONTENT_W. */
const IDENTITY_COLS = [1700, 3403, 1700, 3403];
const DOCUMENT_COLS = [700, 2900, 800, 1100, 4706];
const CRITICAL_COLS = [620, 1300, 2100, 2000, 2050, 2136];
const SIGNATURE_COLS = [CONTENT_W / 2, CONTENT_W / 2];

for (const cols of [IDENTITY_COLS, DOCUMENT_COLS, CRITICAL_COLS, SIGNATURE_COLS]) {
  if (cols.reduce((a, b) => a + b, 0) !== CONTENT_W) {
    throw new Error("Lebar kolom Word tidak sama dengan lebar konten.");
  }
}

const BULLET_REF = "bricheck-bullets";

/* ------------------------------------------------------------------ */
/* Pembangun dokumen                                                   */
/* ------------------------------------------------------------------ */

export async function buildChecklistDocx(
  checklist: BankGuaranteeChecklist,
  options: DocumentModelOptions = {},
): Promise<Docx.Document> {
  const d = await import("docx");
  const model = buildChecklistDocumentModel(checklist, options);
  return createDocument(d, checklist, model);
}

export function createDocument(
  d: DocxModule,
  checklist: BankGuaranteeChecklist,
  model: ChecklistDocumentModel,
): Docx.Document {
  const children: (Docx.Paragraph | Docx.Table)[] = [
    ...renderTitleBlock(d, model),
    renderIdentityTable(d, model),
    spacer(d),

    heading(d, model.documentsHeading),
    renderDocumentsTable(d, model),
    note(d, model.documentsNote),

    heading(d, model.criticalHeading),
    renderCriticalTable(d, model),
    spacer(d, 80),
    ...renderValidationBlocks(d, model),

    heading(d, model.opinionHeading),
    renderOpinionBox(d, model.opiniAdk),
    spacer(d),

    heading(d, model.sokHeading),
    renderSokBox(d, model.sokLines),
    spacer(d),

    renderSignatureTable(d, model),
  ];

  return new d.Document({
    creator: checklist.adkName || APP_NAME,
    title: `${APP_NAME} - ${model.title} - ${checklist.atasNama || checklist.taskName}`,
    subject: APP_FULL_NAME,
    description: model.disclaimer,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 18, color: COLOR.text },
          paragraph: { spacing: { line: 252 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 26, bold: true, color: COLOR.primary },
          paragraph: { spacing: { before: 60, after: 120 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 20, bold: true, color: COLOR.primary, allCaps: true },
          paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: d.LevelFormat.BULLET,
              text: "•",
              alignment: d.AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: {
              top: MARGIN_TOP,
              bottom: MARGIN_BOTTOM,
              left: MARGIN_X,
              right: MARGIN_X,
              header: 400,
              footer: 400,
            },
          },
        },
        headers: { default: renderHeader(d, model) },
        footers: { default: renderFooter(d, model) },
        children,
      },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Primitif                                                            */
/* ------------------------------------------------------------------ */

type RunStyle = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
  font?: string;
  fill?: string;
};

function run(d: DocxModule, text: string, style: RunStyle = {}): Docx.TextRun {
  return new d.TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    underline: style.underline ? { type: d.UnderlineType.SINGLE, color: COLOR.danger } : undefined,
    color: style.color,
    size: style.size,
    font: style.font,
    shading: style.fill
      ? { type: d.ShadingType.CLEAR, fill: style.fill, color: "auto" }
      : undefined,
  });
}

type ParaOptions = {
  align?: (typeof Docx.AlignmentType)[keyof typeof Docx.AlignmentType];
  before?: number;
  after?: number;
  keepNext?: boolean;
  bullet?: boolean;
  /** Indentasi kiri (DXA), mis. untuk field detail di bawah item Kontra Garansi. */
  indentLeft?: number;
  /** Latar paragraf dan garis tepi (panel informasi). */
  panel?: { fill: string; border: string };
};

function para(
  d: DocxModule,
  runs: Docx.TextRun[] | string,
  options: ParaOptions = {},
): Docx.Paragraph {
  return new d.Paragraph({
    children: typeof runs === "string" ? [run(d, runs)] : runs,
    alignment: options.align,
    keepNext: options.keepNext,
    spacing: { before: options.before ?? 0, after: options.after ?? 0 },
    numbering: options.bullet ? { reference: BULLET_REF, level: 0 } : undefined,
    // Panel diberi indentasi kecil agar garis tepi kiri/kanan berada di dalam sel.
    indent: options.panel
      ? { left: 80, right: 80 }
      : options.indentLeft
        ? { left: options.indentLeft }
        : undefined,
    shading: options.panel
      ? { type: d.ShadingType.CLEAR, fill: options.panel.fill, color: "auto" }
      : undefined,
    // Kotak tipis di keempat sisi; dua paragraf berurutan dengan border sama tergabung menjadi satu kotak.
    border: options.panel
      ? {
          top: { style: d.BorderStyle.SINGLE, size: 4, color: options.panel.border, space: 1 },
          bottom: { style: d.BorderStyle.SINGLE, size: 4, color: options.panel.border, space: 1 },
          left: { style: d.BorderStyle.SINGLE, size: 4, color: options.panel.border, space: 2 },
          right: { style: d.BorderStyle.SINGLE, size: 4, color: options.panel.border, space: 2 },
        }
      : undefined,
  });
}

/**
 * Informasi PKS (Hasil Validasi Biaya): dua paragraf berpanel (label + pesan). Nomor PKS ditebalkan.
 * Makna tidak bergantung pada warna: ada label "Informasi PKS" dan teks pesan.
 */
function pksInfoParagraphs(
  d: DocxModule,
  info: NonNullable<CriticalRowModel["info"]>,
): Docx.Paragraph[] {
  const palette =
    info.tone === "info"
      ? { fill: COLOR.infoSoft, border: COLOR.primary, label: COLOR.primary }
      : info.tone === "muted"
        ? { fill: COLOR.rowAlt, border: COLOR.line, label: COLOR.muted }
        : { fill: COLOR.warningSoft, border: COLOR.warning, label: COLOR.warning };
  const panel = { fill: palette.fill, border: palette.border };
  const messageColor = info.tone === "warning" || info.tone === "notice" ? COLOR.warning : COLOR.text;
  return [
    para(d, [run(d, info.label, { bold: true, color: palette.label, size: 16 })], { before: 40, panel }),
    para(
      d,
      [
        run(d, info.lead, { bold: info.tone === "warning", color: messageColor, size: 16 }),
        ...(info.number
          ? [run(d, ` ${info.number}`, { bold: true, color: COLOR.primary, size: 16 })]
          : []),
      ],
      { panel },
    ),
  ];
}

function spacer(d: DocxModule, after = 120): Docx.Paragraph {
  return new d.Paragraph({ children: [], spacing: { before: 0, after } });
}

function heading(d: DocxModule, text: string): Docx.Paragraph {
  return new d.Paragraph({
    heading: d.HeadingLevel.HEADING_2,
    children: [new d.TextRun({ text })],
  });
}

function note(d: DocxModule, text: string): Docx.Paragraph {
  return para(d, [run(d, text, { size: 15, color: COLOR.muted })], { before: 40, after: 60 });
}

function borderSet(d: DocxModule, color: string, size = 4) {
  const side = { style: d.BorderStyle.SINGLE, size, color };
  return { top: side, bottom: side, left: side, right: side };
}

type CellOptions = {
  width: number;
  fill?: string;
  borderColor?: string;
  borderSize?: number;
  vAlign?: (typeof Docx.VerticalAlignTable)[keyof typeof Docx.VerticalAlignTable];
  span?: number;
};

function cell(d: DocxModule, children: Docx.Paragraph[], o: CellOptions): Docx.TableCell {
  return new d.TableCell({
    width: { size: o.width, type: d.WidthType.DXA },
    columnSpan: o.span,
    borders: borderSet(d, o.borderColor ?? COLOR.border, o.borderSize ?? 4),
    shading: o.fill ? { type: d.ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    verticalAlign: o.vAlign,
    children: children.length > 0 ? children : [new d.Paragraph({ children: [] })],
  });
}

function table(
  d: DocxModule,
  columns: number[],
  rows: Docx.TableRow[],
): Docx.Table {
  return new d.Table({
    width: { size: columns.reduce((a, b) => a + b, 0), type: d.WidthType.DXA },
    columnWidths: columns,
    layout: d.TableLayoutType.FIXED,
    rows,
  });
}

function headCell(
  d: DocxModule,
  text: string,
  width: number,
  align: ParaOptions["align"] = d.AlignmentType.LEFT,
): Docx.TableCell {
  return cell(
    d,
    [para(d, [run(d, text, { bold: true, color: COLOR.white })], { align, keepNext: true })],
    { width, fill: COLOR.primary, borderColor: COLOR.primary, vAlign: d.VerticalAlignTable.CENTER },
  );
}

/** Teks multi-baris menjadi beberapa paragraf (tanpa "\n" di dalam run). */
function textParagraphs(
  d: DocxModule,
  text: string,
  style: RunStyle = {},
  options: ParaOptions = {},
): Docx.Paragraph[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => para(d, [run(d, line, style)], options));
}

/* ------------------------------------------------------------------ */
/* Judul, header, footer                                               */
/* ------------------------------------------------------------------ */

function renderTitleBlock(d: DocxModule, model: ChecklistDocumentModel): Docx.Paragraph[] {
  return [
    new d.Paragraph({
      spacing: { after: 20 },
      tabStops: [{ type: d.TabStopType.RIGHT, position: CONTENT_W }],
      children: [
        run(d, model.org.toUpperCase(), { bold: true, size: 15, color: COLOR.muted }),
        run(d, "   ", { size: 15 }),
        run(d, APP_NAME, { bold: true, size: 15, color: COLOR.primary }),
        run(d, " — ", { size: 15, color: COLOR.primary }),
        run(d, APP_TAGLINE, { size: 15, color: COLOR.muted }),
        new d.TextRun({
          children: [new d.Tab(), `STATUS: ${model.statusLabel.toUpperCase()}`],
          bold: true,
          size: 15,
          color: COLOR.muted,
        }),
      ],
    }),
    new d.Paragraph({
      heading: d.HeadingLevel.HEADING_1,
      spacing: { before: 40, after: 120 },
      border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: COLOR.primary, space: 4 } },
      children: [new d.TextRun({ text: model.title.toUpperCase() })],
    }),
  ];
}

function renderHeader(d: DocxModule, model: ChecklistDocumentModel): Docx.Header {
  return new d.Header({
    children: [
      new d.Paragraph({
        alignment: d.AlignmentType.RIGHT,
        children: [run(d, model.appFullName, { size: 14, color: COLOR.muted })],
      }),
    ],
  });
}

function renderFooter(d: DocxModule, model: ChecklistDocumentModel): Docx.Footer {
  const small = { size: 13, color: COLOR.muted } as const;
  return new d.Footer({
    children: [
      new d.Paragraph({
        border: { top: { style: d.BorderStyle.SINGLE, size: 4, color: COLOR.line, space: 4 } },
        spacing: { after: 0 },
        children: [run(d, model.metadata[0] ?? "", small)],
      }),
      new d.Paragraph({
        tabStops: [{ type: d.TabStopType.RIGHT, position: CONTENT_W }],
        spacing: { after: 0 },
        children: [
          run(d, model.metadata[1] ?? "", small),
          new d.TextRun({
            children: [
              new d.Tab(),
              "Halaman ",
              d.PageNumber.CURRENT,
              " dari ",
              d.PageNumber.TOTAL_PAGES,
            ],
            ...small,
          }),
        ],
      }),
      new d.Paragraph({
        spacing: { after: 0 },
        children: [run(d, model.disclaimer, { ...small, italics: true })],
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Informasi pengajuan                                                 */
/* ------------------------------------------------------------------ */

function renderIdentityTable(d: DocxModule, model: ChecklistDocumentModel): Docx.Table {
  const rows = model.identity.map(
    (pair) =>
      new d.TableRow({
        cantSplit: true,
        children: pair.flatMap((item, index) => [
          cell(
            d,
            [para(d, [run(d, item.label, { bold: true, color: COLOR.white })])],
            {
              width: IDENTITY_COLS[index * 2],
              fill: COLOR.primary,
              borderColor: COLOR.primary,
            },
          ),
          cell(d, textParagraphs(d, item.value), { width: IDENTITY_COLS[index * 2 + 1] }),
        ]),
      }),
  );
  return table(d, IDENTITY_COLS, rows);
}

/* ------------------------------------------------------------------ */
/* 1. Document Verification                                            */
/* ------------------------------------------------------------------ */

function tick(d: DocxModule, color: string): Docx.TextRun {
  return run(d, "✓", { bold: true, color, font: SYMBOL_FONT, size: 20 });
}

function renderDocumentsTable(d: DocxModule, model: ChecklistDocumentModel): Docx.Table {
  const header = new d.TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      headCell(d, "No", DOCUMENT_COLS[0], d.AlignmentType.CENTER),
      headCell(d, "Jenis Dokumen", DOCUMENT_COLS[1]),
      headCell(d, "Ada", DOCUMENT_COLS[2], d.AlignmentType.CENTER),
      headCell(d, "Tidak Ada", DOCUMENT_COLS[3], d.AlignmentType.CENTER),
      headCell(d, "Keterangan", DOCUMENT_COLS[4]),
    ],
  });

  const spanWidth = DOCUMENT_COLS.slice(1).reduce((sum, w) => sum + w, 0);
  const body: Docx.TableRow[] = [];

  for (const group of model.documentGroups) {
    // Baris kategori utama (bukan dokumen): tebal, berwarna, dijaga satu halaman dengan isinya.
    body.push(
      new d.TableRow({
        cantSplit: true,
        children: [
          cell(
            d,
            [para(d, [run(d, String(group.no), { bold: true, color: COLOR.primary })], {
              align: d.AlignmentType.CENTER,
              keepNext: true,
            })],
            { width: DOCUMENT_COLS[0], fill: COLOR.groupSoft },
          ),
          cell(
            d,
            [para(d, [run(d, group.title, { bold: true, color: COLOR.primary })], { keepNext: true })],
            { width: spanWidth, fill: COLOR.groupSoft, span: 4 },
          ),
        ],
      }),
    );

    if (group.rows.length === 0 && group.emptyNote) {
      body.push(
        new d.TableRow({
          cantSplit: true,
          children: [
            cell(d, [para(d, "")], { width: DOCUMENT_COLS[0] }),
            cell(
              d,
              [para(d, [run(d, group.emptyNote ?? "", { italics: true, color: COLOR.muted })])],
              { width: spanWidth, span: 4 },
            ),
          ],
        }),
      );
    }

    for (const row of group.rows) {
      const missing = row.tidakAda;
      const fill = missing ? COLOR.warningSoft : undefined;
      body.push(
        new d.TableRow({
          cantSplit: true,
          children: [
            cell(d, [para(d, row.no, { align: d.AlignmentType.CENTER })], {
              width: DOCUMENT_COLS[0],
              fill,
            }),
            cell(d, [para(d, [run(d, row.name, { bold: missing })])], {
              width: DOCUMENT_COLS[1],
              fill,
            }),
            cell(
              d,
              [para(d, row.ada ? [tick(d, COLOR.success)] : [], { align: d.AlignmentType.CENTER })],
              { width: DOCUMENT_COLS[2], fill },
            ),
            cell(
              d,
              [
                para(d, row.tidakAda ? [tick(d, COLOR.warning)] : [], {
                  align: d.AlignmentType.CENTER,
                }),
              ],
              { width: DOCUMENT_COLS[3], fill },
            ),
            cell(d, textParagraphs(d, row.notes), { width: DOCUMENT_COLS[4], fill }),
          ],
        }),
      );
    }
  }

  return table(d, DOCUMENT_COLS, [header, ...body]);
}

/* ------------------------------------------------------------------ */
/* 2. Critical Field Validation                                        */
/* ------------------------------------------------------------------ */

/**
 * Satu paragraf per baris teks. Teks dengan baris baru (mis. Underlying / Dasar Penerbitan yang
 * diketik multiline) dipecah menjadi beberapa paragraf: karakter newline di dalam satu run tidak
 * dirender Word. Baris kosong tetap menjadi paragraf kosong sehingga susunan asli terjaga, dan
 * teks panjang otomatis dibungkus sesuai lebar sel.
 */
function lineParagraphs(d: DocxModule, lines: DisplayLine[]): Docx.Paragraph[] {
  // Sel tabel Word wajib berisi minimal satu paragraf; sel tanpa isi diberi paragraf kosong.
  if (lines.length === 0) return [para(d, "")];
  return lines.flatMap((line) =>
    line.text.split(/\r?\n/).map((text) => {
      if (line.deviant) {
        return para(d, [run(d, text, { bold: true, underline: true, fill: COLOR.dangerCell })]);
      }
      if (line.note === "muted") {
        return para(d, [run(d, text, { size: 16, color: COLOR.muted })]);
      }
      if (line.note === "invalid") {
        return para(d, [run(d, text, { bold: true, color: COLOR.danger })]);
      }
      return para(d, text);
    }),
  );
}

function stateRuns(d: DocxModule, state: MatchState, label: string): Docx.TextRun[] {
  if (state === "SESUAI") {
    return [
      run(d, "✓ ", { bold: true, color: COLOR.success, font: SYMBOL_FONT }),
      run(d, label, { bold: true, color: COLOR.success }),
    ];
  }
  if (state === "TIDAK SESUAI") {
    return [
      run(d, "✕ ", { bold: true, color: COLOR.danger, font: SYMBOL_FONT }),
      run(d, label, { bold: true, color: COLOR.danger }),
    ];
  }
  return [run(d, label, { color: COLOR.muted })];
}

function criticalRow(d: DocxModule, row: CriticalRowModel): Docx.TableRow {
  // Baris pemilihan Kontra Garansi tidak memiliki status; statusnya ada pada subbaris item.
  const mismatch = row.state === "TIDAK SESUAI" && row.kind !== "kontra";
  const isItem = row.kind === "item";
  // Baris induk Kontra Garansi dan baris judul item ikut halaman yang sama dengan baris berikutnya.
  const keepWithNext = isItem || row.kind === "kontra";
  const rowFill = mismatch ? COLOR.dangerSoft : isItem ? COLOR.rowAlt : undefined;

  // Sumber: tiga sel terpisah, atau satu sel gabungan (Underlying bersama / ringkasan Kontra).
  const sourceCells: Docx.TableCell[] = row.sources
    ? row.sources.map((source, index) => {
        const deviates = source.lines.some((line) => line.deviant);
        return cell(d, lineParagraphs(d, source.lines), {
          width: CRITICAL_COLS[2 + index],
          fill: deviates ? COLOR.dangerCell : rowFill,
        });
      })
    : [
        cell(d, lineParagraphs(d, row.merged ?? []), {
          width:
            CRITICAL_COLS[2] +
            CRITICAL_COLS[3] +
            CRITICAL_COLS[4] +
            (row.mergedSpansResult ? CRITICAL_COLS[5] : 0),
          fill: rowFill,
          span: row.mergedSpansResult ? 4 : 3,
        }),
      ];

  const nameRuns = [run(d, row.name, { bold: row.kind !== "item-field" })];

  return new d.TableRow({
    // Baris dijaga utuh dalam satu halaman, kecuali isian bersama yang bisa sangat panjang
    // (Underlying / Dasar Penerbitan): baris itu boleh berlanjut ke halaman berikutnya.
    cantSplit: row.kind !== "shared",
    children: [
      cell(d, [para(d, row.no, { align: d.AlignmentType.CENTER, keepNext: keepWithNext })], {
        width: CRITICAL_COLS[0],
        fill: rowFill,
      }),
      cell(
        d,
        [
          para(d, nameRuns, {
            keepNext: keepWithNext,
            indentLeft: row.kind === "item-field" ? 160 : undefined,
          }),
        ],
        { width: CRITICAL_COLS[1], fill: rowFill },
      ),
      ...sourceCells,
      // Baris pemilihan Kontra Garansi: sel gabungan membentang sampai kolom Hasil Validasi.
      ...(row.mergedSpansResult ? [] : [cell(
        d,
        [
          para(d, stateRuns(d, row.state, row.stateLabel), { keepNext: keepWithNext }),
          // Baris belum lengkap: "Belum lengkap : {N} field belum terisi".
          ...(row.stateNote
            ? [para(d, [run(d, row.stateNote, { color: COLOR.muted, size: 17 })], { before: 20 })]
            : []),
          // Biaya: hasil per komponen (Provisi, Administrasi, dan field tambahan).
          ...(row.components ?? []).map((component) =>
            para(
              d,
              [
                run(d, componentResultText(component), {
                  bold: component.state === "TIDAK SESUAI",
                  color:
                    component.state === "SESUAI"
                      ? COLOR.success
                      : component.state === "TIDAK SESUAI"
                        ? COLOR.danger
                        : COLOR.muted,
                  size: 16,
                }),
              ],
              { before: 20 },
            ),
          ),
          // Biaya: informasi PKS dari Document Verification (informatif saja).
          ...(row.info ? pksInfoParagraphs(d, row.info) : []),
        ],
        { width: CRITICAL_COLS[5], fill: rowFill },
      )]),
    ],
  });
}

function renderCriticalTable(d: DocxModule, model: ChecklistDocumentModel): Docx.Table {
  const header = new d.TableRow({
    tableHeader: true,
    cantSplit: true,
    children: model.criticalHeaders.map((text, index) =>
      headCell(d, text, CRITICAL_COLS[index], index === 0 ? d.AlignmentType.CENTER : d.AlignmentType.LEFT),
    ),
  });
  return table(d, CRITICAL_COLS, [header, ...model.criticalRows.map((row) => criticalRow(d, row))]);
}

/* ------------------------------------------------------------------ */
/* Status & peringatan                                                 */
/* ------------------------------------------------------------------ */

function box(
  d: DocxModule,
  children: Docx.Paragraph[],
  tone: "success" | "danger" | "warning",
): Docx.Table {
  const palette = {
    success: { line: COLOR.success, fill: COLOR.successSoft },
    danger: { line: COLOR.danger, fill: COLOR.dangerSoft },
    warning: { line: COLOR.warning, fill: COLOR.warningSoft },
  }[tone];
  return table(d, [CONTENT_W], [
    new d.TableRow({
      cantSplit: true,
      children: [
        cell(d, children, {
          width: CONTENT_W,
          fill: palette.fill,
          borderColor: palette.line,
          borderSize: tone === "danger" ? 12 : 8,
        }),
      ],
    }),
  ]);
}

function renderValidationBlocks(d: DocxModule, model: ChecklistDocumentModel): (Docx.Paragraph | Docx.Table)[] {
  const v = model.validation;
  const out: (Docx.Paragraph | Docx.Table)[] = [];

  if (v.kind === "mismatch" || v.kind === "mismatch-incomplete") {
    const paragraphs: Docx.Paragraph[] = [
      para(d, [
        run(d, "⚠ ", { bold: true, color: COLOR.danger, font: SYMBOL_FONT }),
        run(d, v.title.toUpperCase(), { bold: true, color: COLOR.danger, size: 20 }),
      ]),
      para(d, [run(d, v.text, { bold: true, color: COLOR.danger })], { before: 40 }),
      para(d, [
        run(d, `Field terkait: ${v.mismatchLabels.join(", ")}.`, { bold: true, color: COLOR.danger }),
      ]),
    ];
    if (v.action) {
      paragraphs.push(
        para(d, [
          run(d, `${v.action} Sel yang menyimpang dari Underlying Document diberi blok merah dan dicetak tebal.`, {
            color: COLOR.danger,
            size: 16,
          }),
        ], { before: 40 }),
      );
    }
    for (const reason of v.reasons) {
      paragraphs.push(para(d, [run(d, reason, { color: COLOR.danger, size: 16 })], { bullet: true }));
    }
    out.push(box(d, paragraphs, "danger"), spacer(d, 80));
  } else if (v.kind === "all-match") {
    out.push(
      box(
        d,
        [
          para(d, [
            run(d, "✓ ", { bold: true, color: COLOR.success, font: SYMBOL_FONT }),
            run(d, v.text, { bold: true, color: COLOR.success }),
          ]),
        ],
        "success",
      ),
      spacer(d, 80),
    );
  }

  if (v.incomplete) {
    out.push(
      box(
        d,
        [
          para(d, [
            run(d, `${v.incomplete.headline}: `, { bold: true, color: COLOR.warning }),
            run(d, v.incomplete.text, { color: COLOR.warning }),
          ]),
        ],
        "warning",
      ),
      spacer(d, 80),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Opini ADK, 4. Opini SOK                                          */
/* ------------------------------------------------------------------ */

function renderOpinionBox(d: DocxModule, opinion: string): Docx.Table {
  const text = opinion.trim() ? opinion : "-";
  return table(d, [CONTENT_W], [
    new d.TableRow({
      // Opini yang panjang boleh mengalir ke halaman berikutnya.
      cantSplit: false,
      height: { value: 1500, rule: d.HeightRule.ATLEAST },
      children: [
        cell(d, textParagraphs(d, text, { size: 18 }), {
          width: CONTENT_W,
          borderColor: COLOR.text,
        }),
      ],
    }),
  ]);
}

/**
 * Baris tulisan tangan: satu baris tabel per garis, tinggi tetap 8,5 mm (480 twip).
 * Memakai baris tabel (bukan border paragraf) karena Word/LibreOffice menggabungkan
 * border paragraf berurutan sehingga hanya garis terakhir yang tampak.
 */
const SOK_LINE_HEIGHT = 480;

function renderSokBox(d: DocxModule, lineCount: number): Docx.Table {
  const solid = { style: d.BorderStyle.SINGLE, size: 4, color: COLOR.text };
  const dotted = { style: d.BorderStyle.DOTTED, size: 4, color: COLOR.line };
  const none = { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" };

  const rows = Array.from({ length: lineCount }, (_, index) => {
    const first = index === 0;
    const last = index === lineCount - 1;
    return new d.TableRow({
      cantSplit: true,
      height: { value: SOK_LINE_HEIGHT, rule: d.HeightRule.EXACT },
      children: [
        new d.TableCell({
          width: { size: CONTENT_W, type: d.WidthType.DXA },
          borders: {
            top: first ? solid : none,
            bottom: last ? solid : dotted,
            left: solid,
            right: solid,
          },
          margins: { top: 0, bottom: 0, left: 90, right: 90 },
          children: [
            new d.Paragraph({
              keepNext: !last,
              children: [new d.TextRun({ text: "" })],
              spacing: { before: 0, after: 0 },
            }),
          ],
        }),
      ],
    });
  });
  return table(d, [CONTENT_W], rows);
}

/* ------------------------------------------------------------------ */
/* Tanda tangan                                                        */
/* ------------------------------------------------------------------ */

/** "Label<tab>: nilai" dengan titik dua sejajar pada kolom tab. */
function labelValue(d: DocxModule, label: string, value: string, keepNext = false): Docx.Paragraph {
  return new d.Paragraph({
    keepNext,
    spacing: { before: 0, after: 0 },
    tabStops: [{ type: d.TabStopType.LEFT, position: 1400 }],
    children: [
      new d.TextRun({ children: [label, new d.Tab(), ": "] }),
      new d.TextRun({ text: value }),
    ],
  });
}

function signatureCells(
  d: DocxModule,
  sig: SignatureModel,
  width: number,
  step: "heading" | "role" | "name" | "date" | "sign",
): Docx.TableCell {
  switch (step) {
    case "heading":
      return cell(
        d,
        [para(d, [run(d, sig.heading, { bold: true, color: COLOR.white })], { align: d.AlignmentType.CENTER, keepNext: true })],
        { width, fill: COLOR.primary, borderColor: COLOR.primary },
      );
    case "role":
      return cell(
        d,
        [para(d, [run(d, sig.role, { bold: true })], { align: d.AlignmentType.CENTER, keepNext: true })],
        { width },
      );
    case "name":
      return cell(d, [labelValue(d, "Nama", sig.name, true)], { width });
    case "date":
      return cell(d, [labelValue(d, "Tanggal", sig.date, true)], { width });
    case "sign":
      return cell(d, [labelValue(d, "Tanda tangan", "")], { width });
  }
}

function renderSignatureTable(d: DocxModule, model: ChecklistDocumentModel): Docx.Table {
  const { adk, sok } = model.signatures;
  const steps = ["heading", "role", "name", "date", "sign"] as const;
  const rows = steps.map(
    (step) =>
      new d.TableRow({
        cantSplit: true,
        // Ruang tanda tangan basah cukup tinggi (sekitar 26 mm).
        height: step === "sign" ? { value: 1500, rule: d.HeightRule.ATLEAST } : undefined,
        children: [
          signatureCells(d, adk, SIGNATURE_COLS[0], step),
          signatureCells(d, sok, SIGNATURE_COLS[1], step),
        ],
      }),
  );
  return table(d, SIGNATURE_COLS, rows);
}

/* ------------------------------------------------------------------ */
/* Ekspor                                                              */
/* ------------------------------------------------------------------ */

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Hasil mentah (untuk pengujian / penyimpanan server-side). */
export async function buildChecklistDocxBytes(
  checklist: BankGuaranteeChecklist,
  options: DocumentModelOptions = {},
): Promise<ArrayBuffer> {
  const d = await import("docx");
  const doc = await buildChecklistDocx(checklist, options);
  return d.Packer.toArrayBuffer(doc);
}

/** Membuat dan mengunduh berkas Word di browser. */
export async function exportChecklistDocx(checklist: BankGuaranteeChecklist): Promise<string> {
  const d = await import("docx");
  const doc = await buildChecklistDocx(checklist);
  const blob = await d.Packer.toBlob(doc);
  const filename = `${buildFileBase(checklist.atasNama, checklist.completedAt ?? checklist.updatedAt)}.docx`;
  downloadBlob(new Blob([blob], { type: DOCX_MIME }), filename);
  return filename;
}
