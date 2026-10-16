import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fullKontraDetail,
  makeAmount,
  makeFees,
  makeKontra,
  makeKontraItem,
  makePeriod,
  makeShared,
  makeText,
} from "../checklist/test-utils";
import type { CriticalField } from "../checklist/types";
import { formatAmount, normalizeDates, normalizeText, parseAmount } from "./normalize";
import {
  calculateThreeWayMatch,
  getDeviatingSources,
  getMatchState,
  hasMismatch,
  isFullyMatched,
  recalculateMatches,
  summarizeValidation,
} from "./three-way-match";

describe("calculateThreeWayMatch - contoh dari spesifikasi", () => {
  it("PT INBISCO x3 => SESUAI", () => {
    assert.equal(calculateThreeWayMatch("PT INBISCO", "PT INBISCO", "PT INBISCO"), "SESUAI");
  });

  it("MAK = PT INBISCO NIAGATAMA => TIDAK SESUAI", () => {
    assert.equal(
      calculateThreeWayMatch("PT INBISCO", "PT INBISCO", "PT INBISCO NIAGATAMA"),
      "TIDAK SESUAI",
    );
  });

  it("PT ABC vs PT ABCD tetap berbeda", () => {
    assert.equal(calculateThreeWayMatch("PT ABC", "PT ABCD", "PT ABC"), "TIDAK SESUAI");
    assert.equal(calculateThreeWayMatch("PT ABC", "PT ABC", "PT ABCD"), "TIDAK SESUAI");
    assert.equal(calculateThreeWayMatch("PT ABC", "PT ABC", "PT ABC"), "SESUAI");
  });

  it("PTK != MAK walau keduanya sama-sama beda dari Underlying", () => {
    assert.equal(calculateThreeWayMatch("PT A", "PT B", "PT C"), "TIDAK SESUAI");
  });
});

describe("normalisasi teks", () => {
  it("abaikan spasi, kapitalisasi, whitespace ganda & non-breaking space", () => {
    assert.equal(
      calculateThreeWayMatch("  pt   inbisco ", "PT INBISCO", "Pt Inbisco"),
      "SESUAI",
    );
  });

  it("titik singkatan tidak dianggap perbedaan", () => {
    assert.equal(normalizeText("PT. INBISCO"), normalizeText("PT INBISCO"));
    assert.equal(normalizeText("P.T. Inbisco, Tbk."), normalizeText("PT Inbisco Tbk"));
  });

  it("karakter unicode: kutip & dash tipografis", () => {
    assert.equal(normalizeText("CV Maju – Jaya"), normalizeText("CV Maju - Jaya"));
    assert.equal(normalizeText("Toko “Berkah”"), normalizeText('Toko "Berkah"'));
  });

  it("angka dalam teks tidak diubah (nomor kontrak tetap spesifik)", () => {
    assert.notEqual(
      normalizeText("Kontrak No. 123/ABC/2026"),
      normalizeText("Kontrak No. 124/ABC/2026"),
    );
  });

  it("kata berbeda tidak pernah dianggap sama", () => {
    assert.notEqual(normalizeText("PT Maju Jaya"), normalizeText("PT Maju Jaya Abadi"));
  });
});

