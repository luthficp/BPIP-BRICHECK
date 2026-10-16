import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CRITICAL_FIELD_DEFS,
  DOCUMENT_CATEGORIES,
  DEFAULT_FEE_COMPONENTS,
  KONTRA_TYPES,
  MISMATCH_WARNING_ACTION,
  MISMATCH_WARNING_TEXT,
  MISMATCH_WARNING_TITLE,
  SOURCES,
  mismatchBlockText,
} from "../checklist/config";
import {
  getComponentResults,
  getKontraDetailLines,
  getSharedLines,
  getSourceLines,
  getSourceText,
  matchStateLabel,
  matchStateNote,
} from "../checklist/display";
import {
  fullKontraDetail,
  makeAmount,
  makeFees,
  makeKontra,
  makeKontraItem,
  makePeriod,
  makeShared,
  makeText,
  TEST_FEE_COMPONENTS,
  type FeeTuple,
} from "../checklist/test-utils";
import { evaluateField, summarizeValidation } from "./three-way-match";

const state = (field: Parameters<typeof evaluateField>[0]) => evaluateField(field).state;

describe("konfigurasi 8 critical field", () => {
  it("urutan dan nama sesuai spesifikasi", () => {
    assert.deepEqual(
      CRITICAL_FIELD_DEFS.map((d) => d.label),
      [
        "Jenis Bank Garansi",
        "Tujuan Bank Garansi",
        "Beneficiary",
        "Nilai Bank Garansi",
        "Jangka Waktu",
        "Biaya",
        "Kontra Garansi",
        "Underlying / Dasar Penerbitan",
      ],
    );
  });

  it("urutan sumber: Underlying Document -> Memorandum Analisa -> Putusan (spesifikasi 14.1)", () => {
    assert.deepEqual(
      SOURCES.map((s) => s.label),
      ["Underlying Document", "Memorandum Analisa Bank Garansi", "Putusan Bank Garansi"],
    );
    assert.deepEqual(
      SOURCES.map((s) => s.key),
      ["underlyingDocument", "mak", "ptk"],
    );
  });

  it("Biaya: awalnya hanya Provisi dan Administrasi (tanpa Notaris / Lainnya)", () => {
    assert.deepEqual(
      DEFAULT_FEE_COMPONENTS.map((c) => c.label),
      ["Provisi", "Administrasi"],
    );
  });

  it("Kontra Garansi: empat jenis dengan field wajib sesuai spesifikasi", () => {
    assert.deepEqual(
      KONTRA_TYPES.map((t) => t.label),
      ["Fixed Asset", "Kendaraan", "Cash Collateral", "Asuransi (SP3)"],
    );
    const labels = (type: string) =>
      KONTRA_TYPES.find((t) => t.key === type)!.fields.map((f) => f.label);
    assert.deepEqual(labels("fixedAsset"), ["Nomor SHM", "Nilai (NPW)", "Atas Nama", "Pengikatan"]);
    assert.deepEqual(labels("kendaraan"), ["Nomor BPKB", "Nilai Kendaraan", "Atas Nama", "Pengikatan"]);
    assert.deepEqual(labels("cashCollateral"), ["Jenis Cash Coll", "Nilai", "Pengikatan"]);
    assert.deepEqual(labels("asuransi"), ["Nomor SP3", "Nilai Asuransi"]);
  });

  it("Document Verification: 10 kategori utama dengan urutan spesifikasi (tanpa tiga poin duplikat)", () => {
    assert.equal(DOCUMENT_CATEGORIES.length, 10);
    assert.deepEqual(
      DOCUMENT_CATEGORIES.map((c) => c.title),
      [
        "Underlying Transaction",
        "Identitas Debitur",
        "Identitas Beneficiary",
        "Identitas Usaha Debitur",
        "Surat Utang",
        "Pengikatan Agunan",
        "Bukti Kepemilikan Agunan",
        "Pemeriksaan Agunan",
        "Paket Bank Garansi",
        "Surat-Surat Lainnya",
      ],
    );
  });

  it("teks peringatan dan pesan blokir memakai urutan sumber baru", () => {
    assert.equal(MISMATCH_WARNING_TITLE, "Ketidaksesuaian Informasi");
    assert.match(MISMATCH_WARNING_TEXT, /Ditemukan satu atau lebih critical field yang tidak sesuai/);
    assert.match(
      MISMATCH_WARNING_ACTION,
      /Underlying Document, Memorandum Analisa Bank Garansi, dan Putusan Bank Garansi/,
    );
    assert.match(MISMATCH_WARNING_TEXT, /sebelum checklist dilanjutkan/);
    const block = mismatchBlockText(2);
    assert.match(block, /Masih ada 2 informasi TIDAK SESUAI pada Critical Field Validation/);
    assert.match(
      block,
      /Underlying Document, Memorandum Analisa Bank Garansi, dan Putusan Bank Garansi/,
    );
    assert.match(block, /sebelum melanjutkan ke Opini ADK/);
  });
});

