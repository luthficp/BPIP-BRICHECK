import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateField } from "../validation/three-way-match";
import { compactMatchStateNote, getSourceLines, matchStateNote } from "./display";
import { makeFees, makePeriod, makeShared, makeText } from "./test-utils";

describe("tampilan sel untuk print/PDF", () => {
  it("sel yang menyimpang dari Underlying ditandai deviant pada baris yang berbeda saja", () => {
    const base: [string, string, string, string] = ["500000", "250000", "150000", "75000"];
    const field = makeFees(base, ["600000", "250000", "150000", "75000"], base);
    const ptk = getSourceLines(field, "ptk");
    assert.deepEqual(
      ptk.map((l) => [l.text, l.deviant]),
      [
        ["Provisi: 600,000", true],
        ["Administrasi: 250,000", false],
        ["Notaris: 150,000", false],
        ["Lainnya: 75,000", false],
      ],
    );
    assert.ok(getSourceLines(field, "underlyingDocument").every((l) => !l.deviant));
    assert.ok(getSourceLines(field, "mak").every((l) => !l.deviant));
  });

  it("tanggal tidak valid tampil sebagai pesan, bukan durasi palsu", () => {
    const reversed: [string, string] = ["2027-10-01", "2026-10-01"];
    const field = makePeriod(reversed, ["", ""], ["", ""]);
    const lines = getSourceLines(field, "underlyingDocument");
    assert.equal(lines[0].text, "01/10/2027 s.d. 01/10/2026");
    assert.equal(lines[1].text, "Tanggal akhir lebih awal dari tanggal mulai");
    assert.equal(lines[1].note, "invalid");
  });
});

describe("deskripsi status baris (Hasil Validasi)", () => {
  const note = (u: string, p: string, m: string) =>
    matchStateNote(evaluateField(makeText("beneficiary", u, p, m)));

  it("belum ada sumber terisi => 3 field belum terisi", () => {
    assert.equal(note("", "", ""), "Belum lengkap : 3 field belum terisi");
  });

  it("satu sumber terisi => 2; dua sumber terisi => 1", () => {
    assert.equal(note("PT A", "", ""), "Belum lengkap : 2 field belum terisi");
    assert.equal(note("", "PT A", ""), "Belum lengkap : 2 field belum terisi");
    assert.equal(note("PT A", "PT B", ""), "Belum lengkap : 1 field belum terisi");
  });

  it("spasi saja dihitung belum terisi", () => {
    assert.equal(note("PT A", "   ", "PT A"), "Belum lengkap : 1 field belum terisi");
  });

  it("ketiga sumber terisi => tanpa deskripsi (SESUAI atau TIDAK SESUAI)", () => {
    assert.equal(note("PT A", "PT A", "PT A"), null);
    assert.equal(note("PT A", "PT B", "PT A"), null);
  });

  it("Underlying bersama: kosong => 1 field, terisi => tanpa deskripsi", () => {
    assert.equal(matchStateNote(evaluateField(makeShared(""))), "Belum lengkap : 1 field belum terisi");
    assert.equal(matchStateNote(evaluateField(makeShared("Kontrak 1"))), null);
  });

  it("baris belum lengkap tidak menyorot penyimpangan", () => {
    const field = makeText("beneficiary", "PT A", "PT B", "", 3);
    const evaluation = evaluateField(field);
    assert.equal(evaluation.state, "BELUM LENGKAP");
    assert.ok(getSourceLines(field, "ptk", evaluation).every((line) => !line.deviant));
  });
});

describe("ringkasan hasil validasi (compact, hanya di layar)", () => {
  const compact = (u: string, p: string, m: string) =>
    compactMatchStateNote(evaluateField(makeText("beneficiary", u, p, m)));

  it("Belum Lengkap => hanya '<N> field belum terisi' tanpa awalan 'Belum lengkap :'", () => {
    assert.equal(compact("", "", ""), "3 field belum terisi");
    assert.equal(compact("PT A", "", ""), "2 field belum terisi");
    assert.equal(compact("PT A", "PT B", ""), "1 field belum terisi");
  });

  it("jumlah dihitung dinamis dari data aktual", () => {
    assert.equal(compact("PT A", "   ", "PT A"), "1 field belum terisi");
    assert.equal(compactMatchStateNote(evaluateField(makeShared(""))), "1 field belum terisi");
  });

  it("lengkap (SESUAI / TIDAK SESUAI) => tanpa catatan", () => {
    assert.equal(compact("PT A", "PT A", "PT A"), null);
    assert.equal(compact("PT A", "PT B", "PT A"), null);
    assert.equal(compactMatchStateNote(evaluateField(makeShared("Kontrak 1"))), null);
  });

  it("jumlah sama dengan versi lengkap untuk output (hanya awalan yang dihilangkan)", () => {
    const evaluation = evaluateField(makeText("beneficiary", "PT A", "", ""));
    assert.equal(matchStateNote(evaluation), `Belum lengkap : ${compactMatchStateNote(evaluation)}`);
  });

  it("Biaya belum lengkap: jumlah field belum terisi muncul sekali di tingkat baris", () => {
    const empty: [string, string, string, string] = ["", "", "", ""];
    const note = compactMatchStateNote(evaluateField(makeFees(empty, empty, empty)));
    assert.match(note ?? "", /^\d+ field belum terisi$/);
  });
});
