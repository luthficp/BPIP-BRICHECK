import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeStep2Issue, isMismatchBlocking, isStep2Complete } from "@/lib/checklist/completion";
import { createEmptyChecklist } from "@/lib/checklist/factory";
import {
  addFeeComponent,
  applyKontraConfig,
  setAmountValue,
  setCriticalValue,
  setFeeValue,
  setKontraValue,
  setPeriodValue,
} from "@/lib/checklist/mutations";
import type {
  AmountCriticalField,
  BankGuaranteeChecklist,
  FeesCriticalField,
  KontraCriticalField,
  PeriodCriticalField,
  TextCriticalField,
} from "@/lib/checklist/types";
import { evaluateField, recalculateMatches } from "@/lib/validation/three-way-match";

import {
  applyExtraction,
  clearSourceFields,
  countFilledColumn,
  countNeedsAttention,
  countReadFields,
  countReplaced,
  countStatuses,
  EXTRACT_FIELDS,
  type ExtractionChange,
} from "./apply";
import { parseBgDocument } from "./bg-parse";
import { SAMPLE_MAK, SAMPLE_PTK, SAMPLE_STRUKTUR, sampleDoc } from "./fixtures";

const mak = parseBgDocument(SAMPLE_MAK);
const ptk = parseBgDocument(SAMPLE_PTK);

function field<T>(c: BankGuaranteeChecklist, key: string): T {
  const found = c.criticalFields.find((f) => f.key === key);
  assert.ok(found, `field ${key}`);
  return found as unknown as T;
}
const idOf = (c: BankGuaranteeChecklist, key: string) => field<{ id: number }>(c, key).id;
const statusOf = (changes: ExtractionChange[], id: string) => changes.find((ch) => ch.id === id)?.status;

/** Underlying Document diisi manual oleh ADK, sama dengan isi dokumen contoh. */
function withUnderlying(c: BankGuaranteeChecklist, overrides: { tujuan?: string; jenis?: string } = {}) {
  let next = c;
  next = setCriticalValue(next, idOf(next, "jenisBg"), "underlyingDocument", overrides.jenis ?? "Performance Bond");
  next = setCriticalValue(next, idOf(next, "tujuanBg"), "underlyingDocument", overrides.tujuan ?? "Jaminan Pelaksanaan");
  next = setCriticalValue(next, idOf(next, "beneficiary"), "underlyingDocument", "Dinas Pekerjaan Umum Kabupaten Contoh, Bidang Bina Marga");
  next = setAmountValue(next, idOf(next, "nilaiBg"), "underlyingDocument", { currency: "IDR", amount: "1500000000" });
  next = setPeriodValue(next, idOf(next, "jangkaWaktu"), "underlyingDocument", { start: "2026-02-19", end: "2027-04-08" });
  next = setFeeValue(next, idOf(next, "biaya"), "underlyingDocument", { provisi: "15,000,000", administrasi: "2,000,000" });
  return next;
}

/** Kontra Garansi diisi manual: satu item Asuransi dengan SP3 pada ketiga sumber. */
function withKontra(c: BankGuaranteeChecklist) {
  const kontraId = idOf(c, "kontraGaransi");
  let next = applyKontraConfig(c, kontraId, { fixedAsset: 0, kendaraan: 0, cashCollateral: 0, asuransi: 1 });
  const item = field<KontraCriticalField>(next, "kontraGaransi").items[0];
  for (const source of ["underlyingDocument", "mak", "ptk"] as const) {
    next = setKontraValue(next, kontraId, item.id, source, "noSp3", "SP3-MANUAL-001");
  }
  return next;
}

const fresh = () => createEmptyChecklist("ADK Uji");
const fill = (c: BankGuaranteeChecklist, source: "mak" | "ptk", parsed = source === "mak" ? mak : ptk) =>
  applyExtraction(c, source, parsed);

