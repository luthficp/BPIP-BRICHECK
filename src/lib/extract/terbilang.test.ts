import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTerbilang } from "./terbilang";

describe("parseTerbilang", () => {
  const cases: [string, number][] = [
    ["Nol Rupiah", 0],
    ["satu rupiah", 1],
    ["sepuluh rupiah", 10],
    ["sebelas", 11],
    ["dua belas", 12],
    ["dua puluh tiga", 23],
    ["seratus", 100],
    ["seratus lima puluh", 150],
    ["dua ratus tiga", 203],
    ["seribu", 1000],
    ["sebelas ribu", 11000],
    ["dua puluh lima ribu tiga ratus", 25300],
    ["Lima Ratus Juta Rupiah", 500000000],
    ["satu milyar lima ratus juta rupiah", 1500000000],
    ["satu miliar", 1000000000],
    ["dua miliar tiga ratus empat puluh lima juta enam ratus tujuh puluh delapan ribu sembilan ratus satu", 2345678901],
    ["Dua Triliun Rupiah", 2000000000000],
    ["seratus juta", 100000000],
    ["dua juta lima ratus ribu", 2500000],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" = ${expected}`, () => {
      assert.equal(parseTerbilang(text), expected);
    });
  }

  it("menerima tanda baca dan huruf besar/kecil", () => {
    assert.equal(parseTerbilang("  LIMA  RATUS, JUTA. rupiah  "), 500000000);
  });

  it("kata tidak dikenal, kosong, atau susunan janggal -> null (tidak ditebak)", () => {
    for (const text of [
      "",
      "rupiah",
      "lima ratus juta rupiah lebih",
      "one million",
      "sesuai permohonan",
      "dua tiga",
      "juta lima",
      "seribu juta",
      "sebelas satu",
      "nol puluh",
      "lima puluh ratus",
      "satu juta dolar",
    ]) {
      assert.equal(parseTerbilang(text), null, text);
    }
  });
});
