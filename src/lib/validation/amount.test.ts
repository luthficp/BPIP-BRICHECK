import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  caretAfterSignificant,
  countSignificantBefore,
  isDigitOrDot,
} from "../input/caret";
import {
  amountKey,
  feeHasSuspiciousDecimal,
  formatAmountValue,
  formatFeeInput,
  formatPastedFee,
  formatThousands,
  isAmountFilled,
  isSuspiciousDecimal,
  normalizeAmountString,
  parseMoneyText,
  parsePastedAmount,
  toCanonicalAmount,
  toFeeKey,
} from "./amount";

/** Format yang dipakai AmountInput saat mengetik. */
const formatTyping = (raw: string) => formatThousands(toCanonicalAmount(raw));

describe("Nilai: koma ribuan otomatis saat mengetik", () => {
  it("contoh dari spesifikasi", () => {
    assert.equal(formatTyping("4000000"), "4,000,000");
    assert.equal(formatTyping("1250000000"), "1,250,000,000");
  });

  it("setiap ketikan menghasilkan format yang benar", () => {
    const expected = ["4", "40", "400", "4,000", "40,000", "400,000", "4,000,000"];
    let typed = "";
    expected.forEach((display, index) => {
      typed = formatTyping(typed + "4000000"[index]);
      assert.equal(typed, display);
    });
  });

  it("input yang sudah ber-koma tetap stabil (idempotent)", () => {
    assert.equal(formatTyping("4,000,000"), "4,000,000");
    assert.equal(formatTyping(formatTyping("1250000000")), "1,250,000,000");
  });

  it("hanya digit yang diterima; huruf dan simbol dibuang", () => {
    assert.equal(formatTyping("Rp 4a0b0"), "400");
    assert.equal(formatTyping("abc"), "");
  });

  it("nol di depan dibuang, nilai 0 tetap 0", () => {
    assert.equal(formatTyping("0004000"), "4,000");
    assert.equal(formatTyping("0"), "0");
  });

  it("desimal: titik tunggal = desimal, titik akhir dipertahankan saat mengetik", () => {
    assert.equal(formatTyping("1250000.5"), "1,250,000.5");
    assert.equal(formatTyping("400000."), "400,000.");
    assert.equal(formatTyping("1,250,000.50"), "1,250,000.50");
  });

  it("batas 15 digit bagian bulat", () => {
    assert.equal(toCanonicalAmount("1234567890123456789"), "123456789012345");
  });
});

