import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recalculateMatches } from "../validation/three-way-match";
import {
  canMarkDone,
  countEmptyCriticalCells,
  countMismatches,
  describeStep2Issue,
  getCompletion,
  getDoneBlockers,
  getFirstBlockingStep,
  getInitialStep,
  isMismatchBlocking,
  isStep2Complete,
} from "./completion";
import { DOCUMENT_CATEGORIES, getCategoryStaticItems } from "./config";
import { createEmptyChecklist } from "./factory";
import { getFeeComponents } from "./fees";
import {
  markDone,
  patchHeader,
  reopenAsDraft,
  setAmountValue,
  setCriticalValue,
  setFeeValue,
  setOpiniAdk,
  setPeriodValue,
  setSharedValue,
  setTaskName,
} from "./mutations";
import { makeSampleChecklist } from "./test-utils";
import { SCHEMA_VERSION, type BankGuaranteeChecklist } from "./types";

/** Checklist Draft yang seluruh isiannya lengkap dan sesuai (dari fixture bersama). */
function fillEverything(): BankGuaranteeChecklist {
  return reopenAsDraft(makeSampleChecklist("clean"));
}

const fieldId = (c: BankGuaranteeChecklist, key: string) =>
  c.criticalFields.find((f) => f.key === key)!.id;

/** Id field biaya tambahan ADK pada checklist contoh ("Notaris"). */
const customFeeId = (c: BankGuaranteeChecklist): string => {
  const biaya = c.criticalFields.find((f) => f.key === "biaya");
  assert.ok(biaya && biaya.key === "biaya");
  const custom = getFeeComponents(biaya).find((component) => component.custom);
  assert.ok(custom);
  return custom.id;
};

describe("createEmptyChecklist", () => {
  const c = createEmptyChecklist("  Andi ");

  it("menyiapkan dokumen berkategori dan 8 critical field berurutan", () => {
    const staticDocs = DOCUMENT_CATEGORIES.reduce((sum, category) => sum + getCategoryStaticItems(category).length, 0);
    assert.equal(c.documentVerification.length, staticDocs);
    assert.equal(c.criticalFields.length, 8);
    assert.equal(c.schemaVersion, SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 6);
    assert.deepEqual(
      c.criticalFields.map((f) => f.key),
      [
        "jenisBg",
        "tujuanBg",
        "beneficiary",
        "nilaiBg",
        "jangkaWaktu",
        "biaya",
        "kontraGaransi",
        "underlying",
      ],
    );
    // Tiga poin duplikat (skema 6) sudah dihapus: Document Verification dimulai dari Underlying Transaction.
    assert.deepEqual(
      c.documentVerification.slice(0, 3).map((d) => [d.documentName, d.categoryKey]),
      [
        ["PKS/Surat Penunjukkan antara Applicant & Beneficiary", "underlying-transaction"],
        ["Surat Permohonan Bank Garansi dari Beneficiary", "underlying-transaction"],
        ["Surat Pengajuan Bank Garansi dari Applicant", "underlying-transaction"],
      ],
    );
    assert.ok(
      !c.documentVerification.some((d) =>
        ["surat-permohonan", "permohonan-distributor", "perjanjian-kerja-sama"].includes(d.categoryKey),
      ),
    );
    assert.ok(c.documentVerification.every((d) => d.status === null && d.custom === false));
  });

  it("Risk Owner = Nama Lengkap ADK (di-trim), status Draft, timestamp sistem", () => {
    assert.equal(c.adkName, "Andi");
    assert.equal(c.status, "Draft");
    assert.equal(c.createdAt, c.updatedAt);
    assert.equal(c.completedAt, undefined);
  });

  it("matchStatus awal BUKAN SESUAI", () => {
    assert.ok(c.criticalFields.every((f) => f.matchStatus === "BELUM LENGKAP"));
  });
});

describe("nama task", () => {
  it("otomatis mengikuti Atas Nama sampai diubah manual", () => {
    let c = createEmptyChecklist("Andi");
    c = patchHeader(c, { atasNama: "PT INBISCO" });
    assert.equal(c.taskName, "BG Verification - PT INBISCO");
    c = setTaskName(c, "BG khusus Q4");
    c = patchHeader(c, { atasNama: "PT LAIN" });
    assert.equal(c.taskName, "BG khusus Q4");
    c = setTaskName(c, "  ");
    assert.equal(c.taskName, "BG Verification - PT LAIN");
    assert.equal(c.taskNameCustom, false);
  });
});