describe("Nilai Bank Garansi", () => {
  it("4,000,000 pada ketiga sumber => SESUAI (separator tidak relevan)", () => {
    assert.equal(state(makeAmount(["4000000", "4000000", "4000000"])), "SESUAI");
    assert.equal(state(makeAmount(["4000000", "4000000.00", "04000000"])), "SESUAI");
  });

  it("salah satu berbeda => TIDAK SESUAI dan sumbernya ditandai", () => {
    const evaluation = evaluateField(makeAmount(["4000000", "4000000", "4500000"]));
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.deepEqual(evaluation.deviating, { ptk: false, mak: true });
  });

  it("selisih satu rupiah => TIDAK SESUAI", () => {
    assert.equal(state(makeAmount(["4000000", "4000001", "4000000"])), "TIDAK SESUAI");
  });

  it("mata uang berbeda => TIDAK SESUAI", () => {
    assert.equal(
      state(makeAmount(["4000000", "4000000", "4000000"], ["IDR", "USD", "IDR"])),
      "TIDAK SESUAI",
    );
  });

  it("kosong di semua sumber => BELUM LENGKAP, bukan SESUAI", () => {
    assert.equal(state(makeAmount(["", "", ""])), "BELUM LENGKAP");
  });

  it("satu sumber kosong => BELUM LENGKAP; perbedaan baru disimpulkan setelah ketiga sumber terisi", () => {
    assert.equal(state(makeAmount(["4000000", "4000000", ""])), "BELUM LENGKAP");
    assert.equal(state(makeAmount(["4000000", "5000000", ""])), "BELUM LENGKAP");
    assert.equal(state(makeAmount(["4000000", "5000000", "4000000"])), "TIDAK SESUAI");
  });

  it("tampilan di output memakai separator ribuan", () => {
    const field = makeAmount(["1250000000", "1250000000", "1250000000"]);
    assert.equal(getSourceText(field, "underlyingDocument"), "IDR 1,250,000,000");
    assert.equal(getSourceText(makeAmount(["", "", ""]), "ptk"), "");
  });
});

describe("Jangka Waktu", () => {
  const range = (start: string, end: string): [string, string] => [start, end];
  const base = range("2026-10-01", "2027-10-01");

  it("semua tanggal sama => SESUAI", () => {
    assert.equal(state(makePeriod(base, base, base)), "SESUAI");
  });

  it("tanggal akhir berbeda => TIDAK SESUAI, dengan keterangan komponen", () => {
    const field = makePeriod(base, base, range("2026-10-01", "2027-10-02"));
    const evaluation = evaluateField(field);
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.deepEqual(evaluation.deviating, { ptk: false, mak: true });
    assert.deepEqual(evaluation.reasons, ["Tanggal akhir: Memorandum Analisa Bank Garansi berbeda dengan Underlying Document"]);
  });

  it("tanggal mulai berbeda => TIDAK SESUAI", () => {
    const field = makePeriod(base, range("2026-10-02", "2027-10-01"), base);
    const evaluation = evaluateField(field);
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.deepEqual(evaluation.reasons, ["Tanggal mulai: Putusan Bank Garansi berbeda dengan Underlying Document"]);
  });

  it("dibandingkan sebagai tanggal, bukan teks", () => {
    // Durasi sama (365 hari) tetapi tanggalnya berbeda => tetap TIDAK SESUAI.
    const shifted = range("2026-10-02", "2027-10-02");
    assert.equal(state(makePeriod(base, base, shifted)), "TIDAK SESUAI");
  });

  it("kosong semua => BELUM LENGKAP", () => {
    assert.equal(state(makePeriod(["", ""], ["", ""], ["", ""])), "BELUM LENGKAP");
  });

  it("salah satu sumber hanya terisi tanggal mulai => BELUM LENGKAP", () => {
    assert.equal(state(makePeriod(base, base, range("2026-10-01", ""))), "BELUM LENGKAP");
  });

  it("tanggal akhir sebelum mulai => tidak valid, BELUM LENGKAP (tidak pernah SESUAI)", () => {
    const reversed = range("2027-10-01", "2026-10-01");
    const evaluation = evaluateField(makePeriod(reversed, reversed, reversed));
    assert.equal(evaluation.state, "BELUM LENGKAP");
    assert.equal(evaluation.invalid.length, 3);
    assert.equal(evaluation.invalid[0].message, "Tanggal akhir lebih awal dari tanggal mulai");
  });

  it("tampilan: rentang + durasi per sumber", () => {
    const field = makePeriod(base, base, range("2026-10-01", ""));
    assert.deepEqual(
      getSourceLines(field, "underlyingDocument").map((l) => l.text),
      ["01/10/2026 s.d. 01/10/2027", "Durasi: 365 hari"],
    );
    assert.deepEqual(
      getSourceLines(field, "mak").map((l) => l.text),
      ["01/10/2026 s.d. -", "Durasi: belum tersedia"],
    );
    assert.deepEqual(getSourceLines(makePeriod(["", ""], ["", ""], ["", ""]), "ptk"), []);
  });
});