describe("applyExtraction: satu dokumen mengisi kolomnya sendiri (skenario 2, 3, 4)", () => {
  it("Memorandum saja: hanya kolom Memorandum yang terisi", () => {
    const { checklist, changes } = fill(fresh(), "mak");
    assert.equal(field<TextCriticalField>(checklist, "jenisBg").mak, "Performance Bond");
    assert.equal(field<TextCriticalField>(checklist, "tujuanBg").mak, "Jaminan Pelaksanaan");
    assert.equal(field<TextCriticalField>(checklist, "jenisBg").ptk, "");
    assert.deepEqual(field<AmountCriticalField>(checklist, "nilaiBg").ptk, { currency: "IDR", amount: "" });
    assert.deepEqual(field<AmountCriticalField>(checklist, "nilaiBg").mak, { currency: "IDR", amount: "1500000000" });
    assert.equal(changes.length, EXTRACT_FIELDS.length);
    assert.ok(changes.every((ch) => ch.source === "mak" && ch.status === "filled"));
    assert.deepEqual(countStatuses(changes), { filled: 7, confirm: 0, missing: 0 });
    assert.equal(countReplaced(changes), 0); // kolom kosong: tidak ada isian lama yang digantikan
  });

  it("Putusan saja: hanya kolom Putusan yang terisi", () => {
    const { checklist } = fill(fresh(), "ptk");
    assert.deepEqual(field<PeriodCriticalField>(checklist, "jangkaWaktu").ptk, { start: "2026-02-19", end: "2027-04-08" });
    assert.deepEqual(field<PeriodCriticalField>(checklist, "jangkaWaktu").mak, { start: "", end: "" });
    assert.equal(field<FeesCriticalField>(checklist, "biaya").ptk.provisi, "15,000,000");
    assert.equal(field<FeesCriticalField>(checklist, "biaya").ptk.administrasi, "2,000,000");
    assert.equal(field<FeesCriticalField>(checklist, "biaya").mak.provisi ?? "", "");
  });

  it("kedua dokumen: tiap dokumen mengisi kolomnya; Provisi dan Administrasi tetap terpisah", () => {
    const a = fill(fresh(), "mak");
    const b = fill(a.checklist, "ptk");
    const biaya = field<FeesCriticalField>(b.checklist, "biaya");
    assert.equal(biaya.mak.provisi, "15,000,000");
    assert.equal(biaya.mak.administrasi, "2,000,000");
    assert.equal(biaya.ptk.provisi, "15,000,000");
    assert.equal(biaya.ptk.administrasi, "2,000,000");
    assert.equal(biaya.underlyingDocument.provisi ?? "", "");
  });

  it("tanpa ekstraksi: seluruh field diisi manual dan hasilnya dihitung engine (skenario 1)", () => {
    let manual = withUnderlying(fresh());
    for (const source of ["mak", "ptk"] as const) {
      manual = setCriticalValue(manual, idOf(manual, "jenisBg"), source, "Performance Bond");
      manual = setCriticalValue(manual, idOf(manual, "tujuanBg"), source, "Jaminan Pelaksanaan");
    }
    manual = { ...manual, criticalFields: recalculateMatches(manual.criticalFields) };
    assert.equal(evaluateField(field(manual, "jenisBg")).state, "SESUAI");
    assert.equal(evaluateField(field(manual, "tujuanBg")).state, "SESUAI");
    // Kolom belum diisi tetap kosong: tidak ada isian otomatis yang muncul tanpa upload.
    assert.equal(field<TextCriticalField>(manual, "beneficiary").mak, "");
  });
});

describe("applyExtraction: Underlying Document dan Kontra Garansi tetap manual", () => {
  it("tidak mengubah Underlying Document maupun Kontra Garansi (kedua dokumen)", () => {
    const manual = withKontra(withUnderlying(fresh()));
    const underlyingBefore = JSON.stringify(
      manual.criticalFields.map((f) => ("underlyingDocument" in f ? f.underlyingDocument : null)),
    );
    const kontraBefore = JSON.stringify(field(manual, "kontraGaransi"));
    const sharedBefore = JSON.stringify(field(manual, "underlying"));

    const a = fill(manual, "mak");
    const b = fill(a.checklist, "ptk");

    const underlyingAfter = JSON.stringify(
      b.checklist.criticalFields.map((f) => ("underlyingDocument" in f ? f.underlyingDocument : null)),
    );
    assert.equal(underlyingAfter, underlyingBefore);
    assert.equal(JSON.stringify(field(b.checklist, "kontraGaransi")), kontraBefore);
    assert.equal(JSON.stringify(field(b.checklist, "underlying")), sharedBefore);
  });

  it("tidak pernah menambah item Kontra Garansi dari PDF", () => {
    const { checklist } = fill(fresh(), "ptk");
    assert.equal(field<KontraCriticalField>(checklist, "kontraGaransi").items.length, 0);
    assert.ok(!EXTRACT_FIELDS.some((f) => f.fieldKey === "kontraGaransi"));
  });
});

