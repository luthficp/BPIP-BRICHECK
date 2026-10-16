import type { jsPDF } from "jspdf";
import type { CellHookData, UserOptions } from "jspdf-autotable";

import { APP_NAME, APP_TAGLINE, LABEL_UNDERLYING } from "@/lib/checklist/config";
import { componentResultText, type DisplayLine } from "@/lib/checklist/display";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import {
  buildChecklistDocumentModel,
  type CriticalRowModel,
  type DocumentRowModel,
} from "./document-model";
import { buildFileBase, formatDate, formatTimestamp, shortId } from "./format";

/**
 * Export PDF (A4, portrait). Dibangun dengan jsPDF + autotable, bukan screenshot.
 * Struktur mengikuti spesifikasi bagian 25:
 * header, Document Verification, Critical Field Validation + Hasil Validasi,
 * warning/summary, Opini ADK, Opini SOK (kosong), Diperiksa Oleh (ADK),
 * Diketahui Oleh (SOK), tanggal, metadata sistem.
 *
 * Catatan: font bawaan PDF (Helvetica) tidak memuat simbol ✓/✕, jadi ikon
 * digambar sebagai garis vektor. Tanda pisah em dash pada nama aplikasi juga
 * digambar sebagai garis agar tidak bergantung pada pengodean font bawaan.
 */

type RGB = [number, number, number];

const COLORS: Record<string, RGB> = {
  primary: [0, 82, 156],
  white: [255, 255, 255],
  text: [17, 24, 39],
  muted: [100, 116, 139],
  border: [148, 163, 184],
  success: [22, 101, 52],
  successSoft: [220, 252, 231],
  danger: [185, 28, 28],
  dangerSoft: [254, 238, 238],
  dangerCell: [254, 202, 202],
  warning: [146, 64, 14],
  warningSoft: [254, 243, 199],
  groupSoft: [219, 234, 254],
  itemSoft: [241, 245, 249],
};

type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;

/** Lebar kolom Hasil Validasi (mm); dipakai untuk menghitung tinggi panel Informasi PKS. */
export const RESULT_COL_W = 41;
/** Tinggi satu baris teks sel (mm) pada font 8.5 pt dengan faktor tinggi baris autotable 1.15. */
export const CELL_LINE_MM = (8.5 * 1.15) / (72 / 25.4);
/** Baris pengisi (spasi tak terputus) yang menyediakan ruang bagi panel Informasi PKS di dalam sel. */
const PANEL_SPACER_LINE = "\u00A0";

/**
 * Panel "Informasi PKS" pada Hasil Validasi Biaya. Digambar sendiri (bukan teks sel) agar punya latar,
 * border, dan ikon yang berbeda dari status SESUAI / TIDAK SESUAI yang berwarna hijau / merah.
 */
export const PKS_PANEL = { margin: 1.2, pad: 1.6, lineH: 3.2, fontSize: 7.5, iconSlot: 4.2 };

type PksTone = "info" | "notice" | "warning" | "muted";
type PksInfoModel = NonNullable<CriticalRowModel["info"]>;
type PanelLine = { text: string; bold: boolean; color: RGB; indent: number };
type PksPanelLayout = { lines: PanelLine[]; height: number; tone: PksTone };

const PKS_PALETTE: Record<PksTone, { fill: RGB; border: RGB; label: RGB; message: RGB }> = {
  // PKS ada: biru muda informatif (bukan hijau SESUAI).
  info: { fill: [232, 241, 251], border: [96, 150, 204], label: COLORS.primary, message: COLORS.text },
  // PKS tidak ada: amber lembut sebagai penekanan informasi (bukan merah TIDAK SESUAI).
  notice: { fill: COLORS.warningSoft, border: [217, 119, 6], label: COLORS.warning, message: COLORS.warning },
  warning: { fill: COLORS.warningSoft, border: [217, 119, 6], label: COLORS.warning, message: COLORS.warning },
  muted: { fill: COLORS.itemSoft, border: COLORS.border, label: COLORS.muted, message: COLORS.muted },
};