describe("Biaya (komponen dibandingkan terpisah; Notaris & Lainnya = field tambahan ADK)", () => {
  const BASE: FeeTuple = ["500000", "250000", "150000", "75000"];
  const with_ = (patch: Partial<Record<0 | 1 | 2 | 3, string>>): FeeTuple => {
    const next = [...BASE] as FeeTuple;
    for (const [index, value] of Object.entries(patch)) next[Number(index)] = value;
    return next;
  };

  it("semua komponen lengkap dan sama => SESUAI", () => {
    assert.equal(state(makeFees(BASE, BASE, BASE)), "SESUAI");
  });

  it("setiap komponen punya hasil sendiri pada baris Biaya", () => {
    const evaluation = evaluateField(makeFees(BASE, BASE, BASE));
    assert.deepEqual(
      evaluation.components.map((c) => [c.label, c.state]),
      [
        ["Provisi", "SESUAI"],
        ["Administrasi", "SESUAI"],
        ["Notaris", "SESUAI"],
        ["Lainnya", "SESUAI"],
      ],
    );
  });

  for (const [index, label] of [
    [0, "Provisi"],
    [1, "Administrasi"],
    [2, "Notaris"],
    [3, "Lainnya"],
  ] as const) {
    it(`${label} berbeda pada Putusan => hanya komponen ${label} TIDAK SESUAI`, () => {
      const evaluation = evaluateField(makeFees(BASE, with_({ [index]: "999999" }), BASE));
      assert.equal(evaluation.state, "TIDAK SESUAI");
      assert.equal(evaluation.hasMismatch, true);
      assert.deepEqual(evaluation.reasons, [
        `${label}: Putusan Bank Garansi berbeda dengan Underlying Document`,
      ]);
      assert.deepEqual(evaluation.deviating, { ptk: true, mak: false });
      const results = getComponentResults(evaluation.components);
      assert.deepEqual(
        results.map((r) => [r.label, r.state]),
        TEST_FEE_COMPONENTS.map((c) => [c.label, c.label === label ? "TIDAK SESUAI" : "SESUAI"]),
      );
    });
  }

  it("Memorandum berbeda => keterangan menyebut Memorandum Analisa Bank Garansi", () => {
    const evaluation = evaluateField(makeFees(BASE, BASE, with_({ 1: "300000" })));
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.deepEqual(evaluation.reasons, [
      "Administrasi: Memorandum Analisa Bank Garansi berbeda dengan Underlying Document",
    ]);
  });

  it("komponen tidak digabung: nilai tertukar tetap TIDAK SESUAI", () => {
    const evaluation = evaluateField(
      makeFees(BASE, with_({ 0: "250000", 1: "500000" }), BASE),
    );
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.equal(evaluation.reasons.length, 2);
  });

  it("komponen kosong => BELUM LENGKAP, bukan SESUAI", () => {
    assert.equal(state(makeFees(BASE, BASE, with_({ 2: "" }))), "BELUM LENGKAP");
    assert.equal(state(makeFees(BASE, BASE, with_({ 3: "" }))), "BELUM LENGKAP");
    const blank: FeeTuple = ["", "", "", ""];
    assert.equal(state(makeFees(blank, blank, blank)), "BELUM LENGKAP");
  });

  it("N pada 'Belum lengkap : N field belum terisi' = jumlah sumber yang punya komponen kosong", () => {
    const one = evaluateField(makeFees(BASE, BASE, with_({ 2: "" })));
    assert.equal(one.incompleteCount, 1);
    assert.equal(matchStateNote(one), "Belum lengkap : 1 field belum terisi");
    const blank: FeeTuple = ["", "", "", ""];
    const all = evaluateField(makeFees(blank, blank, blank));
    assert.equal(all.incompleteCount, 3);
    assert.equal(matchStateNote(all), "Belum lengkap : 3 field belum terisi");
  });

  it("komponen yang lengkap tetap dinilai walau komponen lain belum terisi", () => {
    // Provisi lengkap & berbeda; Notaris kosong di Memorandum.
    const field = makeFees(BASE, with_({ 0: "999999" }), with_({ 2: "" }));
    const evaluation = evaluateField(field);
    assert.equal(evaluation.state, "BELUM LENGKAP"); // baris tetap belum lengkap
    assert.equal(evaluation.hasMismatch, true); // tetapi TIDAK SESUAI pada Provisi terlihat
    const results = getComponentResults(evaluation.components);
    assert.equal(results.find((r) => r.label === "Provisi")?.state, "TIDAK SESUAI");
    assert.equal(results.find((r) => r.label === "Notaris")?.state, "BELUM LENGKAP");
    assert.equal(
      results.find((r) => r.label === "Notaris")?.note,
      "Belum lengkap : 1 field belum terisi",
    );
    assert.equal(results.find((r) => r.label === "Administrasi")?.state, "SESUAI");
  });

  it("komponen yang belum terisi di semua sumber tidak menyimpulkan apa pun", () => {
    const field = makeFees(
      ["500000", "", "", ""],
      ["600000", "", "", ""],
      ["500000", "", "", ""],
    );
    const evaluation = evaluateField(field);
    assert.equal(evaluation.state, "BELUM LENGKAP");
    const results = getComponentResults(evaluation.components);
    assert.equal(results.find((r) => r.label === "Administrasi")?.state, "BELUM LENGKAP");
    assert.equal(results.find((r) => r.label === "Provisi")?.state, "TIDAK SESUAI");
  });

  it("'Tidak tercantum' pada komponen Biaya dihitung terisi", () => {
    const tt = with_({ 0: "Tidak tercantum" });
    assert.equal(state(makeFees(tt, tt, tt)), "SESUAI");
    assert.equal(state(makeFees(tt, BASE, tt)), "TIDAK SESUAI");
  });

  it("nominal dibandingkan sebagai angka: format berbeda tetap sama", () => {
    assert.equal(
      state(
        makeFees(
          BASE,
          ["500,000", "Rp 250.000", "150,000.00", "75000"],
          ["500000.00", "250,000", "150000", "75,000"],
        ),
      ),
      "SESUAI",
    );
  });

  it("tampilan memuat keempat komponen per sumber", () => {
    const field = makeFees(BASE, with_({ 1: "" }), ["", "", "", ""]);
    assert.deepEqual(
      getSourceLines(field, "underlyingDocument").map((l) => l.text),
      ["Provisi: 500,000", "Administrasi: 250,000", "Notaris: 150,000", "Lainnya: 75,000"],
    );
    assert.deepEqual(
      getSourceLines(field, "ptk").map((l) => l.text),
      ["Provisi: 500,000", "Administrasi: -", "Notaris: 150,000", "Lainnya: 75,000"],
    );
    assert.deepEqual(getSourceLines(field, "mak"), []);
  });
});