describe("applyExtraction: PDF baru langsung menimpa kolom dokumennya (Bagian 15)", () => {
  const second = parseBgDocument(
    sampleDoc(
      "mak",
      SAMPLE_STRUKTUR.replace("Jaminan Pelaksanaan", "Jaminan Uang Muka")
        .replace("Rp. 1.500.000.000 (satu milyar lima ratus juta rupiah)", "Rp. 2.000.000.000")
        .replace("Rp. 2.000.000,-", "Rp. 3.000.000,-"),
    ),
  );

  it("isian manual yang berbeda langsung ditimpa tanpa konfirmasi; isian lama dilaporkan", () => {
    const manual = setCriticalValue(fresh(), idOf(fresh(), "beneficiary"), "mak", "Nama Ketikan ADK");
    const { checklist, changes } = fill(manual, "mak");
    assert.equal(
      field<TextCriticalField>(checklist, "beneficiary").mak,
      "Dinas Pekerjaan Umum Kabupaten Contoh, Bidang Bina Marga",
    );
    const ch = changes.find((x) => x.id === "beneficiary");
    assert.equal(ch?.status, "filled");
    assert.equal(ch?.replaced, "Nama Ketikan ADK");
    assert.equal(countReplaced(changes), 1);
  });

  it("koreksi manual setelah ekstraksi ikut ditimpa saat file yang sama diunggah lagi", () => {
    const first = fill(fresh(), "mak");
    const corrected = setCriticalValue(first.checklist, idOf(first.checklist, "tujuanBg"), "mak", "Jaminan Uang Muka");
    const again = applyExtraction(corrected, "mak", mak);
    assert.equal(field<TextCriticalField>(again.checklist, "tujuanBg").mak, "Jaminan Pelaksanaan");
    assert.equal(again.changes.find((ch) => ch.id === "tujuanBg")?.replaced, "Jaminan Uang Muka");
    assert.equal(countReplaced(again.changes), 1);
  });

  it("isi yang sama (beda huruf besar/kecil, spasi, atau format angka) tidak dihitung sebagai isian yang digantikan", () => {
    let manual = setCriticalValue(fresh(), idOf(fresh(), "tujuanBg"), "mak", "jaminan   PELAKSANAAN");
    manual = setAmountValue(manual, idOf(manual, "nilaiBg"), "mak", { currency: "IDR", amount: "1500000000.00" });
    const r = fill(manual, "mak");
    assert.equal(r.changes.find((ch) => ch.id === "tujuanBg")?.replaced, undefined);
    assert.equal(r.changes.find((ch) => ch.id === "nilaiBg")?.replaced, undefined);
    assert.equal(field<TextCriticalField>(r.checklist, "tujuanBg").mak, "Jaminan Pelaksanaan");
  });

  it("file pengganti: seluruh kolom mengikuti file terbaru", () => {
    const first = fill(fresh(), "mak");
    const edited = setCriticalValue(first.checklist, idOf(first.checklist, "beneficiary"), "mak", "Beneficiary Dikoreksi ADK");
    const r = applyExtraction(edited, "mak", second);
    assert.equal(field<TextCriticalField>(r.checklist, "tujuanBg").mak, "Jaminan Uang Muka");
    assert.equal(field<TextCriticalField>(r.checklist, "jenisBg").mak, "Advance Payment Bond");
    assert.equal(field<TextCriticalField>(r.checklist, "beneficiary").mak, "Dinas Pekerjaan Umum Kabupaten Contoh, Bidang Bina Marga");
    assert.equal(field<AmountCriticalField>(r.checklist, "nilaiBg").mak.amount, "2000000000");
    assert.equal(field<FeesCriticalField>(r.checklist, "biaya").mak.administrasi, "3,000,000");
    assert.equal(field<FeesCriticalField>(r.checklist, "biaya").mak.provisi, "15,000,000");
    // tujuan, jenis, beneficiary (dikoreksi), nilai, administrasi digantikan; periode dan provisi sama.
    assert.equal(countReplaced(r.changes), 5);
    assert.ok(r.changes.every((ch) => ch.status === "filled"));
  });

  it("mengganti Memorandum tidak mengubah kolom Putusan, Underlying Document, dan Kontra Garansi", () => {
    const c = fill(fill(withKontra(withUnderlying(fresh())), "mak").checklist, "ptk").checklist;
    const snapshot = (x: BankGuaranteeChecklist) =>
      JSON.stringify({
        ptk: x.criticalFields.map((f) => ("ptk" in f ? f.ptk : null)),
        underlying: x.criticalFields.map((f) => ("underlyingDocument" in f ? f.underlyingDocument : null)),
        kontra: field(x, "kontraGaransi"),
        shared: field(x, "underlying"),
      });
    const before = snapshot(c);
    const r = applyExtraction(c, "mak", second);
    assert.equal(snapshot(r.checklist), before);
    assert.notEqual(field<TextCriticalField>(r.checklist, "tujuanBg").mak, field<TextCriticalField>(c, "tujuanBg").mak);
  });

  it("mengganti Putusan tidak mengubah kolom Memorandum, Underlying Document, dan Kontra Garansi", () => {
    const c = fill(fill(withKontra(withUnderlying(fresh())), "mak").checklist, "ptk").checklist;
    const snapshot = (x: BankGuaranteeChecklist) =>
      JSON.stringify({
        mak: x.criticalFields.map((f) => ("mak" in f ? f.mak : null)),
        underlying: x.criticalFields.map((f) => ("underlyingDocument" in f ? f.underlyingDocument : null)),
        kontra: field(x, "kontraGaransi"),
        shared: field(x, "underlying"),
      });
    const before = snapshot(c);
    const otherPtk = parseBgDocument(sampleDoc("ptk", SAMPLE_STRUKTUR.replace("Jaminan Pelaksanaan", "Jaminan Pembayaran")));
    const r = applyExtraction(c, "ptk", otherPtk);
    assert.equal(snapshot(r.checklist), before);
    assert.equal(field<TextCriticalField>(r.checklist, "jenisBg").ptk, "Payment Bond");
  });

  it("field yang tidak ada pada file baru dikosongkan; nilai lama tidak dipertahankan", () => {
    const first = fill(fresh(), "mak");
    const sparse = parseBgDocument(
      sampleDoc("mak", `\nStruktur, Tipe dan Syarat Bank Garansi sebagai berikut :\n 2. Jenis Bank Garansi : Jaminan Pelaksanaan\nA. Syarat - Syarat Lain :\n`),
    );
    const r = applyExtraction(first.checklist, "mak", sparse);
    assert.deepEqual(field<AmountCriticalField>(r.checklist, "nilaiBg").mak, { currency: "IDR", amount: "" });
    assert.deepEqual(field<PeriodCriticalField>(r.checklist, "jangkaWaktu").mak, { start: "", end: "" });
    assert.equal(field<TextCriticalField>(r.checklist, "beneficiary").mak, "");
    assert.equal(field<FeesCriticalField>(r.checklist, "biaya").mak.provisi, "");
    assert.equal(field<FeesCriticalField>(r.checklist, "biaya").mak.administrasi, "");
    const nilai = r.changes.find((ch) => ch.id === "nilaiBg");
    assert.equal(nilai?.status, "missing");
    assert.equal(nilai?.display, "");
    assert.deepEqual(nilai?.found, []);
    assert.match(nilai?.replaced ?? "", /1[.,]500[.,]000[.,]000/);
    // Kolom dokumen lain tidak ikut berubah.
    assert.equal(countFilledColumn(r.checklist, "ptk"), 0);
    assert.deepEqual(countStatuses(r.changes), { filled: 2, confirm: 0, missing: 5 });
  });

  it("dokumen pengganti yang tidak memuat Jenis maupun Tujuan mengosongkan keduanya dengan penyebab pasti", () => {
    const first = fill(fresh(), "ptk");
    const noTujuan = parseBgDocument(
      sampleDoc("ptk", `\nStruktur, Tipe dan Syarat Bank Garansi sebagai berikut :\n 3. Nama Pengguna Jasa : PT. Baru\nA. Syarat - Syarat Lain :\n`),
    );
    const r = applyExtraction(first.checklist, "ptk", noTujuan);
    assert.equal(field<TextCriticalField>(r.checklist, "tujuanBg").ptk, "");
    assert.equal(field<TextCriticalField>(r.checklist, "jenisBg").ptk, "");
    assert.equal(field<TextCriticalField>(r.checklist, "beneficiary").ptk, "PT. Baru");
    const jenis = r.changes.find((ch) => ch.id === "jenisBg");
    assert.equal(jenis?.status, "missing");
    assert.match(jenis?.note ?? "", /Tujuan Bank Garansi tidak ditemukan/);
  });
});