/** Membungkus teks per kata dan memotong kata yang lebih lebar dari kolom (mis. Nomor PKS panjang tanpa spasi). */
export function wrapPanelText(doc: jsPDF, text: string, width: number, bold: boolean): string[] {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(PKS_PANEL.fontSize);
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (doc.getTextWidth(candidate) <= width) {
      line = candidate;
      continue;
    }
    if (line) out.push(line);
    line = "";
    if (doc.getTextWidth(word) <= width) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      if (chunk && doc.getTextWidth(chunk + char) > width) {
        out.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    line = chunk;
  }
  if (line) out.push(line);
  return out.length > 0 ? out : [""];
}

export function layoutPksPanel(doc: jsPDF, info: PksInfoModel, cellWidth: number): PksPanelLayout {
  const palette = PKS_PALETTE[info.tone];
  const inner = cellWidth - 2 * PKS_PANEL.margin - 2 * PKS_PANEL.pad;
  const messageBold = info.tone === "warning";
  const lines: PanelLine[] = [];
  for (const text of wrapPanelText(doc, info.label, inner - PKS_PANEL.iconSlot, true)) {
    lines.push({ text, bold: true, color: palette.label, indent: PKS_PANEL.iconSlot });
  }
  for (const text of wrapPanelText(doc, info.lead, inner, messageBold)) {
    lines.push({ text, bold: messageBold, color: palette.message, indent: 0 });
  }
  if (info.number) {
    // Nomor PKS pada baris sendiri, tebal dan berwarna biru agar mudah ditemukan.
    for (const text of wrapPanelText(doc, info.number, inner, true)) {
      lines.push({ text, bold: true, color: COLORS.primary, indent: 0 });
    }
  }
  return { lines, height: 2 * PKS_PANEL.pad + lines.length * PKS_PANEL.lineH + 0.4, tone: info.tone };
}

/** Jumlah baris pengisi yang dibutuhkan sel agar panel muat di bawah teks hasil. */
export function panelSpacerLines(panel: PksPanelLayout): number {
  return Math.ceil((panel.height + PKS_PANEL.margin) / CELL_LINE_MM);
}