describe("pembaca tanggal & nominal teks (dipakai migrasi data lama)", () => {
  it("berbagai format tanggal menjadi ISO", () => {
    assert.equal(normalizeDates("14 September 2026"), "2026-09-14");
    assert.equal(normalizeDates("14/09/2026"), "2026-09-14");
    assert.equal(normalizeDates("14-9-2026"), "2026-09-14");
    assert.equal(normalizeDates("2026-09-14"), "2026-09-14");
    assert.equal(normalizeDates("14 Sep 2026"), "2026-09-14");
    assert.equal(normalizeDates("1 Agustus 2026"), "2026-08-01");
  });

  it("tanggal tidak valid dibiarkan agar tetap terlihat berbeda", () => {
    assert.equal(normalizeDates("31/02/2026"), "31/02/2026");
  });

  it("parsing ribuan vs desimal", () => {
    assert.deepEqual(parseAmount("1.500"), { currency: "IDR", value: "1500" });
    assert.deepEqual(parseAmount("1,500"), { currency: "IDR", value: "1500" });
    assert.deepEqual(parseAmount("1.5"), { currency: "IDR", value: "1.5" });
    assert.deepEqual(parseAmount("USD 1.500,25"), { currency: "USD", value: "1500.25" });
    assert.deepEqual(parseAmount("USD 1,500.25"), { currency: "USD", value: "1500.25" });
    assert.deepEqual(parseAmount("0.500"), { currency: "IDR", value: "0.5" });
  });

  it("teks yang bukan nominal murni => null", () => {
    assert.equal(parseAmount("Rp 400 juta"), null);
    assert.equal(parseAmount("empat ratus juta"), null);
    assert.equal(parseAmount("1.00.000"), null);
    assert.equal(parseAmount("-400.000"), null);
  });

  it("formatAmount", () => {
    assert.equal(formatAmount({ currency: "IDR", value: "400000000" }), "IDR 400.000.000");
    assert.equal(formatAmount({ currency: "USD", value: "1500.25" }), "USD 1.500,25");
  });
});

describe("dropdown (Jenis Bank Garansi, Kontra Garansi)", () => {
  it("harus persis sama", () => {
    assert.equal(
      calculateThreeWayMatch("Performance Bond", "Performance Bond", "Performance Bond", "select"),
      "SESUAI",
    );
    assert.equal(
      calculateThreeWayMatch("Performance Bond", "Payment Bond", "Performance Bond", "select"),
      "TIDAK SESUAI",
    );
  });
});

describe("state tampilan & data kosong", () => {
  it("semua kosong tidak pernah SESUAI", () => {
    assert.equal(calculateThreeWayMatch("", "", ""), "TIDAK SESUAI");
    assert.equal(getMatchState("text", "", "", ""), "BELUM LENGKAP");
  });

  it("satu sumber kosong => BELUM LENGKAP bila yang terisi sama", () => {
    assert.equal(getMatchState("text", "PT A", "PT A", ""), "BELUM LENGKAP");
    assert.equal(calculateThreeWayMatch("PT A", "PT A", ""), "TIDAK SESUAI");
  });

  it("sumber ketiga kosong => BELUM LENGKAP, bukan TIDAK SESUAI (walau dua sumber berbeda)", () => {
    assert.equal(getMatchState("text", "PT A", "PT B", ""), "BELUM LENGKAP");
    assert.equal(getMatchState("text", "", "PT A", "PT B"), "BELUM LENGKAP");
  });

  it("'Tidak tercantum' dihitung terisi dan dibandingkan seperti teks biasa", () => {
    assert.equal(
      getMatchState("text", "Tidak tercantum", "Tidak tercantum", "Tidak tercantum"),
      "SESUAI",
    );
    assert.equal(getMatchState("text", "Tidak tercantum", " tidak  TERCANTUM ", "Tidak tercantum"), "SESUAI");
    assert.equal(getMatchState("text", "PT A", "Tidak tercantum", "PT A"), "TIDAK SESUAI");
    assert.equal(getMatchState("text", "Tidak tercantum", "Tidak tercantum", ""), "BELUM LENGKAP");
  });

  it("spasi saja dianggap kosong", () => {
    assert.equal(getMatchState("text", "PT A", "PT A", "   "), "BELUM LENGKAP");
  });

  it("sel yang menyimpang dari Underlying ditandai", () => {
    assert.deepEqual(getDeviatingSources("text", "PT A", "PT A", "PT AB"), { ptk: false, mak: true });
    assert.deepEqual(getDeviatingSources("text", "PT A", "PT B", "PT B"), { ptk: true, mak: true });
    assert.deepEqual(getDeviatingSources("text", "", "PT B", "PT C"), { ptk: false, mak: false });
  });
});