describe("applyExtraction: empat keadaan hasil (Bagian 14)", () => {
  const sparse = parseBgDocument(
    sampleDoc(
      "ptk",
      `
Struktur, Tipe dan Syarat Bank Garansi sebagai berikut :
 2. Jenis Bank Garansi : Jaminan Pelaksanaan
 6. Plafond BG : Rp. 100.000.000
 6. Plafond BG : Rp. 200.000.000
 7. Jangka Waktu BG : 12 bulan
A. Syarat - Syarat Lain :
`,
    ),
  );

  it("beberapa kandidat -> kuning tanpa nilai: kolom kosong, kandidat dan alasan dari PDF", () => {
    const { checklist, changes } = applyExtraction(fresh(), "ptk", sparse);
    assert.deepEqual(field<AmountCriticalField>(checklist, "nilaiBg").ptk, { currency: "IDR", amount: "" });
    const nilai = changes.find((c) => c.id === "nilaiBg");
    assert.equal(nilai?.status, "confirm");
    assert.equal(nilai?.display, "");
    assert.deepEqual(nilai?.found, ["Rp. 100.000.000", "Rp. 200.000.000"]);
    assert.match(nilai?.reasons[0] ?? "", /2 nilai berbeda/);
  });

  it("butir ada tetapi isinya tidak terbaca -> kuning dengan teks yang terbaca (bukan merah)", () => {
    const { checklist, changes } = applyExtraction(fresh(), "ptk", sparse);
    assert.deepEqual(field<PeriodCriticalField>(checklist, "jangkaWaktu").ptk, { start: "", end: "" });
    const periode = changes.find((c) => c.id === "jangkaWaktu");
    assert.equal(periode?.status, "confirm");
    assert.deepEqual(periode?.found, ["12 bulan"]);
    assert.match(periode?.reasons[0] ?? "", /tidak dapat dibaca/);
  });

  it("tidak ada informasi -> merah; terbaca jelas -> hijau", () => {
    const { changes } = applyExtraction(fresh(), "ptk", sparse);
    assert.equal(statusOf(changes, "beneficiary"), "missing");
    assert.equal(statusOf(changes, "provisi"), "missing");
    assert.equal(statusOf(changes, "administrasi"), "missing");
    assert.equal(statusOf(changes, "tujuanBg"), "filled");
    assert.equal(statusOf(changes, "jenisBg"), "filled");
    assert.deepEqual(countStatuses(changes), { filled: 2, confirm: 2, missing: 3 });
    assert.equal(countNeedsAttention(changes), 5);
  });

  it("satu nilai jelas dengan alasan -> kuning dengan nilai terisi (ADK masih dapat memperbaikinya)", () => {
    const doc = parseBgDocument(
      sampleDoc("mak", SAMPLE_STRUKTUR.replace("Rp. 1.500.000.000 (satu milyar lima ratus juta rupiah)", "Rp. 1.500.000.000 (satu milyar dua ratus juta rupiah)")),
    );
    const { checklist, changes } = applyExtraction(fresh(), "mak", doc);
    const nilai = changes.find((c) => c.id === "nilaiBg");
    assert.equal(nilai?.status, "confirm");
    assert.equal(nilai?.display, "IDR 1,500,000,000");
    assert.equal(field<AmountCriticalField>(checklist, "nilaiBg").mak.amount, "1500000000");
    assert.match(nilai?.found[0] ?? "", /satu milyar dua ratus juta rupiah/);
    assert.match(nilai?.reasons[0] ?? "", /terbilang/);
    // Hanya Nilai yang kuning; yang lain tetap hijau.
    assert.deepEqual(countStatuses(changes), { filled: 6, confirm: 1, missing: 0 });
  });

  it("selisih hitungan hari menjadi info netral dan tidak menjadikan Jangka Waktu kuning", () => {
    const { changes } = applyExtraction(fresh(), "ptk", ptk);
    const periode = changes.find((c) => c.id === "jangkaWaktu");
    assert.equal(periode?.status, "filled");
    assert.match(periode?.info ?? "", /414.*413/);
  });

  it("countReadFields: nol bila PDF tidak menghasilkan informasi apa pun; kandidat dihitung", () => {
    assert.equal(countReadFields(parseBgDocument("PUTUSAN BANK GARANSI\nTidak ada struktur")), 0);
    assert.equal(countReadFields(parseBgDocument("")), 0);
    assert.equal(countReadFields(sparse), 4); // jenis, tujuan, nilai (kandidat), periode (teks)
    assert.equal(countReadFields(ptk), 7);
  });
});