describe("Nilai: nilai angka dipisah dari string tampilan dan dibandingkan sebagai angka", () => {
  it("perbedaan pemisah bukan mismatch", () => {
    const variants = ["4000000", "4,000,000", "4.000.000", "4000000.00", "04,000,000"];
    const keys = new Set(
      variants.map((v) => amountKey({ currency: "IDR", amount: toCanonicalAmount(v) })),
    );
    assert.equal(keys.size, 1);
    assert.deepEqual([...keys], ["amt:IDR:4000000"]);
  });

  it("selisih sekecil apa pun adalah perbedaan", () => {
    const a = amountKey({ currency: "IDR", amount: "4000000" });
    assert.notEqual(a, amountKey({ currency: "IDR", amount: "4000001" }));
    assert.notEqual(a, amountKey({ currency: "IDR", amount: "400000" }));
    assert.notEqual(a, amountKey({ currency: "IDR", amount: "4000000.01" }));
  });

  it("mata uang berbeda bukan nilai yang sama", () => {
    assert.notEqual(
      amountKey({ currency: "IDR", amount: "1000" }),
      amountKey({ currency: "USD", amount: "1000" }),
    );
  });

  it("kosong tidak menghasilkan kunci", () => {
    assert.equal(amountKey({ currency: "IDR", amount: "" }), "");
    assert.equal(amountKey({ currency: "IDR", amount: "." }), "");
    assert.equal(isAmountFilled({ currency: "IDR", amount: "" }), false);
    assert.equal(isAmountFilled({ currency: "IDR", amount: "0" }), true);
  });

  it("tampilan konsisten untuk tabel, cetak, dan ekspor", () => {
    assert.equal(formatAmountValue({ currency: "IDR", amount: "4000000" }), "IDR 4,000,000");
    assert.equal(
      formatAmountValue({ currency: "USD", amount: "1250000.50" }),
      "USD 1,250,000.5",
    );
    assert.equal(formatAmountValue({ currency: "IDR", amount: "" }), "");
  });

  it("normalizeAmountString menyamakan bentuk", () => {
    assert.equal(normalizeAmountString("1250000.50"), "1250000.5");
    assert.equal(normalizeAmountString("400000."), "400000");
    assert.equal(normalizeAmountString("007"), "7");
  });

  it("paste gaya dokumen Indonesia dibaca benar", () => {
    assert.deepEqual(parsePastedAmount("Rp 400.000.000,-", "IDR"), {
      currency: "IDR",
      amount: "400000000",
    });
    // Nol desimal di belakang dibuang: 1250000,50 == 1250000.5 sebagai angka.
    assert.deepEqual(parsePastedAmount("1.250.000,50", "IDR"), {
      currency: "IDR",
      amount: "1250000.5",
    });
    assert.deepEqual(parsePastedAmount("USD 1,500.25", "IDR"), {
      currency: "USD",
      amount: "1500.25",
    });
    assert.equal(parsePastedAmount("empat ratus juta", "IDR"), null);
  });

  it("titik dengan 3 digit di belakang diberi peringatan (kemungkinan ribuan Indonesia)", () => {
    assert.equal(isSuspiciousDecimal("400.000"), true);
    assert.equal(isSuspiciousDecimal("400.5"), false);
    assert.equal(isSuspiciousDecimal("400000"), false);
  });
});

describe("Biaya: kunci perbandingan per komponen", () => {
  it("nominal diseragamkan walau penulisannya berbeda", () => {
    const same = ["500000", "500,000", "Rp 500.000,-", "IDR 500,000.00", "Rp500.000"];
    assert.equal(new Set(same.map(toFeeKey)).size, 1);
    assert.equal(toFeeKey("500000"), "amt:IDR:500000");
  });

  it("nominal berbeda, mata uang berbeda => kunci berbeda", () => {
    assert.notEqual(toFeeKey("500000"), toFeeKey("500001"));
    assert.notEqual(toFeeKey("500000"), toFeeKey("USD 500,000"));
  });

  it("persen diseragamkan: 1,25 % == 1.25%", () => {
    assert.equal(toFeeKey("1,25 %"), toFeeKey("1.25%"));
    assert.equal(toFeeKey("1.250%"), toFeeKey("1.25%"));
    assert.notEqual(toFeeKey("1.25%"), toFeeKey("1.5%"));
  });

  it("kosong => tanpa kunci", () => {
    assert.equal(toFeeKey(""), "");
    assert.equal(toFeeKey("   "), "");
  });

  it("format ketikan hanya mengubah isian yang murni angka", () => {
    assert.equal(formatFeeInput("500000"), "500,000");
    assert.equal(formatFeeInput("1.25%"), "1.25%");
    assert.equal(formatFeeInput("Rp500.000"), "Rp500.000");
    assert.equal(formatFeeInput("USD 1,500.25"), "USD 1,500.25");
    assert.equal(formatFeeInput(""), "");
  });

  it("mengetik ke angka yang sudah ber-koma menghitung ulang pengelompokan (bug 5,00000)", () => {
    let typed = "";
    for (const digit of "500000") typed = formatFeeInput(typed + digit);
    assert.equal(typed, "500,000");
    assert.equal(formatFeeInput("5,0000"), "50,000");
    assert.equal(formatFeeInput("1,2500"), "12,500");
    assert.equal(formatFeeInput("1,250"), "1,250");
    assert.equal(formatFeeInput("1,25"), "125"); // backspace dari 1,250
    assert.equal(formatFeeInput("1.250.000"), "1,250,000");
    assert.equal(formatFeeInput("1250000."), "1,250,000.");
    assert.equal(formatFeeInput(","), ",");
  });

  it("paste Biaya: angka murni diseragamkan, selain itu paste biasa", () => {
    assert.equal(formatPastedFee("Rp 500.000,-"), "500,000");
    assert.equal(formatPastedFee("500.000"), "500,000"); // paste dibaca gaya dokumen Indonesia
    assert.equal(formatPastedFee("1,250"), "1,250");
    assert.equal(formatPastedFee("1,5"), "1.5");
    assert.equal(formatPastedFee("USD 1,500.25"), "USD 1,500.25");
    assert.equal(formatPastedFee("1.25%"), null);
    assert.equal(formatPastedFee("sesuai tarif"), null);
  });

  it("peringatan desimal ambigu", () => {
    assert.equal(feeHasSuspiciousDecimal("500.000"), true);
    assert.equal(feeHasSuspiciousDecimal("500.5"), false);
  });

  it("parseMoneyText menolak teks non-nominal", () => {
    assert.equal(parseMoneyText("1.25%"), null);
    assert.deepEqual(parseMoneyText("Rp 500.000,-"), { currency: "IDR", amount: "500000" });
  });
});