describe("level checklist (8 critical field bertipe)", () => {
  const detail = fullKontraDetail("fixedAsset");
  const sameItem = makeKontraItem("fixedAsset", {
    underlyingDocument: detail,
    mak: detail,
    ptk: detail,
  });
  const fields: CriticalField[] = [
    makeText("jenisBg", "Performance Bond", "Performance Bond", "Performance Bond"),
    makeText("beneficiary", "PT INBISCO", "PT INBISCO", "PT INBISCO NIAGATAMA", 3),
    makeAmount(["400000000", "399000000", "400000000"]),
    makePeriod(["2026-10-01", "2027-10-01"], ["", ""], ["", ""]),
    makeFees(
      ["500000", "250000", "150000", "75000"],
      ["500000", "250000", "150000", "75000"],
      ["500000", "250000", "150000", "75000"],
    ),
    makeKontra([sameItem]),
    makeShared("Kontrak No. 123/ABC/2026"),
  ];

  it("hasMismatch & summarizeValidation memisahkan mismatch, belum lengkap, dan informasi bersama", () => {
    assert.equal(hasMismatch(fields), true);
    const summary = summarizeValidation(fields);
    assert.equal(summary.total, 7);
    assert.equal(summary.match, 3); // Jenis BG, Biaya, Kontra Garansi
    assert.equal(summary.mismatch, 2);
    assert.equal(summary.incomplete, 1);
    assert.equal(summary.shared, 1); // Underlying / Dasar Penerbitan: tidak dibandingkan
    assert.deepEqual(summary.mismatchLabels, ["Beneficiary", "Nilai Bank Garansi"]);
    assert.deepEqual(summary.incompleteLabels, ["Jangka Waktu"]);
  });

  it("Underlying bersama tidak pernah dihitung SESUAI maupun mismatch", () => {
    const only = summarizeValidation([fields[6]]);
    assert.equal(only.match, 0);
    assert.equal(only.mismatch, 0);
    assert.equal(only.shared, 1);
    assert.equal(only.allSourcesFilled, true);
  });

  it("isFullyMatched: field bersama tidak menghalangi 'seluruh sesuai'; mismatch/belum lengkap menghalangi", () => {
    const clean = [fields[0], fields[4], fields[5], fields[6]];
    const summary = summarizeValidation(clean);
    assert.equal(summary.match + summary.shared, summary.total);
    assert.equal(summary.match < summary.total, true); // pemeriksaan lama (match === total) keliru
    assert.equal(isFullyMatched(summary), true);
    assert.equal(isFullyMatched(summarizeValidation(fields)), false);
    assert.equal(isFullyMatched(summarizeValidation([fields[3]])), false); // belum lengkap
    assert.equal(isFullyMatched(summarizeValidation([])), false);
  });

  it("hasMismatch false bila semua sesuai / belum lengkap", () => {
    assert.equal(hasMismatch([fields[0], fields[3], fields[4], fields[5], fields[6]]), false);
  });

  it("TIDAK SESUAI di dalam baris yang masih belum lengkap tetap dihitung sebagai mismatch", () => {
    // Provisi berbeda pada Putusan, sementara Notaris pada Memorandum masih kosong.
    const biaya = makeFees(
      ["500000", "250000", "150000", "75000"],
      ["999999", "250000", "150000", "75000"],
      ["500000", "250000", "", "75000"],
    );
    assert.equal(hasMismatch([biaya]), true);
    const summary = summarizeValidation([biaya]);
    assert.equal(summary.mismatch, 1);
    assert.equal(summary.incomplete, 1);
    assert.deepEqual(summary.mismatchLabels, ["Biaya"]);
  });

  it("recalculateMatches mengisi matchStatus", () => {
    const next = recalculateMatches(fields);
    assert.deepEqual(
      next.map((f) => f.matchStatus),
      ["SESUAI", "TIDAK SESUAI", "TIDAK SESUAI", "BELUM LENGKAP", "SESUAI", "SESUAI", "BERSAMA"],
    );
  });
});