describe("Underlying / Dasar Penerbitan (satu field bersama)", () => {
  it("terisi => BERSAMA; tidak dibandingkan antar sumber", () => {
    const evaluation = evaluateField(makeShared("Kontrak No. 123/ABC/2026"));
    assert.equal(evaluation.state, "BERSAMA");
    assert.equal(evaluation.hasMismatch, false);
    assert.equal(evaluation.incompleteCount, 0);
    assert.equal(matchStateLabel("BERSAMA"), "Informasi bersama");
  });

  it("kosong atau hanya spasi => BELUM LENGKAP (1 field)", () => {
    for (const value of ["", "   ", "\n"]) {
      const evaluation = evaluateField(makeShared(value));
      assert.equal(evaluation.state, "BELUM LENGKAP");
      assert.equal(matchStateNote(evaluation), "Belum lengkap : 1 field belum terisi");
    }
  });

  it("ditampilkan sebagai satu isian", () => {
    assert.deepEqual(
      getSharedLines(makeShared("Kontrak 1\nPO 2")).map((l) => l.text),
      ["Kontrak 1\nPO 2"],
    );
    assert.deepEqual(getSharedLines(makeShared("")), []);
  });
});

describe("Kontra Garansi (multi jenis & item)", () => {
  const fa = fullKontraDetail("fixedAsset");
  const kv = fullKontraDetail("kendaraan");
  const allSources = (detail: Record<string, string>) => ({
    underlyingDocument: detail,
    mak: detail,
    ptk: detail,
  });

  it("belum ada item => BELUM LENGKAP dengan N = 3", () => {
    const evaluation = evaluateField(makeKontra([]));
    assert.equal(evaluation.state, "BELUM LENGKAP");
    assert.equal(matchStateNote(evaluation), "Belum lengkap : 3 field belum terisi");
    assert.equal(evaluation.hasMismatch, false);
  });

  it("satu item lengkap dan sama pada tiga sumber => SESUAI", () => {
    const evaluation = evaluateField(makeKontra([makeKontraItem("fixedAsset", allSources(fa))]));
    assert.equal(evaluation.state, "SESUAI");
    assert.equal(evaluation.items?.[0].state, "SESUAI");
    assert.equal(evaluation.items?.[0].title, "Fixed Asset #1");
  });

  it("beberapa item dan jenis dinilai sendiri-sendiri", () => {
    const field = makeKontra([
      makeKontraItem("fixedAsset", allSources(fa)),
      makeKontraItem("fixedAsset", allSources(fa)),
      makeKontraItem("kendaraan", allSources(kv)),
    ]);
    const evaluation = evaluateField(field);
    assert.deepEqual(
      evaluation.items?.map((i) => [i.title, i.state]),
      [
        ["Fixed Asset #1", "SESUAI"],
        ["Fixed Asset #2", "SESUAI"],
        ["Kendaraan #1", "SESUAI"],
      ],
    );
    assert.equal(evaluation.state, "SESUAI");
  });

  it("perbedaan pada satu field detail => item TIDAK SESUAI dengan alasan yang menyebut field itu", () => {
    const field = makeKontra([
      makeKontraItem("fixedAsset", {
        underlyingDocument: fa,
        mak: fa,
        ptk: { ...fa, noShm: "SHM 99999" },
      }),
    ]);
    const evaluation = evaluateField(field);
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.equal(evaluation.hasMismatch, true);
    const item = evaluation.items![0];
    assert.equal(item.state, "TIDAK SESUAI");
    assert.deepEqual(
      item.fields.filter((f) => f.evaluation.state === "TIDAK SESUAI").map((f) => f.label),
      ["Nomor SHM"],
    );
    assert.match(item.reasons[0], /^Nomor SHM: /);
  });

  it("nilai nominal Kontra dibandingkan sebagai angka", () => {
    const field = makeKontra([
      makeKontraItem("kendaraan", {
        underlyingDocument: { ...kv, nilaiKendaraan: "500000000" },
        mak: { ...kv, nilaiKendaraan: "500000000.00" },
        ptk: { ...kv, nilaiKendaraan: "0500000000" },
      }),
    ]);
    assert.equal(state(field), "SESUAI");
  });

  it("detail kosong => item Belum lengkap dengan N = jumlah isian kosong", () => {
    const partial = { ...fa, noShm: "" };
    const item = makeKontraItem("fixedAsset", {
      underlyingDocument: partial,
      mak: fa,
      ptk: fa,
    });
    const evaluation = evaluateField(makeKontra([item]));
    assert.equal(evaluation.state, "BELUM LENGKAP");
    assert.equal(evaluation.items![0].incompleteCount, 1);
    assert.equal(matchStateNote(evaluation.items![0]), "Belum lengkap : 1 field belum terisi");
    // Seluruh isian kosong: 4 field x 3 sumber untuk Fixed Asset.
    const blank = evaluateField(makeKontra([makeKontraItem("fixedAsset")]));
    assert.equal(blank.items![0].incompleteCount, 12);
    assert.equal(blank.incompleteCount, 12);
  });

  it("item yang lengkap tetap menampilkan hasilnya walau item lain belum lengkap", () => {
    const field = makeKontra([
      makeKontraItem("fixedAsset", {
        underlyingDocument: fa,
        mak: fa,
        ptk: { ...fa, noShm: "SHM 99999" },
      }),
      makeKontraItem("kendaraan"),
    ]);
    const evaluation = evaluateField(field);
    assert.equal(evaluation.state, "BELUM LENGKAP");
    assert.equal(evaluation.hasMismatch, true);
    assert.equal(evaluation.items![0].state, "TIDAK SESUAI");
    assert.equal(evaluation.items![1].state, "BELUM LENGKAP");
  });

  it("jenis dan jumlah item masing-masing: Cash Collateral dan Asuransi", () => {
    const cc = fullKontraDetail("cashCollateral");
    const as = fullKontraDetail("asuransi");
    const field = makeKontra([
      makeKontraItem("cashCollateral", allSources(cc)),
      makeKontraItem("asuransi", allSources(as)),
    ]);
    const evaluation = evaluateField(field);
    assert.deepEqual(
      evaluation.items?.map((i) => i.title),
      ["Cash Collateral #1", "Asuransi (SP3) #1"],
    );
    assert.equal(evaluation.state, "SESUAI");
    assert.equal(evaluation.items![1].fields.length, 2); // Nomor SP3, Nilai Asuransi
  });

  it("tampilan detail: teks dan nominal diformat, kosong ditandai", () => {
    const item = makeKontraItem("fixedAsset", {
      underlyingDocument: { ...fa, nilaiNpw: "500000000" },
    });
    const evaluation = evaluateField(makeKontra([item]));
    const npw = evaluation.items![0].fields.find((f) => f.label === "Nilai (NPW)")!;
    const lines = getKontraDetailLines(npw, item.values.underlyingDocument, "underlyingDocument");
    assert.ok(lines.some((l) => l.text.includes("500,000,000")));
  });
});

