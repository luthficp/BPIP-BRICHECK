import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

import { setCriticalValue, setDocumentNotes, setDocumentStatus, setSharedValue } from "../checklist/mutations";
import { makeSampleChecklist, SAMPLE_PKS_NUMBER } from "../checklist/test-utils";
import { recalculateMatches } from "../validation/three-way-match";
import { buildChecklistDocxBytes } from "./docx";

/** Pembaca ZIP minimal (cukup untuk membaca bagian XML dari berkas .docx). */
function readZip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0, "ZIP valid (EOCD ditemukan)");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** Seluruh teks (w:t) pada XML, digabung per paragraf. */
function textOf(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

const options = { timeZone: "Asia/Jakarta", generatedAt: new Date("2026-10-09T03:00:00Z") };

async function build(mode: "clean" | "mismatch") {
  const bytes = await buildChecklistDocxBytes(makeSampleChecklist(mode), options);
  const files = readZip(Buffer.from(bytes));
  return {
    files,
    body: files.get("word/document.xml") ?? "",
    footer: [...files.entries()].filter(([name]) => /^word\/footer\d*\.xml$/.test(name)).map(([, xml]) => xml).join(""),
    header: [...files.entries()].filter(([name]) => /^word\/header\d*\.xml$/.test(name)).map(([, xml]) => xml).join(""),
  };
}

describe("Export Word (.docx sungguhan)", () => {
  it("menghasilkan paket OOXML yang valid (ZIP + bagian wajib)", async () => {
    const { files } = await build("mismatch");
    for (const name of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"]) {
      assert.ok(files.has(name), `${name} ada`);
    }
    assert.match(files.get("[Content_Types].xml") ?? "", /wordprocessingml\.document\.main\+xml/);
  });

  it("isi berupa tabel & paragraf Word asli (dapat diedit), bukan gambar/HTML", async () => {
    const { body, files } = await build("mismatch");
    const tables = body.match(/<w:tbl>/g) ?? [];
    assert.ok(tables.length >= 6, `tabel Word asli ada (ditemukan ${tables.length})`);
    assert.ok(!body.includes("<w:drawing"), "tanpa gambar");
    assert.ok(![...files.keys()].some((name) => name.startsWith("word/media/")), "tanpa media");
    // Header tabel berulang antarhalaman dan baris tidak terpotong.
    assert.match(body, /<w:tblHeader\/>/);
    assert.match(body, /<w:cantSplit\/>/);
  });

  it("memuat seluruh data bisnis: identitas, dokumen+keterangan, 8 field x 3 sumber, hasil", async () => {
    const { body } = await build("mismatch");
    const text = textOf(body);
    const totalDocs = makeSampleChecklist("mismatch").documentVerification.length;

    for (const expected of [
      "PT INBISCO NIAGATAMA",
      "Andi Pratama",
      "1234567",
      "Jenis Pengajuan",
      "1. Document Verification",
      "Akta pendirian",
      "Tanggal surat 14 September 2026",
      `${totalDocs - 1} dari ${totalDocs} dokumen tersedia; belum tersedia: Akta pendirian.`,
      "Identitas Debitur",
      "Identitas Beneficiary",
      "Nama Beneficiary",
      "Underlying Transaction",
      "PKS/Surat Penunjukkan antara Applicant & Beneficiary",
      "Surat Permohonan Bank Garansi dari Beneficiary",
      "Surat Pengajuan Bank Garansi dari Applicant",
      `PKS ada dengan Nomor ${SAMPLE_PKS_NUMBER}`,
      "Surat-Surat Lainnya",
      "Belum ada dokumen pada kategori ini.",
      "1.1",
      "3.3",
      "2. Critical Field Validation",
      "Underlying Document (acuan)",
      "Memorandum Analisa Bank Garansi",
      "Putusan Bank Garansi",
      "Hasil Validasi",
      "Jenis Bank Garansi",
      "Tujuan Bank Garansi",
      "Beneficiary",
      "Nilai Bank Garansi",
      "Jangka Waktu",
      "Biaya",
      "Kontra Garansi",
      "Underlying / Dasar Penerbitan",
      "IDR 1,250,000,000",
      "IDR 1,249,000,000",
      "01/10/2026 s.d. 01/10/2027",
      "Durasi: 365 hari",
      "Provisi: 600,000",
      "Administrasi: 250,000",
      "Notaris: 150,000",
      "PT INBISCO NIAGATAMA",
      "Fixed Asset × 1, Kendaraan × 1",
      "Fixed Asset #1",
      "Kendaraan #1",
      "Nomor SHM",
      "Nomor BPKB",
      "Nilai (NPW)",
      "Nilai Kendaraan",
      "Pengikatan",
      "Kontrak No. 123/ABC/2026",
      "Informasi bersama",
      "Nama Lengkap ADK",
      "SESUAI",
      "TIDAK SESUAI",
      "3. Opini ADK",
      "Opini ADK baris 1.",
      "Opini ADK baris 2.",
      "4. Opini SOK",
      "Diperiksa Oleh",
      "Diketahui Oleh",
      "Administrasi Operasional Kredit (ADK)",
      "Supervisor Operasional Kredit (SOK)",
      "Tanda tangan",
    ]) {
      assert.ok(text.includes(expected), `dokumen memuat "${expected}"`);
    }
  });

  describe("Informasi PKS pada Hasil Validasi Biaya", () => {
    const pksRow = (c: ReturnType<typeof makeSampleChecklist>) =>
      c.documentVerification.find(
        (d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama",
      )!;
    const docxText = async (c: ReturnType<typeof makeSampleChecklist>) => {
      const files = readZip(Buffer.from(await buildChecklistDocxBytes(c, options)));
      const xml = files.get("word/document.xml") ?? "";
      return { xml, text: textOf(xml) };
    };

    it("PKS ada: label 'Informasi PKS' + 'PKS ada dengan Nomor [Nomor PKS]', nomor ditebalkan", async () => {
      const { xml, text } = await docxText(makeSampleChecklist("clean"));
      assert.ok(text.includes("Informasi PKS\nPKS ada dengan Nomor " + SAMPLE_PKS_NUMBER));
      // Nomor PKS berada pada run tersendiri yang tebal.
      const numberRun = new RegExp(`<w:r>(?:(?!</w:r>).)*<w:b/>(?:(?!</w:r>).)*>\\s*${SAMPLE_PKS_NUMBER.replace(/[/.]/g, "\\$&")}</w:t>`);
      assert.match(xml, numberRun);
      // Panel: paragraf berlatar + kotak tipis di keempat sisi (terbaca juga pada cetak hitam-putih).
      const panel = (xml.match(/<w:p>(?:(?!<\/w:p>).)*<\/w:p>/g) ?? []).find((p) => p.includes('w:fill="E8F1FB"')) ?? "";
      assert.ok(panel, "paragraf panel berlatar biru muda");
      const pBdr = panel.match(/<w:pBdr>.*<\/w:pBdr>/)?.[0] ?? "";
      for (const side of ["top", "left", "bottom", "right"]) assert.ok(pBdr.includes(`<w:${side} `), `garis ${side}`);
    });

    it("PKS tidak ada: pesan persis (tanpa nomor)", async () => {
      const c = makeSampleChecklist("clean");
      const { text } = await docxText(setDocumentStatus(c, pksRow(c).id, "Tidak Ada"));
      assert.ok(text.includes("Informasi PKS\nPKS Tidak Ada. Silakan merujuk pada SE yang berlaku."));
      assert.ok(!text.includes("PKS ada dengan Nomor"));
    });

    it("PKS Ada tanpa Nomor: peringatan Nomor PKS belum diisi", async () => {
      const c = makeSampleChecklist("clean");
      const { text } = await docxText(setDocumentNotes(c, pksRow(c).id, "  "));
      assert.ok(text.includes("Informasi PKS\nNomor PKS belum diisi"));
    });

    it("informasi PKS tidak mengubah hasil validasi Biaya", async () => {
      const c = makeSampleChecklist("clean");
      const ada = await docxText(c);
      const tidakAda = await docxText(setDocumentStatus(c, pksRow(c).id, "Tidak Ada"));
      const hasil = (text: string) => text.match(/Biaya: SESUAI|Provisi: SESUAI/g) ?? [];
      assert.deepEqual(hasil(tidakAda.text), hasil(ada.text));
    });
  });

  it("status ketidaksesuaian memakai kalimat yang sama dengan aplikasi", async () => {
    const { body } = await build("mismatch");
    const text = textOf(body);
    assert.ok(text.includes("KETIDAKSESUAIAN INFORMASI"));
    assert.ok(text.includes("Seluruh sumber terisi; terdapat 4 informasi yang belum sesuai."));
    assert.ok(text.includes("Field terkait: Beneficiary, Nilai Bank Garansi, Biaya, Kontra Garansi."));
    assert.ok(
      text.includes("Kontra Garansi: Fixed Asset #1 – Nomor SHM: Putusan Bank Garansi berbeda dengan Underlying Document"),
    );
    assert.ok(text.includes("Beneficiary: Memorandum Analisa Bank Garansi berbeda dengan Underlying Document"));
    assert.ok(text.includes("Biaya: Provisi: Putusan Bank Garansi berbeda dengan Underlying Document"));
  });

  it("urutan kolom sumber: Underlying -> Memorandum -> Putusan -> Hasil Validasi", async () => {
    const { body } = await build("clean");
    const text = textOf(body);
    const start = text.indexOf("2. Critical Field Validation");
    const order = [
      "Underlying Document (acuan)",
      "Memorandum Analisa Bank Garansi",
      "Putusan Bank Garansi",
      "Hasil Validasi",
    ].map((label) => text.indexOf(label, start));
    assert.ok(order.every((index) => index > 0), "semua judul kolom ada");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "urutan judul kolom");
  });

  it("sel gabungan: kategori akordeon 4 kolom, baris Kontra sampai Hasil Validasi, Underlying 3 kolom", async () => {
    const { body } = await build("clean");
    // 10 kategori akordeon + catatan kategori 10 yang kosong + baris pemilihan Kontra.
    assert.equal((body.match(/<w:gridSpan w:val="4"\/>/g) ?? []).length, 12);
    // 2 baris item Kontra + Underlying.
    assert.equal((body.match(/<w:gridSpan w:val="3"\/>/g) ?? []).length, 3);
  });

  /** Baris tabel (w:tr) yang memuat teks tertentu, beserta jumlah selnya. */
  function rowWith(body: string, label: string) {
    const rows = body.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
    const row = rows.find((xml) => textOf(xml).includes(label));
    assert.ok(row, `baris "${label}"`);
    return { xml: row, cells: (row.match(/<w:tc>/g) ?? []).length };
  }

  it("baris Kontra Garansi: tanpa sel Hasil Validasi (gabungan melebar), baris item tetap punya status", async () => {
    const { body } = await build("mismatch");
    const kontra = rowWith(body, "Fixed Asset × 1, Kendaraan × 1");
    assert.equal(kontra.cells, 3, "No, nama, satu sel gabungan 4 kolom");
    assert.match(kontra.xml, /<w:gridSpan w:val="4"\/>/);
    assert.ok(!textOf(kontra.xml).includes("TIDAK SESUAI"), "tanpa status di baris pemilihan");
    const item = rowWith(body, "Fixed Asset #1");
    assert.ok(textOf(item.xml).includes("TIDAK SESUAI"), "status per item");
  });

  it("Underlying multiline: setiap baris menjadi paragraf Word (baris kosong terjaga)", async () => {
    let c = makeSampleChecklist("clean");
    const id = c.criticalFields.find((f) => f.key === "underlying")!.id;
    c = setSharedValue(c, id, "Baris A\nBaris B yang sangat panjang sekali\n\nBaris D");
    const bytes = await buildChecklistDocxBytes(c, options);
    const body = readZip(Buffer.from(bytes)).get("word/document.xml") ?? "";
    const row = rowWith(body, "Baris A");
    assert.ok(textOf(row.xml).includes("Baris A\nBaris B yang sangat panjang sekali\n\nBaris D"));
    assert.ok(!row.xml.includes("Baris A\n"), "tidak ada karakter newline mentah di dalam satu run");
  });

  it("baris belum lengkap: status + 'Belum lengkap : {N} field belum terisi', bukan mismatch", async () => {
    // Beneficiary: Underlying terisi, Putusan dan Memorandum dikosongkan => 2 field belum terisi.
    let c = makeSampleChecklist("clean");
    const id = c.criticalFields.find((f) => f.key === "beneficiary")!.id;
    c = setCriticalValue(c, id, "ptk", "");
    c = setCriticalValue(c, id, "mak", "");
    c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };
    const bytes = await buildChecklistDocxBytes(c, options);
    const text = textOf(readZip(Buffer.from(bytes)).get("word/document.xml") ?? "");
    assert.ok(text.includes("Belum lengkap : 2 field belum terisi"));
    assert.ok(!text.includes("TIDAK SESUAI"), "belum lengkap tidak dihitung sebagai mismatch");
    assert.ok(!text.includes("KETIDAKSESUAIAN INFORMASI"));
    assert.ok(!text.includes("Seluruh sumber terisi"), "tidak mengklaim seluruh sumber terisi");
  });

  it("seluruh sesuai: pesan sukses, tanpa peringatan", async () => {
    const { body } = await build("clean");
    const text = textOf(body);
    assert.ok(text.includes("Seluruh sumber terisi dan hasil validasi sudah sesuai."));
    assert.ok(!text.includes("KETIDAKSESUAIAN INFORMASI"));
    assert.ok(!text.includes("TIDAK SESUAI"));
  });

  it("tidak ada label lama (PTK / MAK / 3-Way Match) pada dokumen", async () => {
    for (const mode of ["clean", "mismatch"] as const) {
      const { files } = await build(mode);
      for (const [name, xml] of files) {
        if (!name.startsWith("word/") || !name.endsWith(".xml")) continue;
        const text = textOf(xml);
        assert.ok(!/\bPTK\b/.test(text), `${name}: tanpa "PTK"`);
        assert.ok(!/\bMAK\b/.test(text), `${name}: tanpa "MAK"`);
        assert.ok(!/3-?way/i.test(text), `${name}: tanpa "3-Way"`);
      }
    }
  });

  it("area Opini SOK: tujuh baris tulis tangan dengan tinggi tetap, dan ruang tanda tangan SOK", async () => {
    const { body } = await build("clean");
    const afterHeading = body.slice(body.indexOf("4. Opini SOK"));
    const sokTable = afterHeading.slice(0, afterHeading.indexOf("</w:tbl>"));
    const rows = sokTable.match(/<w:tr[ >]/g) ?? [];
    assert.equal(rows.length, 7, "tujuh baris tulis tangan");
    assert.equal((sokTable.match(/w:hRule="exact"/g) ?? []).length, 7);
    // Tinggi total >= 7 x 8,5 mm (480 twip per baris).
    const heights = [...sokTable.matchAll(/<w:trHeight [^>]*w:val="(\d+)"/g)].map((m) => Number(m[1]));
    assert.equal(heights.reduce((a, b) => a + b, 0) >= 7 * 480, true);

    // Baris tanda tangan memiliki tinggi minimum (ruang tanda tangan basah).
    const signature = body.slice(body.lastIndexOf("Diperiksa Oleh"));
    assert.match(signature, /w:hRule="atLeast"/);
  });

  it("footer memuat metadata & nomor halaman; header memuat nama aplikasi", async () => {
    const { footer, header } = await build("clean");
    const footerText = textOf(footer);
    assert.match(footerText, /ID [0-9A-F]{8}\s+\|\s+Status Done/);
    assert.ok(footerText.includes("Dokumen dihasilkan sistem 09 Oktober 2026, 10:00 WIB"));
    assert.ok(footerText.includes("bukan keputusan persetujuan"));
    assert.match(footer, /PAGE/);
    assert.match(footer, /NUMPAGES/);
    assert.ok(textOf(header).includes("BRICHECK — BRI Checklist & Validation"));
  });

  it("tidak ada teks yang terpotong: lebar kolom tetap dan seluruh nilai panjang tertulis utuh", async () => {
    const { body } = await build("clean");
    assert.match(body, /<w:tblLayout w:type="fixed"\/>/);
    // Tidak ada "\n" mentah di dalam run; baris baru berupa paragraf.
    assert.ok(!/<w:t[^>]*>[^<]*\n[^<]*<\/w:t>/.test(body));
    const text = textOf(body);
    assert.ok(text.includes("Jaminan pelaksanaan pekerjaan"));
  });
});
