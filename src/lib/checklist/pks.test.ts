import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canMarkDone, getDoneBlockers, isStep1Complete, getUnansweredDocuments } from "./completion";
import { PKS_NOTES_PLACEHOLDER } from "./config";
import { createEmptyChecklist } from "./factory";
import { addCustomDocument, setDocumentNotes, setDocumentStatus } from "./mutations";
import { getDocumentIssues, getPksInfo, isPksDocument } from "./pks";
import { makeSampleChecklist, SAMPLE_PKS_NUMBER } from "./test-utils";
import type { BankGuaranteeChecklist } from "./types";

const pksOf = (c: BankGuaranteeChecklist) => {
  const doc = c.documentVerification.find(
    (d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama",
  );
  assert.ok(doc);
  return doc;
};

/** Checklist yang seluruh dokumennya sudah diperiksa (PKS = Ada + nomor). */
const complete = () => makeSampleChecklist("clean");

describe("Perjanjian Kerja Sama (Identitas Beneficiary): aturan Nomor PKS", () => {
  it("placeholder Keterangan persis 'Isi Nomor PKS (Jika Ada)'", () => {
    assert.equal(PKS_NOTES_PLACEHOLDER, "Isi Nomor PKS (Jika Ada)");
  });

  it("hanya baris bawaan Identitas Beneficiary yang dikenali sebagai PKS (bukan dokumen lain maupun tambahan)", () => {
    const c = createEmptyChecklist("Andi");
    assert.equal(isPksDocument(pksOf(c)), true);
    // Poin "Perjanjian Kerja Sama" terpisah sudah dihapus; hanya satu baris PKS yang tersisa.
    assert.equal(
      c.documentVerification.filter((d) => d.documentName === "Perjanjian Kerja Sama").length,
      1,
    );
    const underlyingPks = c.documentVerification.find(
      (d) => d.categoryKey === "underlying-transaction" && d.documentName.startsWith("PKS/"),
    )!;
    assert.equal(isPksDocument(underlyingPks), false);
    const added = addCustomDocument(c, "identitas-beneficiary", "Perjanjian Kerja Sama");
    // Nama kembar pada kategori yang sama ditolak; dokumen custom tidak pernah dianggap PKS.
    assert.equal(added.ok, false);
    assert.equal(isPksDocument({ ...pksOf(c), custom: true }), false);
  });

  it("Ada + Keterangan kosong: peringatan jelas dan Document Verification tidak lengkap", () => {
    const base = complete();
    const c = setDocumentNotes(base, pksOf(base).id, "");
    assert.equal(pksOf(c).status, "Ada");
    assert.equal(getUnansweredDocuments(c).length, 0, "semua dokumen sudah dipilih");
    assert.equal(isStep1Complete(c), false);
    assert.equal(canMarkDone(c), false);
    assert.deepEqual(getDocumentIssues(c.documentVerification), [
      "Nomor PKS belum diisi (Identitas Beneficiary > Perjanjian Kerja Sama dipilih Ada)",
    ]);
    assert.ok(getDoneBlockers(c).some((blocker) => /Nomor PKS/.test(blocker)));
    // Spasi saja sama dengan kosong.
    assert.equal(isStep1Complete(setDocumentNotes(base, pksOf(base).id, "   \t ")), false);
  });

  it("Ada + Nomor PKS terisi: lengkap dan status ikut berubah otomatis", () => {
    const base = complete();
    assert.equal(isStep1Complete(base), true);
    const empty = setDocumentNotes(base, pksOf(base).id, "");
    assert.equal(isStep1Complete(empty), false);
    const filled = setDocumentNotes(empty, pksOf(base).id, "PKS/001/2026");
    assert.equal(isStep1Complete(filled), true);
  });

  it("Tidak Ada: Keterangan tidak wajib", () => {
    const base = complete();
    let c = setDocumentStatus(base, pksOf(base).id, "Tidak Ada");
    c = setDocumentNotes(c, pksOf(base).id, "");
    assert.equal(isStep1Complete(c), true);
    assert.deepEqual(getDocumentIssues(c.documentVerification), []);
  });

  it("belum dipilih tetap dihitung sebagai dokumen belum diperiksa (bukan masalah nomor)", () => {
    const c = createEmptyChecklist("Andi");
    assert.equal(isStep1Complete(c), false);
    assert.deepEqual(getDocumentIssues(c.documentVerification), []);
    assert.equal(getPksInfo(c.documentVerification).state, "belum-dipilih");
  });

  it("aturan hanya untuk PKS: dokumen lain berstatus Ada dengan Keterangan kosong tetap lengkap", () => {
    const base = complete();
    const alamat = base.documentVerification.find((d) => d.documentName === "Alamat")!;
    const c = setDocumentNotes(base, alamat.id, "");
    assert.equal(isStep1Complete(c), true);
    // Subpoin PKS/Surat Penunjukkan di Underlying Transaction juga bebas dari aturan nomor ini.
    const underlyingPks = base.documentVerification.find(
      (d) => d.categoryKey === "underlying-transaction" && d.documentName.startsWith("PKS/"),
    )!;
    assert.equal(isStep1Complete(setDocumentNotes(base, underlyingPks.id, "")), true);
  });
});

describe("Informasi PKS untuk Hasil Validasi Biaya", () => {
  it("Ada + nomor => 'PKS ada dengan Nomor [Nomor PKS]' (nomor diambil dari Keterangan DV)", () => {
    const info = getPksInfo(complete().documentVerification);
    assert.equal(info.state, "ada");
    assert.equal(info.number, SAMPLE_PKS_NUMBER);
    assert.equal(info.text, `PKS ada dengan Nomor ${SAMPLE_PKS_NUMBER}`);
    assert.equal(info.label, "Informasi PKS");
    assert.equal(info.lead, "PKS ada dengan Nomor", "nomor ditampilkan terpisah agar dapat ditonjolkan");
    assert.equal(info.tone, "info");
    assert.equal(info.missingNumber, false);
  });

  it("Tidak Ada => pesan persis 'PKS Tidak Ada. Silakan merujuk pada SE yang berlaku.' (nada notice, bukan status)", () => {
    const base = complete();
    const info = getPksInfo(setDocumentStatus(base, pksOf(base).id, "Tidak Ada").documentVerification);
    assert.equal(info.text, "PKS Tidak Ada. Silakan merujuk pada SE yang berlaku.");
    assert.equal(info.state, "tidak-ada");
    assert.equal(info.tone, "notice");
    assert.equal(info.number, "");
    assert.equal(info.missingNumber, false);
  });

  it("Ada tanpa nomor => peringatan Nomor PKS belum diisi", () => {
    const base = complete();
    const info = getPksInfo(setDocumentNotes(base, pksOf(base).id, "  ").documentVerification);
    assert.equal(info.missingNumber, true);
    assert.equal(info.tone, "warning");
    assert.equal(info.text, "Nomor PKS belum diisi");
  });

  it("mengikuti perubahan Keterangan DV secara otomatis, spasi dirapikan", () => {
    const base = complete();
    const changed = setDocumentNotes(base, pksOf(base).id, "  PKS  No.   77/2026 ");
    assert.equal(getPksInfo(changed.documentVerification).text, "PKS ada dengan Nomor PKS No. 77/2026");
  });
});
