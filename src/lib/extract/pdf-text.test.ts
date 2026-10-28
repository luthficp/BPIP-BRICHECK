import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { itemsToLines, looksLikePdf, MAX_PDF_BYTES, PdfReadError, readPdfText } from "./pdf-text";

const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });

describe("itemsToLines", () => {
  it("menggabungkan item sebaris, mengurutkan dari kiri ke kanan, dan atas ke bawah", () => {
    const lines = itemsToLines([
      item("Rp. 2.000.000,-", 200, 700),
      item("Administrasi", 50, 700),
      item("Jaminan Pelaksanaan", 200, 720),
      item("Jenis Bank Garansi", 50, 720),
    ]);
    assert.deepEqual(lines, ["Jenis Bank Garansi Jaminan Pelaksanaan", "Administrasi Rp. 2.000.000,-"]);
  });
  it("item rapat tidak diberi spasi tambahan, item kosong diabaikan", () => {
    assert.deepEqual(itemsToLines([item("Prov", 10, 5, 20), item("isi", 30, 5, 15), item("", 60, 5)]), ["Provisi"]);
  });
  it("koordinat y berbeda sangat tipis dianggap satu baris", () => {
    assert.deepEqual(itemsToLines([item("A", 10, 100), item("B", 40, 101.5)]), ["A B"]);
  });
});

describe("looksLikePdf / readPdfText: validasi berkas", () => {
  it("mengenali header PDF", () => {
    assert.equal(looksLikePdf(new TextEncoder().encode("%PDF-1.7\n...")), true);
    assert.equal(looksLikePdf(new TextEncoder().encode("\n\n  %PDF-1.4")), true);
    assert.equal(looksLikePdf(new TextEncoder().encode("<html>bukan pdf</html>")), false);
  });
  it("menolak berkas berekstensi .pdf yang isinya bukan PDF", async () => {
    const fake = new File(["ini hanya teks biasa"], "palsu.pdf", { type: "application/pdf" });
    await assert.rejects(readPdfText(fake), (e: unknown) => e instanceof PdfReadError && /bukan PDF/.test(e.message));
  });
  it("menolak ekstensi/tipe selain PDF, berkas kosong, dan berkas terlalu besar", async () => {
    await assert.rejects(readPdfText(new File(["x"], "data.xlsx")), /format PDF/);
    await assert.rejects(readPdfText(new File([], "kosong.pdf", { type: "application/pdf" })), /kosong/);
    const big = new File([new Uint8Array(MAX_PDF_BYTES + 1)], "besar.pdf", { type: "application/pdf" });
    await assert.rejects(readPdfText(big), /Ukuran berkas/);
  });
});
