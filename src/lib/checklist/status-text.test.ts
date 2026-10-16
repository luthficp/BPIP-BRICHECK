import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeValidation } from "../validation/three-way-match";
import { getDoneBlockers, getRequirements, canMarkDone } from "./completion";
import { createEmptyChecklist } from "./factory";
import {
  describeValidationStatus,
  incompleteCountText,
  incompleteRowText,
  mismatchText,
  TEXT_ALL_MATCH,
  TEXT_ALL_REQUIREMENTS_MET,
} from "./status-text";
import { makeAmount, makeSampleChecklist, makeText } from "./test-utils";

const matching = () => makeText("jenisBg", "Performance Bond", "Performance Bond", "Performance Bond", 1);
const mismatching = (id: number) =>
  makeText("beneficiary", "PT INBISCO", "PT INBISCO", "PT INBISCO NIAGATAMA", id);

describe("kalimat status Hasil Validasi (Summary & Output)", () => {
  it("kalimat persis sesuai spesifikasi", () => {
    assert.equal(
      mismatchText(3),
      "Seluruh sumber terisi; terdapat 3 informasi yang belum sesuai.",
    );
    assert.equal(TEXT_ALL_MATCH, "Seluruh sumber terisi dan hasil validasi sudah sesuai.");
    assert.equal(
      TEXT_ALL_REQUIREMENTS_MET,
      'Seluruh syarat terpenuhi. Klik "Tandai Selesai (Done)" untuk menyelesaikan Task dan melanjutkan ke pilihan Output.',
    );
  });

  it("seluruh sumber terisi + semua sesuai => pesan sukses", () => {
    const status = describeValidationStatus(summarizeValidation([matching(), matching()]));
    assert.equal(status.kind, "all-match");
    assert.equal(status.tone, "success");
    assert.equal(status.text, "Seluruh sumber terisi dan hasil validasi sudah sesuai.");
    assert.equal(status.incompleteText, null);
  });

  it("N dihitung dari field yang benar-benar TIDAK SESUAI", () => {
    const summary = summarizeValidation([matching(), mismatching(2), mismatching(3)]);
    assert.equal(summary.mismatch, 2);
    assert.equal(summary.allSourcesFilled, true);
    const status = describeValidationStatus(summary);
    assert.equal(status.kind, "mismatch");
    assert.equal(status.text, "Seluruh sumber terisi; terdapat 2 informasi yang belum sesuai.");
  });

  it("isian belum lengkap TIDAK dihitung sebagai tidak sesuai dan dilaporkan terpisah", () => {
    // 1 tidak sesuai (semua terisi) + 1 field yang hanya belum lengkap (tanpa perbedaan).
    const incompleteOnly = makeText("tujuanBg", "Jaminan", "Jaminan", "", 4);
    const summary = summarizeValidation([matching(), mismatching(2), incompleteOnly]);
    assert.equal(summary.mismatch, 1);
    assert.equal(summary.incomplete, 1);
    assert.equal(summary.incompleteCells, 1);
    assert.equal(summary.allSourcesFilled, false);

    const status = describeValidationStatus(summary);
    assert.equal(status.kind, "mismatch-incomplete");
    assert.equal(status.text, "Terdapat 1 informasi yang belum sesuai.");
    assert.ok(!status.text.includes("Seluruh sumber terisi"), "tidak boleh mengaku semua sumber terisi");
    assert.match(status.incompleteText ?? "", /1 isian sumber/);
  });

  it("belum ada perbedaan tetapi ada isian kosong => tidak pernah dinyatakan sesuai", () => {
    const status = describeValidationStatus(
      summarizeValidation([matching(), makeAmount(["1000", "1000", ""])]),
    );
    assert.equal(status.kind, "incomplete");
    assert.equal(status.tone, "warning");
    assert.ok(!status.text.includes("sudah sesuai"));
    assert.ok(status.incompleteText);
  });

  it("dua sumber berbeda tetapi sumber ketiga kosong => Belum lengkap, bukan mismatch", () => {
    // Underlying != Putusan, Memorandum belum diisi: belum boleh disimpulkan TIDAK SESUAI.
    const field = makeText("beneficiary", "PT A", "PT B", "", 1);
    const summary = summarizeValidation([field]);
    assert.equal(summary.mismatch, 0);
    assert.equal(summary.incomplete, 1);
    assert.equal(summary.incompleteCells, 1);
    assert.equal(summary.incompleteFieldCount, 1);
    const status = describeValidationStatus(summary);
    assert.equal(status.kind, "incomplete");
    assert.ok(!status.text.includes("Seluruh sumber terisi"));
    assert.ok(!status.text.includes("belum sesuai"));
  });

  it("deskripsi baris Belum lengkap memakai format persis dan menghitung sumber kosong", () => {
    assert.equal(incompleteRowText(3), "Belum lengkap : 3 field belum terisi");
    assert.equal(incompleteRowText(2), "Belum lengkap : 2 field belum terisi");
    assert.equal(incompleteRowText(1), "Belum lengkap : 1 field belum terisi");
  });

  it("ringkasan jumlah (compact) tanpa awalan 'Belum lengkap :'", () => {
    assert.equal(incompleteCountText(3), "3 field belum terisi");
    assert.equal(incompleteCountText(1), "1 field belum terisi");
    assert.equal(incompleteRowText(2), `Belum lengkap : ${incompleteCountText(2)}`);
  });
});