describe("applyExtraction: hasil validasi dihitung ulang setelah menimpa (Bagian 15)", () => {
  const recalc = (c: BankGuaranteeChecklist): BankGuaranteeChecklist => ({
    ...c,
    criticalFields: recalculateMatches(c.criticalFields),
  });

  it("file pengganti yang berbeda dari acuan mengubah SESUAI menjadi TIDAK SESUAI, dan sebaliknya", () => {
    const base = recalc(fill(fill(withUnderlying(fresh()), "mak").checklist, "ptk").checklist);
    assert.equal(evaluateField(field(base, "nilaiBg")).state, "SESUAI");
    assert.equal(isMismatchBlocking(base), false);

    const bigger = parseBgDocument(sampleDoc("mak", SAMPLE_STRUKTUR.replace("Rp. 1.500.000.000 (satu milyar lima ratus juta rupiah)", "Rp. 1.600.000.000")));
    const changed = recalc(applyExtraction(base, "mak", bigger).checklist);
    assert.equal(evaluateField(field(changed, "nilaiBg")).state, "TIDAK SESUAI");
    assert.equal(isMismatchBlocking(changed), true);

    const back = recalc(applyExtraction(changed, "mak", mak).checklist);
    assert.equal(evaluateField(field(back, "nilaiBg")).state, "SESUAI");
    assert.equal(isMismatchBlocking(back), false);
  });

  it("file pengganti yang tidak memuat field mengosongkannya: baris kembali BELUM LENGKAP, bukan hasil lama", () => {
    const base = recalc(fill(fill(withUnderlying(fresh(), { jenis: "Advance Payment Bond" }), "mak").checklist, "ptk").checklist);
    assert.equal(isMismatchBlocking(base), true);
    const sparse = parseBgDocument(
      // Teks polos: kepala contoh Memorandum menyebut "Jaminan Pelaksanaan" pada kalimat permohonan.
      `MEMORANDUM ANALISA BANK GARANSI\nStruktur, Tipe dan Syarat Bank Garansi sebagai berikut :\n 4. Nama Pekerjaan : Jalan\n 3. Nama Pengguna Jasa : PT. X\nA. Syarat - Syarat Lain :\n`,
    );
    const after = recalc(applyExtraction(base, "mak", sparse).checklist);
    assert.equal(evaluateField(field(after, "jenisBg")).state, "BELUM LENGKAP");
    assert.equal(evaluateField(field(after, "nilaiBg")).state, "BELUM LENGKAP");
    assert.equal(isMismatchBlocking(after), true); // beneficiary kini berbeda dari acuan -> TIDAK SESUAI baru
  });
});

