import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addCustomDocument,
  setCriticalValue,
  setDocumentNotes,
  setDocumentStatus,
  setKontraValue,
  setSharedValue,
} from "../checklist/mutations";
import { makeSampleChecklist, SAMPLE_PKS_NUMBER } from "../checklist/test-utils";
import type { KontraCriticalField } from "../checklist/types";
import { recalculateMatches } from "../validation/three-way-match";
import { buildChecklistDocumentModel } from "./document-model";

const options = { timeZone: "Asia/Jakarta", generatedAt: new Date("2026-10-09T03:00:00Z") };

describe("model dokumen output (sumber PDF/Word/Cetak)", () => {
  it("memuat identitas, dokumen berkategori, critical field, opini, dan tanda tangan", () => {
    const c = makeSampleChecklist("mismatch");
    const m = buildChecklistDocumentModel(c, options);

    assert.equal(m.appFullName, "BRICHECK — BRI Checklist & Validation");
    assert.deepEqual(
      m.identity.flat().map((i) => i.label),
      ["Atas Nama", "Nama Lengkap ADK", "CIF", "Jenis Pengajuan", "Nama Task", "Timestamp"],
    );
    assert.equal(m.documentGroups.length, 10);
    const rows = m.documentGroups.flatMap((g) => g.rows);
    assert.equal(rows.length, c.documentVerification.length);
    const ktp = rows.find((r) => r.name === "KTP");
    assert.equal(ktp?.notes, "Tanggal surat 14 September 2026", "Keterangan ikut apa adanya");
    assert.equal(ktp?.no, "2.1");
    assert.equal(rows.find((r) => r.name === "Akta pendirian")?.tidakAda, true);
    assert.equal(m.opiniAdk, c.opiniAdk);
    assert.equal(m.signatures.adk.name, "Andi Pratama");
    assert.ok(m.signatures.adk.date);
    assert.equal(m.signatures.sok.name, "", "SOK diisi tangan");
    assert.equal(m.signatures.sok.date, "");
    assert.equal(m.sokLines >= 7, true, "ruang tulis tangan SOK cukup");
  });

  it("kategori dokumen: urutan, nomor, dan kategori kosong tetap tampil dengan catatan", () => {
    const m = buildChecklistDocumentModel(makeSampleChecklist("clean"), options);
    assert.deepEqual(
      m.documentGroups.map((g) => `${g.no}. ${g.title}`),
      [
        "1. Underlying Transaction",
        "2. Identitas Debitur",
        "3. Identitas Beneficiary",
        "4. Identitas Usaha Debitur",
        "5. Surat Utang",
        "6. Pengikatan Agunan",
        "7. Bukti Kepemilikan Agunan",
        "8. Pemeriksaan Agunan",
        "9. Paket Bank Garansi",
        "10. Surat-Surat Lainnya",
      ],
    );
    // Tiga poin duplikat sudah dihapus: tidak ada kategori bernama sama dengan poin yang dihapus.
    const titles = m.documentGroups.map((g) => g.title);
    for (const removed of [
      "Surat Permohonan Bank Garansi dari Beneficiary",
      "Surat Pengajuan Bank Garansi dari Applicant",
      "Perjanjian Kerja Sama",
    ]) {
      assert.equal(titles.includes(removed), false, removed);
    }
    // Hanya kategori 10 yang kosong dan tetap diberi catatan.
    const empty = m.documentGroups[9];
    assert.deepEqual(empty.rows, []);
    assert.equal(empty.emptyNote, "Belum ada dokumen pada kategori ini.");
    assert.equal(m.documentGroups[1].emptyNote, null);
    assert.deepEqual(
      m.documentGroups[1].rows.map((r) => r.no),
      ["2.1", "2.2", "2.3", "2.4"],
    );
    // Underlying Transaction (3 subpoin, termasuk yang bernama sama dengan poin yang dihapus) dan
    // Identitas Beneficiary (3 subpoin, termasuk Perjanjian Kerja Sama) tetap ada.
    assert.deepEqual(m.documentGroups[0].rows.map((r) => [r.no, r.name]), [
      ["1.1", "PKS/Surat Penunjukkan antara Applicant & Beneficiary"],
      ["1.2", "Surat Permohonan Bank Garansi dari Beneficiary"],
      ["1.3", "Surat Pengajuan Bank Garansi dari Applicant"],
    ]);
    assert.deepEqual(m.documentGroups[2].rows.map((r) => [r.no, r.name]), [
      ["3.1", "Nama Beneficiary"],
      ["3.2", "Alamat"],
      ["3.3", "Perjanjian Kerja Sama"],
    ]);
  });

  it("dokumen tambahan (custom) ikut tampil pada kategorinya dengan penomoran berurutan", () => {
    const base = makeSampleChecklist("clean");
    const added = addCustomDocument(base, "surat-surat-lainnya", "Surat kuasa");
    assert.ok(added.ok);
    const m = buildChecklistDocumentModel(added.checklist, options);
    assert.equal(m.documentGroups[9].emptyNote, null);
    assert.deepEqual(
      m.documentGroups[9].rows.map((r) => [r.no, r.name, r.custom]),
      [["10.1", "Surat kuasa", true]],
    );
    assert.match(m.documentsNote, /dari \d+ dokumen tersedia/);
  });

  it("kolom memakai urutan sumber baru: Underlying -> Memorandum -> Putusan", () => {
    const m = buildChecklistDocumentModel(makeSampleChecklist("clean"), options);
    assert.deepEqual(m.criticalHeaders, [
      "No",
      "Critical Field",
      "Underlying Document (acuan)",
      "Memorandum Analisa Bank Garansi",
      "Putusan Bank Garansi",
      "Hasil Validasi",
    ]);
  });

  it("baris Critical Field: Underlying bersama (gabungan), Kontra Garansi per item, Biaya per komponen", () => {
    const m = buildChecklistDocumentModel(makeSampleChecklist("clean"), options);
    assert.deepEqual(
      m.criticalRows.map((r) => [r.kind, r.no, r.name]),
      [
        ["field", "1", "Jenis Bank Garansi"],
        ["field", "2", "Tujuan Bank Garansi"],
        ["field", "3", "Beneficiary"],
        ["field", "4", "Nilai Bank Garansi"],
        ["field", "5", "Jangka Waktu"],
        ["field", "6", "Biaya"],
        ["kontra", "7", "Kontra Garansi"],
        ["item", "7.1", "Fixed Asset #1"],
        ["item-field", "", "Nomor SHM"],
        ["item-field", "", "Nilai (NPW)"],
        ["item-field", "", "Atas Nama"],
        ["item-field", "", "Pengikatan"],
        ["item", "7.2", "Kendaraan #1"],
        ["item-field", "", "Nomor BPKB"],
        ["item-field", "", "Nilai Kendaraan"],
        ["item-field", "", "Atas Nama"],
        ["item-field", "", "Pengikatan"],
        ["shared", "8", "Underlying / Dasar Penerbitan"],
      ],
    );
    const biaya = m.criticalRows.find((r) => r.name === "Biaya")!;
    assert.deepEqual(
      biaya.components?.map((c) => c.label),
      ["Provisi", "Administrasi", "Notaris"],
    );
    assert.deepEqual(
      biaya.sources?.map((s) => s.key),
      ["underlyingDocument", "mak", "ptk"],
    );
    const shared = m.criticalRows.find((r) => r.kind === "shared")!;
    assert.equal(shared.sources, null, "tiga kolom sumber digabung");
    assert.deepEqual(shared.merged?.map((l) => l.text), ["Kontrak No. 123/ABC/2026"]);
    assert.equal(shared.stateLabel, "Informasi bersama");
    const kontra = m.criticalRows.find((r) => r.kind === "kontra")!;
    assert.deepEqual(kontra.merged?.map((l) => l.text), ["Fixed Asset × 1, Kendaraan × 1"]);
    // Baris pemilihan Kontra membentang sampai kolom Hasil Validasi (status ada per item); baris lain tidak.
    assert.equal(kontra.mergedSpansResult, true);
    assert.deepEqual(
      [...new Set(m.criticalRows.filter((r) => r.mergedSpansResult).map((r) => r.kind))],
      ["kontra"],
    );
  });

  it("ketidaksesuaian: kalimat status, jumlah, dan rincian per komponen/item", () => {
    const m = buildChecklistDocumentModel(makeSampleChecklist("mismatch"), options);
    assert.equal(m.validation.kind, "mismatch");
    assert.equal(m.validation.title, "Ketidaksesuaian Informasi");
    assert.equal(m.validation.text, "Seluruh sumber terisi; terdapat 4 informasi yang belum sesuai.");
    assert.equal(m.validation.mismatchCount, 4);
    assert.deepEqual(m.validation.mismatchLabels, [
      "Beneficiary",
      "Nilai Bank Garansi",
      "Biaya",
      "Kontra Garansi",
    ]);
    assert.deepEqual(m.validation.reasons, [
      "Beneficiary: Memorandum Analisa Bank Garansi berbeda dengan Underlying Document",
      "Nilai Bank Garansi: Putusan Bank Garansi berbeda dengan Underlying Document",
      "Biaya: Provisi: Putusan Bank Garansi berbeda dengan Underlying Document",
      "Kontra Garansi: Fixed Asset #1 – Nomor SHM: Putusan Bank Garansi berbeda dengan Underlying Document",
    ]);
    assert.ok(m.validation.action?.includes("Periksa kembali"));
    assert.match(m.validation.action ?? "", /Underlying Document, Memorandum Analisa Bank Garansi, dan Putusan Bank Garansi/);
    assert.equal(m.validation.incomplete, null);
    const states = new Map(m.criticalRows.map((r) => [`${r.kind}:${r.name}`, r.stateLabel]));
    assert.equal(states.get("field:Beneficiary"), "TIDAK SESUAI");
    assert.equal(states.get("field:Jenis Bank Garansi"), "SESUAI");
    assert.equal(states.get("kontra:Kontra Garansi"), "TIDAK SESUAI");
    assert.equal(states.get("item:Fixed Asset #1"), "TIDAK SESUAI");
    assert.equal(states.get("item:Kendaraan #1"), "SESUAI");
    assert.equal(states.get("item-field:Nomor SHM"), "TIDAK SESUAI");
    // Komponen Biaya yang berbeda hanya Provisi.
    const biaya = m.criticalRows.find((r) => r.name === "Biaya")!;
    assert.deepEqual(
      biaya.components?.map((c) => [c.label, c.state]),
      [
        ["Provisi", "TIDAK SESUAI"],
        ["Administrasi", "SESUAI"],
        ["Notaris", "SESUAI"],
      ],
    );
    // Sel yang menyimpang ditandai.
    const noShm = m.criticalRows.find((r) => r.name === "Nomor SHM")!;
    const ptk = noShm.sources!.find((s) => s.key === "ptk")!;
    assert.ok(ptk.lines.some((l) => l.deviant));
    assert.ok(noShm.sources!.filter((s) => s.key !== "ptk").every((s) => s.lines.every((l) => !l.deviant)));
  });

  it("baris belum lengkap membawa deskripsi 'Belum lengkap : {N} field belum terisi'", () => {
    let c = makeSampleChecklist("clean");
    const idOf = (key: string) => c.criticalFields.find((f) => f.key === key)!.id;
    // 3 sumber kosong, 2 sumber kosong (satu terisi), Kontra: 1 isian kosong, Underlying kosong.
    for (const source of ["underlyingDocument", "ptk", "mak"] as const) {
      c = setCriticalValue(c, idOf("tujuanBg"), source, "");
    }
    c = setCriticalValue(c, idOf("beneficiary"), "ptk", "");
    c = setCriticalValue(c, idOf("beneficiary"), "mak", "");
    const kontra = c.criticalFields.find((f) => f.key === "kontraGaransi") as KontraCriticalField;
    c = setKontraValue(c, kontra.id, kontra.items[0].id, "mak", "noShm", "");
    c = setSharedValue(c, idOf("underlying"), "");
    c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };

    const rows = new Map(buildChecklistDocumentModel(c, options).criticalRows.map((r) => [r.name, r]));
    assert.equal(rows.get("Tujuan Bank Garansi")!.stateNote, "Belum lengkap : 3 field belum terisi");
    assert.equal(rows.get("Beneficiary")!.stateNote, "Belum lengkap : 2 field belum terisi");
    assert.equal(rows.get("Kontra Garansi")!.stateNote, "Belum lengkap : 1 field belum terisi");
    assert.equal(rows.get("Fixed Asset #1")!.stateNote, "Belum lengkap : 1 field belum terisi");
    assert.equal(rows.get("Nomor SHM")!.stateNote, "Belum lengkap : 1 field belum terisi");
    assert.equal(rows.get("Underlying / Dasar Penerbitan")!.stateNote, "Belum lengkap : 1 field belum terisi");
    assert.equal(rows.get("Beneficiary")!.stateLabel, "Belum lengkap");
    assert.equal(rows.get("Jenis Bank Garansi")!.stateNote, null, "baris lengkap tanpa deskripsi");

    const v = buildChecklistDocumentModel(c, options).validation;
    assert.equal(v.mismatchCount, 0, "belum lengkap bukan mismatch");
    assert.equal(v.kind, "incomplete");
  });

  it("seluruh sesuai: pesan sukses tanpa peringatan", () => {
    const m = buildChecklistDocumentModel(makeSampleChecklist("clean"), options);
    assert.equal(m.validation.kind, "all-match");
    assert.equal(m.validation.text, "Seluruh sumber terisi dan hasil validasi sudah sesuai.");
    assert.equal(m.validation.action, null);
    assert.deepEqual(m.validation.reasons, []);
  });

  it("Kontra Garansi: ringkasan 'x dari y field terisi' tidak ada; detail dan status item tetap ada", () => {
    for (const mode of ["clean", "mismatch"] as const) {
      const m = buildChecklistDocumentModel(makeSampleChecklist(mode), options);
      const everyText = m.criticalRows.flatMap((r) => [
        r.name,
        r.stateNote ?? "",
        ...(r.merged ?? []).map((l) => l.text),
        ...(r.sources ?? []).flatMap((s) => s.lines.map((l) => l.text)),
      ]);
      assert.ok(everyText.every((t) => !/field terisi/i.test(t)), "tidak ada teks 'field terisi'");
      assert.ok(everyText.every((t) => !/\d+ dari \d+ field/.test(t)));
      const items = m.criticalRows.filter((r) => r.kind === "item");
      assert.deepEqual(items.map((r) => r.name), ["Fixed Asset #1", "Kendaraan #1"]);
      assert.ok(items.every((r) => r.merged?.length === 0), "sel gabungan item dibiarkan kosong");
      assert.ok(items.every((r) => r.stateLabel.length > 0), "status validasi item tetap ada");
      // Detail data (Nomor SHM dst.) tetap tampil.
      const noShm = m.criticalRows.find((r) => r.name === "Nomor SHM")!;
      assert.ok(noShm.sources!.every((s) => s.lines.length > 0));
    }
  });

  it("Biaya: informasi PKS ikut dari Document Verification (hanya informasi, tanpa mengubah status)", () => {
    const c = makeSampleChecklist("clean");
    const biaya = (model: ReturnType<typeof buildChecklistDocumentModel>) =>
      model.criticalRows.find((r) => r.name === "Biaya")!;
    const adaModel = buildChecklistDocumentModel(c, options);
    assert.equal(biaya(adaModel).info?.text, `PKS ada dengan Nomor ${SAMPLE_PKS_NUMBER}`);
    assert.equal(biaya(adaModel).info?.label, "Informasi PKS");
    assert.equal(biaya(adaModel).info?.lead, "PKS ada dengan Nomor");
    assert.equal(biaya(adaModel).info?.number, SAMPLE_PKS_NUMBER);
    assert.equal(biaya(adaModel).info?.tone, "info");
    // Baris lain tidak membawa info.
    assert.ok(adaModel.criticalRows.filter((r) => r.name !== "Biaya").every((r) => r.info === null));

    const pks = c.documentVerification.find(
      (d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama",
    )!;
    const tidakAda = setDocumentStatus(c, pks.id, "Tidak Ada");
    const tidakAdaModel = buildChecklistDocumentModel(tidakAda, options);
    assert.equal(biaya(tidakAdaModel).info?.text, "PKS Tidak Ada. Silakan merujuk pada SE yang berlaku.");
    assert.equal(biaya(tidakAdaModel).info?.tone, "notice");
    // Status / hasil per komponen Biaya tidak berubah karena informasi PKS.
    assert.equal(biaya(tidakAdaModel).stateLabel, biaya(adaModel).stateLabel);
    assert.deepEqual(biaya(tidakAdaModel).components, biaya(adaModel).components);

    const tanpaNomor = setDocumentNotes(c, pks.id, "   ");
    assert.equal(biaya(buildChecklistDocumentModel(tanpaNomor, options)).info?.text, "Nomor PKS belum diisi");
    assert.equal(biaya(buildChecklistDocumentModel(tanpaNomor, options)).info?.tone, "warning");
  });

  it("Informasi Bersama kosong: judul belum lengkap tidak menghitung Underlying sebagai critical field", () => {
    let c = makeSampleChecklist("clean");
    const underlying = c.criticalFields.find((f) => f.key === "underlying")!;
    c = setSharedValue(c, underlying.id, "");
    const v = buildChecklistDocumentModel(c, options).validation;
    assert.equal(v.kind, "incomplete");
    assert.equal(v.incomplete?.headline, "Informasi Bersama belum diisi");
    assert.match(v.incomplete?.text ?? "", /^Informasi Bersama \(Underlying \/ Dasar Penerbitan\) belum diisi\./);
    assert.ok(!/critical field belum lengkap/.test(v.incomplete?.headline ?? ""));
  });

  it("metadata: id, status, timestamp dibuat/diperbarui/selesai, dihasilkan sistem", () => {
    const m = buildChecklistDocumentModel(makeSampleChecklist("clean"), options);
    assert.match(m.metadata[0], /^ID [0-9A-F]{8}  \|  Status Done  \|  Dibuat .+WIB  \|  Diperbarui .+WIB$/);
    assert.match(m.metadata[1], /Selesai .+WIB  \|  Dokumen dihasilkan sistem 09 Oktober 2026, 10:00 WIB$/);
  });
});