describe("completion rules", () => {
  it("checklist kosong tidak boleh Done dan alasan lengkap", () => {
    const c = createEmptyChecklist("Andi");
    assert.equal(canMarkDone(c), false);
    assert.equal(getDoneBlockers(c).length, 4);
    assert.equal(getInitialStep(c), 1);
  });

  it("gating step berurutan", () => {
    const c = createEmptyChecklist("Andi");
    assert.equal(getFirstBlockingStep(2, c), 1);
    assert.equal(getFirstBlockingStep(4, c), 1);
    assert.equal(getFirstBlockingStep(1, c), null);
  });

  it("lengkap => boleh Done, 100%", () => {
    const c = fillEverything();
    assert.deepEqual(getDoneBlockers(c), []);
    assert.equal(canMarkDone(c), true);
    assert.equal(getCompletion(c).percent, 100);
    assert.equal(getInitialStep(c), 4);
  });

  it("TIDAK SESUAI memblokir Step 2 -> Opini ADK dan Done, tetapi tidak mengunci task", () => {
    const filled = fillEverything();
    const benef = fieldId(filled, "beneficiary");
    let c = setCriticalValue(filled, benef, "mak", "PT INBISCO NIAGATAMA");
    c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };

    assert.equal(c.criticalFields.some((f) => f.matchStatus === "TIDAK SESUAI"), true);
    assert.equal(countMismatches(c), 1);
    assert.equal(isMismatchBlocking(c), true);
    assert.equal(isStep2Complete(c), false);
    // Opini ADK (step 3) dan Output (step 4) ditahan di Step 2; Step 1 dan Step 2 tetap terbuka.
    assert.equal(getFirstBlockingStep(3, c), 2);
    assert.equal(getFirstBlockingStep(4, c), 2);
    assert.equal(getFirstBlockingStep(2, c), null);
    assert.equal(getFirstBlockingStep(1, c), null);
    assert.equal(canMarkDone(c), false);
    assert.match(getDoneBlockers(c).join(" "), /TIDAK SESUAI/);
    assert.match(describeStep2Issue(c), /Masih ada 1 informasi TIDAK SESUAI/);
    assert.match(describeStep2Issue(c), /Underlying Document, Memorandum Analisa Bank Garansi, dan Putusan Bank Garansi/);
    // Data tidak dihapus: nilai yang diketik tetap ada dan dapat diedit.
    const kept = c.criticalFields.find((f) => f.id === benef);
    assert.ok(kept && kept.key === "beneficiary" && kept.mak === "PT INBISCO NIAGATAMA");

    // Setelah dikoreksi berdasarkan sumber, blokir hilang tanpa menyentuh data lain.
    const fixed = setCriticalValue(c, benef, "mak", "PT INBISCO");
    assert.equal(isMismatchBlocking(fixed), false);
    assert.equal(getFirstBlockingStep(3, fixed), null);
    assert.equal(canMarkDone(fixed), true);
  });

  it("Belum lengkap bukan TIDAK SESUAI: kosong tidak dihitung sebagai mismatch", () => {
    const filled = fillEverything();
    const benef = fieldId(filled, "beneficiary");
    const c = setCriticalValue(filled, benef, "mak", "");
    assert.equal(countMismatches(c), 0);
    assert.equal(isMismatchBlocking(c), false);
    // Tetap tertahan, tetapi karena isian belum lengkap (pesan berbeda dari TIDAK SESUAI).
    assert.equal(getFirstBlockingStep(3, c), 2);
    assert.match(describeStep2Issue(c), /belum lengkap atau tidak valid/);
    assert.doesNotMatch(describeStep2Issue(c), /TIDAK SESUAI/);
  });

  it("TIDAK SESUAI pada komponen Biaya tetap menahan walau komponen lain masih kosong", () => {
    const filled = fillEverything();
    const biaya = fieldId(filled, "biaya");
    const extra = customFeeId(filled);
    let c = setFeeValue(filled, biaya, "ptk", { provisi: "999999" });
    c = setFeeValue(c, biaya, "mak", { [extra]: "" });
    assert.equal(countMismatches(c), 1);
    assert.equal(isMismatchBlocking(c), true);
    assert.match(describeStep2Issue(c), /belum lengkap atau tidak valid/);
    assert.match(describeStep2Issue(c), /TIDAK SESUAI/);
  });

  it("opini kosong / spasi saja memblokir Done", () => {
    const c = setOpiniAdk(fillEverything(), "   ");
    assert.equal(canMarkDone(c), false);
    assert.deepEqual(getDoneBlockers(c), ["Opini ADK belum diisi"]);
  });

  it("Done lalu reopen menghapus completedAt", () => {
    const done = markDone(fillEverything());
    assert.equal(done.status, "Done");
    assert.ok(done.completedAt);
    assert.equal(canMarkDone(done), false);
    const reopened = reopenAsDraft(done);
    assert.equal(reopened.status, "Draft");
    assert.equal("completedAt" in reopened, false);
  });
});