describe("clearSourceFields: Hapus dokumen dan kosongkan isian (Bagian 12)", () => {
  const filled = () => {
    const withExtra = addFeeComponent(withKontra(withUnderlying(fresh())), idOf(fresh(), "biaya"), "Biaya Materai");
    assert.ok(withExtra.ok);
    const base = withExtra.ok ? withExtra.checklist : fresh();
    const a = fill(base, "mak");
    const b = fill(a.checklist, "ptk");
    return { checklist: b.checklist, componentId: withExtra.ok ? withExtra.componentId : "" };
  };

  it("mengosongkan seluruh tujuh field kolom dokumen itu, termasuk yang sudah diubah ADK", () => {
    const { checklist } = filled();
    const edited = setCriticalValue(checklist, idOf(checklist, "beneficiary"), "mak", "Diubah ADK");
    assert.equal(countFilledColumn(edited, "mak"), 7);
    const cleared = clearSourceFields(edited, "mak");

    assert.equal(field<TextCriticalField>(cleared, "tujuanBg").mak, "");
    assert.equal(field<TextCriticalField>(cleared, "jenisBg").mak, "");
    assert.equal(field<TextCriticalField>(cleared, "beneficiary").mak, "");
    assert.deepEqual(field<AmountCriticalField>(cleared, "nilaiBg").mak, { currency: "IDR", amount: "" });
    assert.deepEqual(field<PeriodCriticalField>(cleared, "jangkaWaktu").mak, { start: "", end: "" });
    assert.equal(field<FeesCriticalField>(cleared, "biaya").mak.provisi, "");
    assert.equal(field<FeesCriticalField>(cleared, "biaya").mak.administrasi, "");
    assert.equal(countFilledColumn(cleared, "mak"), 0);
  });

  it("tidak menyentuh kolom dokumen lain, Underlying Document, Kontra Garansi, dan biaya tambahan", () => {
    const { checklist, componentId } = filled();
    const withExtraValue = setFeeValue(checklist, idOf(checklist, "biaya"), "mak", { [componentId]: "500,000" });
    const cleared = clearSourceFields(withExtraValue, "mak");

    assert.equal(field<TextCriticalField>(cleared, "tujuanBg").ptk, "Jaminan Pelaksanaan");
    assert.equal(countFilledColumn(cleared, "ptk"), 7);
    assert.equal(field<TextCriticalField>(cleared, "tujuanBg").underlyingDocument, "Jaminan Pelaksanaan");
    assert.equal(
      JSON.stringify(field(cleared, "kontraGaransi")),
      JSON.stringify(field(withExtraValue, "kontraGaransi")),
    );
    assert.equal(JSON.stringify(field(cleared, "underlying")), JSON.stringify(field(withExtraValue, "underlying")));
    assert.equal(field<FeesCriticalField>(cleared, "biaya").mak[componentId], "500,000");
    assert.equal(
      JSON.stringify(field<FeesCriticalField>(cleared, "biaya").underlyingDocument),
      JSON.stringify(field<FeesCriticalField>(withExtraValue, "biaya").underlyingDocument),
    );
  });

  it("kolom Putusan dikosongkan dengan cara yang sama tanpa menyentuh Memorandum", () => {
    const { checklist } = filled();
    const cleared = clearSourceFields(checklist, "ptk");
    assert.equal(countFilledColumn(cleared, "ptk"), 0);
    assert.equal(countFilledColumn(cleared, "mak"), 7);
  });

  it("status dihitung ulang dari data yang tersisa (tidak tertinggal SESUAI/TIDAK SESUAI lama)", () => {
    const recalc = (c: BankGuaranteeChecklist): BankGuaranteeChecklist => ({
      ...c,
      criticalFields: recalculateMatches(c.criticalFields),
    });
    // Acuan berbeda dari kedua dokumen: TIDAK SESUAI dan memblokir.
    const base = recalc(fill(fill(withUnderlying(fresh(), { jenis: "Advance Payment Bond" }), "mak").checklist, "ptk").checklist);
    assert.equal(isMismatchBlocking(base), true);

    // Mengosongkan Memorandum: salah satu sumber kosong, jadi baris kembali belum lengkap
    // (hasil TIDAK SESUAI lama tidak dipertahankan) dan blokir lanjut hilang.
    const afterMak = recalc(clearSourceFields(base, "mak"));
    assert.equal(evaluateField(field(afterMak, "jenisBg")).state, "BELUM LENGKAP");
    assert.equal(evaluateField(field(afterMak, "nilaiBg")).state, "BELUM LENGKAP");
    assert.equal(isMismatchBlocking(afterMak), false);
    // Pengisian ulang manual membuat perbandingan berjalan lagi.
    const refilled = recalc(setCriticalValue(afterMak, idOf(afterMak, "jenisBg"), "mak", "Payment Bond"));
    assert.equal(evaluateField(field(refilled, "jenisBg")).state, "TIDAK SESUAI");
    assert.equal(isMismatchBlocking(refilled), true);
  });

  it("Hapus dokumen saja tidak mengubah tabel (tidak ada fungsi pengosongan yang dipanggil)", () => {
    const { checklist } = filled();
    // Pilihan A hanya melepas berkas di UI; tabel adalah checklist yang sama.
    assert.equal(countFilledColumn(checklist, "mak"), 7);
  });
});