describe("syarat penyelesaian (gating tombol Tandai Selesai)", () => {
  it("checklist kosong: keempat syarat belum terpenuhi, dengan tindakan yang jelas", () => {
    const c = { ...createEmptyChecklist("Andi") };
    const reqs = getRequirements(c);
    assert.deepEqual(
      reqs.map((r) => r.label),
      ["Informasi Aplikasi", "Document Verification", "Critical Field Validation", "Opini ADK"],
    );
    assert.ok(reqs.every((r) => !r.ok));
    assert.ok(reqs.every((r) => r.action.length > 0 && r.detail.length > 0));
    assert.deepEqual(
      reqs.map((r) => r.target),
      ["header", 1, 2, 3],
    );
    assert.equal(canMarkDone(c), false);
  });

  it("TIDAK SESUAI menahan syarat Critical Field Validation dan tombol Tandai Selesai", () => {
    const done = makeSampleChecklist("mismatch");
    const draft = { ...done, status: "Draft" as const, completedAt: undefined };
    const reqs = getRequirements(draft);
    assert.deepEqual(
      reqs.filter((r) => !r.ok).map((r) => r.id),
      ["critical"],
      "hanya Critical Field Validation yang belum terpenuhi",
    );
    assert.match(reqs.find((r) => r.id === "critical")!.detail, /4 informasi TIDAK SESUAI/);
    assert.equal(canMarkDone(draft), false);
    assert.match(getDoneBlockers(draft).join(" "), /TIDAK SESUAI/);
  });

  it("seluruh syarat terpenuhi bila checklist lengkap dan sesuai", () => {
    const done = makeSampleChecklist("clean");
    const draft = { ...done, status: "Draft" as const, completedAt: undefined };
    const reqs = getRequirements(draft);
    assert.ok(reqs.every((r) => r.ok));
    assert.equal(canMarkDone(draft), true);
    assert.deepEqual(getDoneBlockers(draft), []);
  });

  it("daftar syarat konsisten dengan getDoneBlockers", () => {
    const c = makeSampleChecklist("clean");
    const draft = { ...c, status: "Draft" as const, completedAt: undefined, opiniAdk: "" };
    const unmet = getRequirements(draft).filter((r) => !r.ok);
    assert.deepEqual(unmet.map((r) => r.id), ["opinion"]);
    assert.equal(getDoneBlockers(draft).length, unmet.length);
    assert.equal(canMarkDone(draft), false);
  });
});