describe("posisi kursor saat format ulang (tidak melompat)", () => {
  /** Simulasi mengetik satu karakter pada posisi kursor tertentu. */
  function typeChar(display: string, caret: number, char: string) {
    const raw = display.slice(0, caret) + char + display.slice(caret);
    const rawCaret = caret + char.length;
    const significant = countSignificantBefore(raw, rawCaret, isDigitOrDot);
    const next = formatTyping(raw);
    return { next, caret: caretAfterSignificant(next, significant, isDigitOrDot) };
  }

  it("mengetik di akhir: kursor tetap di akhir", () => {
    const { next, caret } = typeChar("400,000", 7, "0");
    assert.equal(next, "4,000,000");
    assert.equal(caret, next.length);
  });

  it("mengetik di tengah: kursor tetap tepat setelah digit yang diketik", () => {
    // "4,000,000" + sisip "1" setelah digit pertama => 41,000,000, kursor setelah "41"
    const { next, caret } = typeChar("4,000,000", 1, "1");
    assert.equal(next, "41,000,000");
    assert.equal(next.slice(0, caret), "41");
  });

  it("sisip di awal yang menggeser pemisah ribuan", () => {
    const { next, caret } = typeChar("400,000", 0, "5");
    assert.equal(next, "5,400,000");
    assert.equal(next.slice(0, caret), "5");
  });

  it("menghapus digit di tengah tidak melempar kursor ke akhir", () => {
    // "1,250,000" hapus "5" (kursor setelah "1,25" -> "1,20" + ",000")
    const display = "1,250,000";
    const raw = display.slice(0, 4) + display.slice(5); // hapus karakter ke-5 ("0")
    const significant = countSignificantBefore(raw, 4, isDigitOrDot);
    const next = formatTyping(raw);
    const caret = caretAfterSignificant(next, significant, isDigitOrDot);
    assert.equal(next, "125,000");
    assert.equal(next.slice(0, caret), "125");
  });

  it("jumlah karakter bermakna & batas posisi", () => {
    assert.equal(countSignificantBefore("1,250,000", 5, isDigitOrDot), 4);
    assert.equal(countSignificantBefore("1,250,000", 99, isDigitOrDot), 7);
    assert.equal(caretAfterSignificant("1,250,000", 0, isDigitOrDot), 0);
    assert.equal(caretAfterSignificant("1,250,000", 99, isDigitOrDot), 9);
  });
});