function drawPksPanel(doc: jsPDF, panel: PksPanelLayout, cell: { x: number; y: number; width: number; height: number }) {
  const palette = PKS_PALETTE[panel.tone];
  const x = cell.x + PKS_PANEL.margin;
  const w = cell.width - 2 * PKS_PANEL.margin;
  const y = cell.y + cell.height - 1 - panel.height;
  doc.setFillColor(...palette.fill);
  doc.setDrawColor(...palette.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, panel.height, 1, 1, "FD");

  // Ikon: dokumen (PKS ada), segitiga (peringatan), lingkaran "i" (tidak ada / belum dipilih).
  const ix = x + PKS_PANEL.pad;
  const iy = y + PKS_PANEL.pad;
  const labelBase = iy + PKS_PANEL.lineH * 0.72;
  doc.setDrawColor(...palette.label);
  doc.setLineWidth(0.3);
  if (panel.tone === "info") {
    doc.rect(ix, iy + 0.1, 2.2, 2.8, "S");
    doc.line(ix + 0.5, iy + 1.0, ix + 1.7, iy + 1.0);
    doc.line(ix + 0.5, iy + 1.8, ix + 1.7, iy + 1.8);
  } else if (panel.tone === "warning") {
    doc.triangle(ix + 1.2, iy + 0.1, ix, iy + 2.7, ix + 2.4, iy + 2.7, "S");
    doc.line(ix + 1.2, iy + 1.0, ix + 1.2, iy + 1.8);
  } else {
    doc.circle(ix + 1.2, iy + 1.5, 1.3, "S");
    doc.line(ix + 1.2, iy + 1.1, ix + 1.2, iy + 2.1);
    doc.line(ix + 1.2, iy + 0.7, ix + 1.2, iy + 0.8);
  }

  panel.lines.forEach((line, index) => {
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setFontSize(PKS_PANEL.fontSize);
    doc.setTextColor(...line.color);
    const baseline = index === 0 ? labelBase : labelBase + PKS_PANEL.lineH * index + 0.4;
    doc.text(line.text, x + PKS_PANEL.pad + line.indent, baseline);
  });
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const BOTTOM_RESERVED = 18; // ruang footer
const CONTENT_W = PAGE_W - MARGIN * 2;

export type PdfOptions = {
  /** Waktu dokumen dihasilkan (default: sekarang). */
  generatedAt?: Date;
  /** IANA time zone untuk format waktu (default: perangkat). */
  timeZone?: string;
};

export async function buildChecklistPdf(
  checklist: BankGuaranteeChecklist,
  options: PdfOptions = {},
): Promise<jsPDF> {
  const { jsPDF: JsPDF } = await import("jspdf");
  const autoTableModule = (await import("jspdf-autotable")) as unknown as {
    default?: AutoTableFn;
    autoTable?: AutoTableFn;
  };
  const autoTable = autoTableModule.default ?? autoTableModule.autoTable;
  if (!autoTable) throw new Error("jspdf-autotable tidak dapat dimuat.");

  const generatedAt = options.generatedAt ?? new Date();
  const tzOpt = { timeZone: options.timeZone };
  const fmtTs = (value: string | Date) => formatTimestamp(value, tzOpt);

  // Isi dokumen berasal dari model yang sama dengan Word, Cetak, dan Pratinjau.
  const model = buildChecklistDocumentModel(checklist, { generatedAt, timeZone: options.timeZone });

  const doc = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({
    title: `${APP_NAME} - Checklist Verifikasi & Validasi Bank Garansi - ${checklist.atasNama || checklist.taskName}`,
    subject: `${APP_NAME} - ${APP_TAGLINE}`,
    author: checklist.adkName,
  });

  let y = MARGIN;

  const ensureSpace = (height: number) => {
    if (y + height > PAGE_H - BOTTOM_RESERVED) {
      doc.addPage();
      y = MARGIN;
    }
  };

  /** Menjalankan autotable dan mengembalikan posisi Y setelah tabel. */
  const runTable = (opts: UserOptions): number => {
    let tracked: number | undefined;
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: BOTTOM_RESERVED },
      tableWidth: CONTENT_W,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 1.8,
        textColor: COLORS.text,
        lineColor: COLORS.border,
        lineWidth: 0.2,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: "bold",
        lineColor: COLORS.primary,
      },
      rowPageBreak: "avoid",
      ...opts,
      didDrawPage: (data) => {
        tracked = data.cursor?.y ?? tracked;
        opts.didDrawPage?.(data);
      },
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
    return last?.finalY ?? tracked ?? y;
  };

  const sectionTitle = (title: string, minFollowingHeight = 30) => {
    ensureSpace(minFollowingHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.primary);
    doc.text(title.toUpperCase(), MARGIN, y + 4);
    y += 6;
  };

  /* ---------------------------------------------------------------- */
  /* Header                                                            */
  /* ---------------------------------------------------------------- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text("BANK RAKYAT INDONESIA", MARGIN, y + 2.5, { charSpace: 0.5 });
  doc.text(`STATUS: ${checklist.status.toUpperCase()}`, PAGE_W - MARGIN, y + 2.5, {
    align: "right",
  });
  drawBrandLine(doc, MARGIN + 52, y + 2.5);

  doc.setFontSize(13.5);
  doc.setTextColor(...COLORS.primary);
  doc.text("CHECKLIST VERIFIKASI & VALIDASI DATA BANK GARANSI", MARGIN, y + 9.5);

  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, y + 12.5, PAGE_W - MARGIN, y + 12.5);
  y += 16.5;

  /* Informasi pengajuan */
  y =
    runTable({
      body: model.identity.map((row) => [
        row[0].label,
        row[0].value,
        row[1].label,
        row[1].value,
      ]),
      columnStyles: {
        0: { cellWidth: 28, fontStyle: "bold", fillColor: COLORS.primary, textColor: COLORS.white },
        1: { cellWidth: 63 },
        2: { cellWidth: 28, fontStyle: "bold", fillColor: COLORS.primary, textColor: COLORS.white },
        3: { cellWidth: 63 },
      },
    }) + 6;

  /* ---------------------------------------------------------------- */
  /* 1. Document Verification (berkategori)                            */
  /* ---------------------------------------------------------------- */
  type DocRowInfo =
    | { kind: "group" }
    | { kind: "empty" }
    | { kind: "doc"; doc: DocumentRowModel };
  const docInfo: DocRowInfo[] = [];
  const docBody: unknown[][] = [];
  for (const group of model.documentGroups) {
    docInfo.push({ kind: "group" });
    docBody.push([String(group.no), { content: group.title, colSpan: 4 }]);
    if (group.rows.length === 0 && group.emptyNote) {
      docInfo.push({ kind: "empty" });
      docBody.push(["", { content: group.emptyNote ?? "", colSpan: 4 }]);
    }
    for (const row of group.rows) {
      docInfo.push({ kind: "doc", doc: row });
      docBody.push([row.no, row.name, "", "", row.notes]);
    }
  }

  sectionTitle(model.documentsHeading, 40);
  y =
    runTable({
      head: [["No", "Jenis Dokumen", "Ada", "Tidak Ada", "Keterangan"]],
      body: docBody as UserOptions["body"],
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 58 },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 74 },
      },
      didParseCell: (data: CellHookData) => {
        if (data.section === "head" && [0, 2, 3].includes(data.column.index)) {
          data.cell.styles.halign = "center";
        }
        if (data.section !== "body") return;
        const info = docInfo[data.row.index];
        if (!info) return;
        if (info.kind === "group") {
          data.cell.styles.fillColor = COLORS.groupSoft;
          data.cell.styles.textColor = COLORS.primary;
          data.cell.styles.fontStyle = "bold";
          return;
        }
        if (info.kind === "empty") {
          data.cell.styles.fontStyle = "italic";
          data.cell.styles.textColor = COLORS.muted;
          return;
        }
        if (info.doc.tidakAda) {
          data.cell.styles.fillColor = COLORS.warningSoft;
          if (data.column.index === 1) data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawCell: (data: CellHookData) => {
        if (data.section !== "body") return;
        const info = docInfo[data.row.index];
        if (info?.kind !== "doc") return;
        const chosen =
          (data.column.index === 2 && info.doc.ada) ||
          (data.column.index === 3 && info.doc.tidakAda);
        if (chosen) {
          drawCheck(
            doc,
            data.cell.x + data.cell.width / 2,
            data.cell.y + data.cell.height / 2,
            info.doc.ada ? COLORS.success : COLORS.warning,
          );
        }
      },
    }) + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  const docNoteLines = doc.splitTextToSize(model.documentsNote, CONTENT_W) as string[];
  ensureSpace(docNoteLines.length * 3.2 + 2);
  doc.text(docNoteLines, MARGIN, y + 2.5);
  y += docNoteLines.length * 3.2 + 5;

  /* ---------------------------------------------------------------- */
  /* 2. Critical Field Validation + Hasil Validasi                     */
  /* ---------------------------------------------------------------- */
  const rows = model.criticalRows;
  const linesText = (lines: DisplayLine[]) => lines.map((line) => line.text).join("\n");
  const resultText = (row: CriticalRowModel) =>
    [
      row.stateLabel,
      row.stateNote,
      ...(row.components ?? []).map((component) => componentResultText(component)),
    ]
      .filter(Boolean)
      .join("\n");

  // Informasi PKS: tata letak dihitung sekali per baris; sel hasil diberi baris pengisi agar panel
  // yang digambar di bagian bawah sel tidak menimpa teks hasil validasi.
  const pksPanels = rows.map((row) => (row.info ? layoutPksPanel(doc, row.info, RESULT_COL_W) : null));

  const criticalBody = rows.map((row, rowIndex) => {
    const no = { content: row.no, styles: { halign: "center" as const } };
    const name = { content: row.name };
    const panel = pksPanels[rowIndex];
    const spacer = panel ? Array.from({ length: panelSpacerLines(panel) }, () => PANEL_SPACER_LINE) : [];
    const result = { content: [resultText(row), ...spacer].join("\n") };
    if (row.sources) {
      return [no, name, ...row.sources.map((source) => ({ content: linesText(source.lines) })), result];
    }
    // Baris pemilihan Kontra Garansi: sel gabungan membentang sampai kolom Hasil Validasi.
    if (row.mergedSpansResult) {
      return [no, name, { content: linesText(row.merged ?? []), colSpan: 4 }];
    }
    return [no, name, { content: linesText(row.merged ?? []), colSpan: 3 }, result];
  });

  sectionTitle(model.criticalHeading, 50);
  y =
    runTable({
      head: [model.criticalHeaders],
      body: criticalBody as UserOptions["body"],
      columnStyles: {
        0: { cellWidth: 11, halign: "center" },
        1: { cellWidth: 25, fontStyle: "bold" },
        2: { cellWidth: 35 },
        3: { cellWidth: 35 },
        4: { cellWidth: 35 },
        5: { cellWidth: RESULT_COL_W },
      },
      didParseCell: (data: CellHookData) => {
        if (data.section === "head") {
          if (data.column.index === 0) data.cell.styles.halign = "center";
          return;
        }
        if (data.section !== "body") return;
        const info = rows[data.row.index];
        if (!info) return;
        const resultColumn = data.column.index === data.table.columns.length - 1;

        if (info.kind === "item") {
          data.cell.styles.fillColor = COLORS.itemSoft;
          data.cell.styles.fontStyle = "bold";
        }
        if (info.kind === "item-field" && data.column.index === 1) {
          data.cell.styles.cellPadding = { top: 1.8, right: 1.8, bottom: 1.8, left: 5 };
          data.cell.styles.fontStyle = "normal";
        }
        if (info.state === "TIDAK SESUAI" && info.kind !== "kontra") {
          data.cell.styles.fillColor = COLORS.dangerSoft;
        }
        // Sel sumber yang menyimpang dari Underlying Document diberi blok merah + huruf tebal.
        if (info.sources && data.column.index >= 2 && !resultColumn) {
          const source = info.sources[data.column.index - 2];
          if (source?.lines.some((line) => line.deviant)) {
            data.cell.styles.fillColor = COLORS.dangerCell;
            data.cell.styles.fontStyle = "bold";
          }
        }

        if (resultColumn) {
          data.cell.styles.fontStyle = info.state === "BELUM LENGKAP" ? "normal" : "bold";
          data.cell.styles.cellPadding = { top: 1.8, right: 1, bottom: 1.8, left: 7 };
          data.cell.styles.textColor =
            info.state === "SESUAI"
              ? COLORS.success
              : info.state === "TIDAK SESUAI"
                ? COLORS.danger
                : COLORS.muted;
        }
      },
      didDrawCell: (data: CellHookData) => {
        if (data.section !== "body" || data.column.index !== data.table.columns.length - 1) return;
        const info = rows[data.row.index];
        if (!info) return;
        const cx = data.cell.x + 3.8;
        const cy = data.cell.y + 1.8 + 1.5;
        if (info.state === "SESUAI") drawCheck(doc, cx, cy, COLORS.success);
        else if (info.state === "TIDAK SESUAI") drawCross(doc, cx, cy, COLORS.danger);
        const panel = pksPanels[data.row.index];
        if (panel) drawPksPanel(doc, panel, data.cell);
      },
    }) + 4;

  /* Summary / warning - teks status sama dengan UI, Cetak, dan Word */
  const validation = model.validation;
  if (validation.kind === "mismatch" || validation.kind === "mismatch-incomplete") {
    const detail = [
      ...(doc.splitTextToSize(validation.text, CONTENT_W - 16) as string[]),
      ...(doc.splitTextToSize(
        `Field terkait: ${validation.mismatchLabels.join(", ")}.`,
        CONTENT_W - 16,
      ) as string[]),
    ];
    const note = doc.splitTextToSize(
      `${validation.action} Sel yang menyimpang dari ${LABEL_UNDERLYING} diberi blok merah dan dicetak tebal.`,
      CONTENT_W - 16,
    ) as string[];
    // Rincian komponen/item yang berbeda, mis. "- Biaya: Provisi: Putusan Bank Garansi berbeda dengan Underlying Document".
    const reasonLines = validation.reasons.map((reason) => `- ${reason}`);
    const reasons = doc.splitTextToSize(reasonLines.join("\n"), CONTENT_W - 16) as string[];
    const boxH = 6 + detail.length * 4 + note.length * 3.3 + reasons.length * 3.3 + 3;
    ensureSpace(boxH + 2);

    doc.setFillColor(...COLORS.dangerSoft);
    doc.setDrawColor(...COLORS.danger);
    doc.setLineWidth(0.6);
    doc.rect(MARGIN, y, CONTENT_W, boxH, "FD");
    drawWarningTriangle(doc, MARGIN + 6, y + 6.2, COLORS.danger);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.danger);
    doc.text(validation.title.toUpperCase(), MARGIN + 13, y + 5.2);
    doc.text(detail, MARGIN + 13, y + 9.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const noteY = y + 9.4 + detail.length * 4 + 0.4;
    doc.text(note, MARGIN + 13, noteY);
    if (reasons.length > 0) doc.text(reasons, MARGIN + 13, noteY + note.length * 3.3 + 0.6);
    y += boxH + 6;
  } else if (validation.kind === "all-match") {
    ensureSpace(12);
    doc.setFillColor(...COLORS.successSoft);
    doc.setDrawColor(...COLORS.success);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, y, CONTENT_W, 8, "FD");
    drawCheck(doc, MARGIN + 6, y + 4, COLORS.success);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.success);
    doc.text(validation.text, MARGIN + 12, y + 5.2);
    y += 14;
  } else {
    y += 2;
  }

  /* Indikator "belum lengkap": terpisah dari ketidaksesuaian, tidak pernah dianggap sesuai. */
  if (validation.incomplete) {
    const text = doc.splitTextToSize(
      `Belum lengkap (${validation.incomplete.headline.replace(/ belum lengkap$/, "")}): ${validation.incomplete.text}`,
      CONTENT_W - 16,
    ) as string[];
    const boxH = 4 + text.length * 3.8;
    ensureSpace(boxH + 2);
    doc.setFillColor(...COLORS.warningSoft);
    doc.setDrawColor(...COLORS.warning);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, y, CONTENT_W, boxH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.warning);
    doc.text(text, MARGIN + 4, y + 4.8);
    y += boxH + 6;
  }

  /* ---------------------------------------------------------------- */
  /* 3. Opini ADK                                                       */
  /* ---------------------------------------------------------------- */
  sectionTitle("3. Opini ADK", 40);
  y =
    runTable({
      body: [[checklist.opiniAdk.trim() || "-"]],
      columnStyles: { 0: { cellWidth: CONTENT_W } },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 3,
        textColor: COLORS.text,
        lineColor: COLORS.text,
        lineWidth: 0.3,
        minCellHeight: 26,
        overflow: "linebreak",
        valign: "top",
      },
      // Opini panjang boleh mengalir ke halaman berikutnya.
      rowPageBreak: "auto",
    }) + 6;

  /* ---------------------------------------------------------------- */
  /* 4. Opini SOK - ruang kosong untuk tulisan tangan                  */
  /* ---------------------------------------------------------------- */
  const sokHeight = 42;
  sectionTitle("4. Opini SOK", sokHeight + 12);
  y =
    runTable({
      body: [[""]],
      columnStyles: { 0: { cellWidth: CONTENT_W, minCellHeight: sokHeight } },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 3,
        lineColor: COLORS.text,
        lineWidth: 0.3,
        minCellHeight: sokHeight,
      },
      didDrawCell: (data: CellHookData) => {
        if (data.section !== "body") return;
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.15);
        doc.setLineDashPattern([0.6, 0.9], 0);
        for (let line = 1; line <= 5; line++) {
          const ly = data.cell.y + line * 7;
          if (ly < data.cell.y + data.cell.height - 1) {
            doc.line(data.cell.x + 2.5, ly, data.cell.x + data.cell.width - 2.5, ly);
          }
        }
        doc.setLineDashPattern([], 0);
      },
    }) + 7;

  /* ---------------------------------------------------------------- */
  /* Tanda tangan                                                       */
  /* ---------------------------------------------------------------- */
  ensureSpace(62);
  y =
    runTable({
      head: [["Diperiksa Oleh", "Diketahui Oleh"]],
      body: [
        ["Administrasi Operasional Kredit (ADK)", "Supervisor Operasional Kredit (SOK)"],
        [`Nama      : ${checklist.adkName}`, "Nama      :"],
        [
          `Tanggal   : ${checklist.completedAt ? formatDate(checklist.completedAt, tzOpt) : ""}`,
          "Tanggal   :",
        ],
        ["Tanda tangan :", "Tanda tangan :"],
      ],
      columnStyles: {
        0: { cellWidth: CONTENT_W / 2 },
        1: { cellWidth: CONTENT_W / 2 },
      },
      didParseCell: (data: CellHookData) => {
        if (data.section === "head") data.cell.styles.halign = "center";
        if (data.section !== "body") return;
        if (data.row.index === 0) {
          data.cell.styles.halign = "center";
          data.cell.styles.fontStyle = "bold";
        }
        if (data.row.index === 3) data.cell.styles.minCellHeight = 28;
      },
    }) + 4;

  /* ---------------------------------------------------------------- */
  /* Footer: metadata sistem + nomor halaman di setiap halaman          */
  /* ---------------------------------------------------------------- */
  const totalPages = doc.getNumberOfPages();
  const line1 = [
    `ID ${shortId(checklist.id)}`,
    `Status ${checklist.status}`,
    `Dibuat ${fmtTs(checklist.createdAt)}`,
    `Diperbarui ${fmtTs(checklist.updatedAt)}`,
  ].join("  |  ");
  const line2 = [
    checklist.completedAt ? `Selesai ${fmtTs(checklist.completedAt)}` : null,
    `Dokumen dihasilkan sistem ${fmtTs(generatedAt)}`,
  ]
    .filter(Boolean)
    .join("  |  ");

  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...COLORS.muted);
    doc.text(line1, MARGIN, PAGE_H - 9.5);
    doc.text(line2, MARGIN, PAGE_H - 6.3);
    doc.text(`Halaman ${page} dari ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6.3, {
      align: "right",
    });
  }

  return doc;
}

/** Hasil mentah (untuk pengujian / penyimpanan server-side). */
export async function buildChecklistPdfBytes(
  checklist: BankGuaranteeChecklist,
  options: PdfOptions = {},
): Promise<ArrayBuffer> {
  const doc = await buildChecklistPdf(checklist, options);
  return doc.output("arraybuffer");
}

/** Membuat dan mengunduh PDF di browser. */
export async function exportChecklistPdf(checklist: BankGuaranteeChecklist): Promise<string> {
  const doc = await buildChecklistPdf(checklist);
  const filename = `${buildFileBase(checklist.atasNama, checklist.completedAt ?? checklist.updatedAt)}.pdf`;
  doc.save(filename);
  return filename;
}

/* ------------------------------------------------------------------ */
/* Ikon vektor                                                         */
/* ------------------------------------------------------------------ */

/** "BRICHECK — BRI Checklist & Validation" dengan em dash digambar sebagai garis. */
function drawBrandLine(doc: jsPDF, x: number, baselineY: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.primary);
  doc.text(APP_NAME, x, baselineY);
  let cursor = x + doc.getTextWidth(APP_NAME) + 1.6;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.3);
  doc.line(cursor, baselineY - 0.9, cursor + 2.8, baselineY - 0.9);
  cursor += 4.4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.text(APP_TAGLINE, cursor, baselineY);
}

function drawCheck(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.55);
  doc.line(cx - 1.6, cy + 0.1, cx - 0.5, cy + 1.3);
  doc.line(cx - 0.5, cy + 1.3, cx + 1.8, cy - 1.5);
}

function drawCross(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.55);
  doc.line(cx - 1.4, cy - 1.4, cx + 1.4, cy + 1.4);
  doc.line(cx - 1.4, cy + 1.4, cx + 1.4, cy - 1.4);
}

function drawWarningTriangle(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.5);
  doc.triangle(cx, cy - 3.2, cx - 3.4, cy + 2.6, cx + 3.4, cy + 2.6, "S");
  doc.setLineWidth(0.6);
  doc.line(cx, cy - 1.2, cx, cy + 0.9);
  doc.line(cx, cy + 1.7, cx, cy + 1.8);
}