describe("kelengkapan Critical Field terstruktur", () => {
  it("komponen Biaya (mis. Notaris) yang kosong pada satu sumber memblokir Done", () => {
    let c = fillEverything();
    const biaya = c.criticalFields.find((f) => f.key === "biaya");
    assert.ok(biaya);
    c = setFeeValue(c, biaya.id, "mak", { [customFeeId(c)]: "" });
    assert.equal(canMarkDone(c), false);
    assert.match(getDoneBlockers(c)[0], /belum lengkap atau tidak valid/);
  });

  it("Underlying / Dasar Penerbitan kosong memblokir Done; satu isian bersama cukup", () => {
    const filled = fillEverything();
    const c = setSharedValue(filled, fieldId(filled, "underlying"), "  ");
    assert.equal(canMarkDone(c), false);
    assert.equal(countEmptyCriticalCells(c), 1);
  });

  it("Kontra Garansi tanpa item atau dengan detail kosong memblokir Done", () => {
    const empty = createEmptyChecklist("Andi");
    const emptyKontra = empty.criticalFields.find((f) => f.key === "kontraGaransi");
    assert.ok(emptyKontra && emptyKontra.key === "kontraGaransi");
    assert.deepEqual(emptyKontra.items, []);
    const filled = fillEverything();
    const kontra = filled.criticalFields.find((f) => f.key === "kontraGaransi");
    assert.ok(kontra && kontra.key === "kontraGaransi");
    const withoutItems = {
      ...filled,
      criticalFields: filled.criticalFields.map((f) =>
        f.key === "kontraGaransi" ? { ...f, items: [] } : f,
      ),
    } as BankGuaranteeChecklist;
    assert.equal(canMarkDone(withoutItems), false);
  });

  it("tanggal akhir sebelum tanggal mulai memblokir Done (tidak valid)", () => {
    let c = fillEverything();
    const jangka = c.criticalFields.find((f) => f.key === "jangkaWaktu");
    assert.ok(jangka);
    c = setPeriodValue(c, jangka.id, "ptk", { start: "2027-10-01", end: "2026-10-01" });
    assert.equal(canMarkDone(c), false);
  });

  it("checklist baru: 22 sel kosong (6 field x 3 sumber, Kontra Garansi 3, Underlying 1)", () => {
    const c = createEmptyChecklist("Andi");
    assert.equal(countEmptyCriticalCells(c), 6 * 3 + 3 + 1);
    const staticDocs = c.documentVerification.length;
    assert.equal(getCompletion(c).total, 4 + staticDocs + 22 + 1);
  });

  it("mutasi dengan tipe yang salah diabaikan", () => {
    const c = createEmptyChecklist("Andi");
    const nilai = c.criticalFields.find((f) => f.key === "nilaiBg");
    const jenis = c.criticalFields.find((f) => f.key === "jenisBg");
    assert.ok(nilai && jenis);
    assert.deepEqual(setFeeValue(c, nilai.id, "ptk", { provisi: "1" }).criticalFields, c.criticalFields);
    assert.deepEqual(setAmountValue(c, jenis.id, "ptk", { amount: "1" }).criticalFields, c.criticalFields);
    assert.deepEqual(setCriticalValue(c, nilai.id, "ptk", "x").criticalFields, c.criticalFields);
    assert.deepEqual(setSharedValue(c, jenis.id, "x").criticalFields, c.criticalFields);
  });
});
