import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDateMask } from "../input/date-mask";
import {
  calculateDurationDays,
  DURATION_RULE_NOTE,
  displayToIso,
  formatDuration,
  formatPeriodRange,
  getPeriodStatus,
  isoToDisplay,
  isoToUtcDate,
  isValidIsoDate,
} from "./period";

describe("Jangka Waktu: format tanggal dd/mm/yyyy", () => {
  it("ISO <-> tampilan", () => {
    assert.equal(isoToDisplay("2026-10-01"), "01/10/2026");
    assert.equal(displayToIso("01/10/2026"), "2026-10-01");
    assert.equal(isoToDisplay(""), "");
    assert.equal(displayToIso("1/10/2026"), null);
    assert.equal(displayToIso("31/02/2026"), null);
  });

  it("validasi kalender (termasuk tahun kabisat)", () => {
    assert.equal(isValidIsoDate("2028-02-29"), true);
    assert.equal(isValidIsoDate("2027-02-29"), false);
    assert.equal(isValidIsoDate("2026-13-01"), false);
    assert.equal(isValidIsoDate("garbage"), false);
  });

  it("mask mengetik menyisipkan garis miring otomatis", () => {
    assert.equal(formatDateMask("0"), "0");
    assert.equal(formatDateMask("01"), "01");
    assert.equal(formatDateMask("011"), "01/1");
    assert.equal(formatDateMask("0110"), "01/10");
    assert.equal(formatDateMask("01102"), "01/10/2");
    assert.equal(formatDateMask("01102026"), "01/10/2026");
    assert.equal(formatDateMask("01/10/2026999"), "01/10/2026");
    assert.equal(formatDateMask("ab01/10"), "01/10");
  });

  it("tanggal: tengah malam UTC", () => {
    assert.equal(isoToUtcDate("2026-10-01")?.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(isoToUtcDate("nope"), null);
  });
});

describe("Jangka Waktu: durasi hari (satu fungsi: calculateDurationDays)", () => {
  it("01/10/2026 s.d. 01/10/2027 = 365 hari (contoh spesifikasi)", () => {
    assert.equal(calculateDurationDays("2026-10-01", "2027-10-01"), 365);
  });

  it("tahun kabisat", () => {
    assert.equal(calculateDurationDays("2027-10-01", "2028-10-01"), 366);
    assert.equal(calculateDurationDays("2028-02-28", "2028-03-01"), 2);
  });

  it("tidak inklusif: tanggal sama = 0 hari, berurutan = 1 hari", () => {
    assert.equal(calculateDurationDays("2026-10-01", "2026-10-01"), 0);
    assert.equal(calculateDurationDays("2026-10-01", "2026-10-02"), 1);
  });

  it("aman terhadap pergantian bulan, tahun, dan DST (UTC)", () => {
    assert.equal(calculateDurationDays("2026-12-31", "2027-01-01"), 1);
    assert.equal(calculateDurationDays("2026-03-28", "2026-03-30"), 2);
    assert.equal(calculateDurationDays("2026-10-25", "2026-10-26"), 1);
  });

  it("tanggal akhir sebelum mulai => null (tidak valid)", () => {
    assert.equal(calculateDurationDays("2027-10-01", "2026-10-01"), null);
  });

  it("tanggal kosong/tidak valid => null", () => {
    assert.equal(calculateDurationDays("", "2027-10-01"), null);
    assert.equal(calculateDurationDays("2026-10-01", ""), null);
    assert.equal(calculateDurationDays("2026-02-31", "2027-10-01"), null);
  });

  it("aturan hitung terdokumentasi", () => {
    assert.match(DURATION_RULE_NOTE, /tidak inklusif/);
  });
});

describe("Jangka Waktu: status isian", () => {
  it("kosong", () => {
    const s = getPeriodStatus({ start: "", end: "" });
    assert.equal(s.state, "empty");
    assert.equal(s.days, null);
  });

  it("belum lengkap (salah satu tanggal): durasi tidak menyesatkan", () => {
    const s = getPeriodStatus({ start: "2026-10-01", end: "" });
    assert.equal(s.state, "partial");
    assert.equal(s.days, null);
    assert.equal(formatDuration(s.days), "Belum tersedia");
  });

  it("valid: durasi dihitung", () => {
    const s = getPeriodStatus({ start: "2026-10-01", end: "2027-10-01" });
    assert.equal(s.state, "valid");
    assert.equal(s.days, 365);
    assert.equal(formatDuration(s.days), "365 hari");
  });

  it("tanggal akhir sebelum tanggal mulai ditandai tidak valid", () => {
    const s = getPeriodStatus({ start: "2027-10-01", end: "2026-10-01" });
    assert.equal(s.state, "invalid");
    assert.equal(s.endValid, false);
    assert.equal(s.endMessage, "Tanggal akhir lebih awal dari tanggal mulai");
    assert.equal(s.days, null);
  });

  it("tanggal yang tidak terbaca ditandai tidak valid", () => {
    const s = getPeriodStatus({ start: "2026-02-31", end: "2027-10-01" });
    assert.equal(s.state, "invalid");
    assert.equal(s.startValid, false);
    assert.equal(s.startMessage, "Tanggal mulai tidak valid");
  });

  it("rentang ditampilkan sebagai '01/10/2026 s.d. 01/10/2027'", () => {
    assert.equal(
      formatPeriodRange({ start: "2026-10-01", end: "2027-10-01" }),
      "01/10/2026 s.d. 01/10/2027",
    );
    assert.equal(formatPeriodRange({ start: "2026-10-01", end: "" }), "01/10/2026 s.d. -");
    assert.equal(formatPeriodRange({ start: "", end: "" }), "");
  });
});
