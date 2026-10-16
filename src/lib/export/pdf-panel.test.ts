import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { jsPDF } from "jspdf";

import {
  CELL_LINE_MM,
  PKS_PANEL,
  RESULT_COL_W,
  layoutPksPanel,
  panelSpacerLines,
  wrapPanelText,
} from "./pdf";
import { PKS_ABSENT_TEXT, PKS_PRESENT_LEAD } from "@/lib/checklist/pks";
import { makeSampleChecklist, SAMPLE_PKS_NUMBER } from "@/lib/checklist/test-utils";
import { setDocumentNotes, setDocumentStatus } from "@/lib/checklist/mutations";
import { buildChecklistDocumentModel } from "./document-model";

/**
 * Pengukur teks sederhana pengganti jsPDF (pustaka PDF tidak dimuat pada tes unit): lebar sebanding
 * jumlah karakter, huruf tebal sedikit lebih lebar. Cukup untuk menguji logika pembungkusan dan tinggi panel.
 */
function fakeDoc() {
  let bold = false;
  let size = 7.5;
  return {
    setFont: (_name: string, style: string) => {
      bold = style === "bold";
    },
    setFontSize: (value: number) => {
      size = value;
    },
    getTextWidth: (text: string) => text.length * size * 0.3528 * (bold ? 0.58 : 0.52),
  } as unknown as jsPDF;
}

function infoFor(mutate?: (c: ReturnType<typeof makeSampleChecklist>) => ReturnType<typeof makeSampleChecklist>) {
  const base = makeSampleChecklist("clean");
  const c = mutate ? mutate(base) : base;
  const model = buildChecklistDocumentModel(c, { generatedAt: new Date("2026-10-15T03:00:00Z"), timeZone: "Asia/Jakarta" });
  const row = model.criticalRows.find((r) => r.info);
  assert.ok(row?.info, "baris Biaya memuat info PKS");
  return row.info;
}

const pksRow = (c: ReturnType<typeof makeSampleChecklist>) =>
  c.documentVerification.find((d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama")!;

describe("PDF: panel Informasi PKS (tata letak)", () => {
  it("PKS ada: label, kalimat pengantar, dan nomor pada baris tersendiri (tebal)", () => {
    const layout = layoutPksPanel(fakeDoc(), infoFor(), RESULT_COL_W);
    assert.equal(layout.tone, "info");
    const texts = layout.lines.map((l) => l.text);
    assert.equal(texts[0], "Informasi PKS");
    assert.ok(texts.join(" ").includes(PKS_PRESENT_LEAD));
    const numberLine = layout.lines.find((l) => l.text === SAMPLE_PKS_NUMBER);
    assert.ok(numberLine, "nomor PKS tampil utuh");
    assert.equal(numberLine.bold, true);
  });

  it("PKS tidak ada: pesan persis dari kalimat yang ditetapkan (dirangkai dari baris panel)", () => {
    const layout = layoutPksPanel(
      fakeDoc(),
      infoFor((c) => setDocumentNotes(setDocumentStatus(c, pksRow(c).id, "Tidak Ada"), pksRow(c).id, "")),
      RESULT_COL_W,
    );
    assert.equal(layout.tone, "notice");
    assert.equal(layout.lines.slice(1).map((l) => l.text).join(" "), PKS_ABSENT_TEXT);
  });

  it("PKS ada tanpa nomor: peringatan ringkas, tanpa nomor", () => {
    const layout = layoutPksPanel(fakeDoc(), infoFor((c) => setDocumentNotes(c, pksRow(c).id, "  ")), RESULT_COL_W);
    assert.equal(layout.tone, "warning");
    assert.ok(layout.lines.some((l) => /Nomor PKS belum diisi/.test(l.text)));
    assert.ok(layout.lines.every((l) => l.text !== SAMPLE_PKS_NUMBER));
  });

  it("nomor sangat panjang tanpa spasi dipatahkan agar tidak melewati lebar panel", () => {
    const long = "PKS/045/BRI-BFLP/2026/ADDENDUM-KEDUA-TANGGAL-15-OKTOBER-2026-UNTUK-PERUBAHAN-LIMIT";
    const doc = fakeDoc();
    const layout = layoutPksPanel(doc, infoFor((c) => setDocumentNotes(c, pksRow(c).id, long)), RESULT_COL_W);
    const inner = RESULT_COL_W - 2 * PKS_PANEL.margin - 2 * PKS_PANEL.pad;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PKS_PANEL.fontSize);
    for (const line of layout.lines) assert.ok(doc.getTextWidth(line.text) <= inner + 0.01, `"${line.text}" muat`);
    assert.equal(layout.lines.slice(1).filter((l) => l.bold && l.color[2] === 156).map((l) => l.text).join(""), long);
  });

  it("baris pengisi sel cukup untuk tinggi panel (panel tidak menimpa teks hasil)", () => {
    for (const mutate of [undefined, (c: ReturnType<typeof makeSampleChecklist>) => setDocumentNotes(setDocumentStatus(c, pksRow(c).id, "Tidak Ada"), pksRow(c).id, "")]) {
      const layout = layoutPksPanel(fakeDoc(), infoFor(mutate), RESULT_COL_W);
      const spacer = panelSpacerLines(layout);
      assert.ok(spacer * CELL_LINE_MM >= layout.height + PKS_PANEL.margin - 0.001);
      assert.ok(spacer * CELL_LINE_MM < layout.height + PKS_PANEL.margin + CELL_LINE_MM, "tidak berlebih lebih dari satu baris");
    }
  });

  it("wrapPanelText: teks kosong menghasilkan satu baris kosong; spasi berlebih dirapikan", () => {
    assert.deepEqual(wrapPanelText(fakeDoc(), "", 30, false), [""]);
    assert.deepEqual(wrapPanelText(fakeDoc(), "  PKS   ada  ", 80, false), ["PKS ada"]);
  });
});