describe("field teks tanpa perubahan perilaku", () => {
  it("Jenis, Tujuan, Beneficiary", () => {
    assert.equal(state(makeText("jenisBg", "Performance Bond", "Performance Bond", "Performance Bond")), "SESUAI");
    assert.equal(state(makeText("jenisBg", "Performance Bond", "Payment Bond", "Performance Bond")), "TIDAK SESUAI");
    assert.equal(state(makeText("tujuanBg", "Jaminan proyek", "jaminan  proyek", "JAMINAN PROYEK")), "SESUAI");
    assert.equal(state(makeText("beneficiary", "PT INBISCO", "PT INBISCO", "PT INBISCO NIAGATAMA")), "TIDAK SESUAI");
  });
});

describe("ringkasan dan peringatan global", () => {
  const complete = makeText("jenisBg", "Performance Bond", "Performance Bond", "Performance Bond", 1);
  const mismatch = makeText("beneficiary", "PT A", "PT A", "PT B", 3);
  const incomplete = makeAmount(["", "", ""]);

  it("mismatch dan belum lengkap dihitung terpisah", () => {
    const summary = summarizeValidation([complete, mismatch, incomplete]);
    assert.equal(summary.total, 3);
    assert.equal(summary.match, 1);
    assert.equal(summary.mismatch, 1);
    assert.equal(summary.incomplete, 1);
    assert.deepEqual(summary.mismatchLabels, ["Beneficiary"]);
    assert.deepEqual(summary.incompleteLabels, ["Nilai Bank Garansi"]);
  });

  it("semua kosong tidak pernah dihitung sesuai", () => {
    const summary = summarizeValidation([incomplete, makePeriod(["", ""], ["", ""], ["", ""])]);
    assert.equal(summary.match, 0);
    assert.equal(summary.mismatch, 0);
    assert.equal(summary.incomplete, 2);
  });

  it("label status untuk dokumen", () => {
    assert.equal(matchStateLabel("SESUAI"), "SESUAI");
    assert.equal(matchStateLabel("TIDAK SESUAI"), "TIDAK SESUAI");
    assert.equal(matchStateLabel("BELUM LENGKAP"), "Belum lengkap");
  });
});
