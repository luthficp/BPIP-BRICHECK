import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeValidationStatus, incompleteHeadline } from "../checklist/status-text";
import { makeSampleChecklist } from "../checklist/test-utils";
import { setAmountValue, setCriticalValue, setSharedValue } from "../checklist/mutations";
import { recalculateMatches, summarizeValidation } from "./three-way-match";

/** Critical field (7 dibandingkan) dipisahkan dari Informasi Bersama (Underlying / Dasar Penerbitan). */
describe("ringkasan validasi: Critical Field 7/7 dan Informasi Bersama terpisah", () => {
  it("seluruh sesuai: 7 dari 7 dibandingkan; Informasi Bersama bukan field kedelapan", () => {
    const c = makeSampleChecklist("clean");
    const summary = summarizeValidation(c.criticalFields);
    assert.equal(summary.comparedTotal, 7);
    assert.equal(summary.comparedMatch, 7);
    assert.equal(summary.comparedIncomplete, 0);
    assert.equal(summary.sharedTotal, 1);
    assert.equal(summary.sharedMissing, false);
    assert.equal(summary.mismatch, 0);
    assert.equal(summary.allSourcesFilled, true);
  });

  it("Informasi Bersama kosong tidak mengurangi 7/7 dan tidak dihitung sebagai critical field belum lengkap", () => {
    let c = makeSampleChecklist("clean");
    c = setSharedValue(c, c.criticalFields.find((f) => f.key === "underlying")!.id, "  ");
    const summary = summarizeValidation(c.criticalFields);
    assert.equal(summary.comparedMatch, 7);
    assert.equal(summary.comparedTotal, 7);
    assert.equal(summary.comparedIncomplete, 0);
    assert.equal(summary.sharedMissing, true);
    assert.equal(summary.allSourcesFilled, false);
    const status = describeValidationStatus(summary);
    assert.equal(status.kind, "incomplete");
    assert.equal(status.incompleteText, "Informasi Bersama (Underlying / Dasar Penerbitan) belum diisi.");
    assert.equal(incompleteHeadline(summary), "Informasi Bersama belum diisi");
  });

  it("critical field belum lengkap dihitung dari tujuh, bukan delapan; Informasi Bersama disebut terpisah", () => {
    let c = makeSampleChecklist("clean");
    c = setCriticalValue(c, c.criticalFields.find((f) => f.key === "beneficiary")!.id, "mak", "");
    c = setSharedValue(c, c.criticalFields.find((f) => f.key === "underlying")!.id, "");
    c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };
    const summary = summarizeValidation(c.criticalFields);
    assert.equal(summary.comparedIncomplete, 1);
    assert.equal(summary.comparedMatch, 6);
    assert.equal(summary.comparedIncompleteCells, 1);
    assert.equal(incompleteHeadline(summary), "1 dari 7 critical field belum lengkap; Informasi Bersama belum diisi");
    assert.equal(
      describeValidationStatus(summary).incompleteText,
      "Masih ada 1 isian sumber yang kosong atau tidak valid pada 1 critical field. Informasi Bersama (Underlying / Dasar Penerbitan) belum diisi.",
    );
  });

  it("logika Tidak Sesuai tetap: perbedaan dihitung dari tujuh critical field", () => {
    let c = makeSampleChecklist("clean");
    c = setAmountValue(c, c.criticalFields.find((f) => f.key === "nilaiBg")!.id, "ptk", { amount: "1249000000" });
    c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };
    const summary = summarizeValidation(c.criticalFields);
    assert.equal(summary.mismatch, 1);
    assert.equal(summary.comparedMatch, 6);
    assert.equal(summary.comparedTotal, 7);
    assert.equal(describeValidationStatus(summary).kind, "mismatch");
  });
});