describe("hasil ekstraksi tetap divalidasi engine yang sudah ada (skenario 11)", () => {
  const recalc = (c: BankGuaranteeChecklist): BankGuaranteeChecklist => ({
    ...c,
    criticalFields: recalculateMatches(c.criticalFields),
  });

  it("Underlying berbeda dari dokumen bank: TIDAK SESUAI memblokir lanjut ke Opini ADK", () => {
    const manual = withUnderlying(fresh(), { jenis: "Advance Payment Bond" });
    const c = recalc(fill(fill(manual, "mak").checklist, "ptk").checklist);
    assert.equal(evaluateField(field(c, "jenisBg")).state, "TIDAK SESUAI");
    assert.equal(isMismatchBlocking(c), true);
    assert.equal(isStep2Complete(c), false);
    assert.match(describeStep2Issue(c), /TIDAK SESUAI/);
  });

  it("setelah ADK mengoreksi acuan, blokir hilang dan seluruh field SESUAI", () => {
    const manual = withUnderlying(fresh());
    const c = recalc(fill(fill(manual, "mak").checklist, "ptk").checklist);
    for (const key of ["jenisBg", "tujuanBg", "beneficiary", "nilaiBg", "jangkaWaktu", "biaya"]) {
      assert.equal(evaluateField(field(c, key)).state, "SESUAI", key);
    }
    assert.equal(isMismatchBlocking(c), false);
  });

  it("Memorandum dan Putusan yang saling berbeda terdeteksi sebagai TIDAK SESUAI", () => {
    const other = parseBgDocument(sampleDoc("ptk", SAMPLE_STRUKTUR.replace("Rp. 1.500.000.000 (satu milyar lima ratus juta rupiah)", "Rp. 1.600.000.000")));
    const c = recalc(fill(fill(withUnderlying(fresh()), "mak").checklist, "ptk", other).checklist);
    assert.equal(evaluateField(field(c, "nilaiBg")).state, "TIDAK SESUAI");
    assert.equal(isMismatchBlocking(c), true);
  });

  it("belum ada acuan: baris belum lengkap, bukan TIDAK SESUAI", () => {
    const c = recalc(fill(fill(fresh(), "mak").checklist, "ptk").checklist);
    assert.equal(evaluateField(field(c, "nilaiBg")).state, "BELUM LENGKAP");
    assert.equal(isMismatchBlocking(c), false);
  });
});
