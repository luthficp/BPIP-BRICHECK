import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateField } from "../validation/three-way-match";
import { migrateChecklist } from "./migrate";
import { SCHEMA_VERSION, type CriticalField } from "./types";

/** Draft skema lama (v1): enam critical field, seluruh nilai berupa teks. */
function legacyDraft(overrides: Record<string, unknown> = {}) {
  const field = (id: number, key: string, fieldName: string, u: string, p: string, m: string) => ({
    id,
    key,
    fieldName,
    underlyingDocument: u,
    ptk: p,
    mak: m,
    matchStatus: "BELUM LENGKAP",
  });
  return {
    id: "legacy-1",
    taskName: "BG Verification - PT INBISCO",
    taskNameCustom: false,
    adkName: "Andi",
    atasNama: "PT INBISCO",
    cif: "123",
    jenisPengajuan: "Baru",
    documentVerification: [{ id: 1, documentName: "Surat permohonan", status: "Ada", notes: "ok" }],
    criticalFields: [
      field(1, "jenisBg", "Jenis Bank Garansi", "Performance Bond", "Performance Bond", "Performance Bond"),
      field(2, "beneficiary", "Beneficiary", "PT INBISCO", "PT INBISCO", "PT INBISCO NIAGATAMA"),
      field(3, "nilaiBg", "Nilai Bank Garansi", "Rp400.000.000", "400000000", "Rp 400 juta"),
      field(4, "jangkaWaktu", "Jangka Waktu", "14/09/2026 s/d 14/09/2027", "14/09/2026 - 14/09/2027", "12 bulan"),
    ],
    opiniAdk: "Perlu dicek ulang.",
    status: "Draft",
    createdAt: "2026-09-01T03:00:00.000Z",
    updatedAt: "2026-09-02T04:00:00.000Z",
    ...overrides,
  };
}

function byKey(fields: CriticalField[], key: CriticalField["key"]) {
  const found = fields.find((f) => f.key === key);
  assert.ok(found, `field ${key} tidak ditemukan`);
  return found;
}

describe("migrasi draft lama (skema 1 -> 2)", () => {
  const migrated = migrateChecklist(legacyDraft());

  it("menghasilkan 8 field berurutan dengan versi skema baru", () => {
    assert.ok(migrated);
    assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(
      migrated.criticalFields.map((f) => f.key),
      ["jenisBg", "tujuanBg", "beneficiary", "nilaiBg", "jangkaWaktu", "biaya", "kontraGaransi", "underlying"],
    );
  });

  it("data header, dokumen, opini, status, dan timestamp tidak berubah", () => {
    assert.ok(migrated);
    assert.equal(migrated.adkName, "Andi");
    assert.equal(migrated.atasNama, "PT INBISCO");
    assert.equal(migrated.cif, "123");
    assert.equal(migrated.opiniAdk, "Perlu dicek ulang.");
    assert.equal(migrated.status, "Draft");
    assert.equal(migrated.createdAt, "2026-09-01T03:00:00.000Z");
    assert.equal(migrated.updatedAt, "2026-09-02T04:00:00.000Z");
    // "Surat permohonan" (nama lama, tanpa padanan pada struktur kini) tidak dibuang: tersimpan sebagai
    // dokumen tambahan pada "Surat-Surat Lainnya" dengan status & keterangan utuh.
    const lama = migrated.documentVerification.find((d) => d.documentName === "Surat permohonan");
    assert.ok(lama);
    assert.equal(lama.custom, true);
    assert.equal(lama.categoryKey, "surat-surat-lainnya");
    assert.equal(lama.status, "Ada");
    assert.equal(lama.notes, "ok");
  });

  it("isian teks lama dipertahankan", () => {
    assert.ok(migrated);
    const beneficiary = byKey(migrated.criticalFields, "beneficiary");
    assert.equal(beneficiary.key === "beneficiary" && beneficiary.mak, "PT INBISCO NIAGATAMA");
    assert.equal(evaluateField(beneficiary).state, "TIDAK SESUAI");
  });

  it("nominal lama yang terbaca menjadi angka terstruktur", () => {
    assert.ok(migrated);
    const nilai = byKey(migrated.criticalFields, "nilaiBg");
    assert.equal(nilai.key === "nilaiBg" && nilai.underlyingDocument.amount, "400000000");
    assert.equal(nilai.key === "nilaiBg" && nilai.underlyingDocument.currency, "IDR");
    assert.equal(nilai.key === "nilaiBg" && nilai.ptk.amount, "400000000");
  });

  it("teks nominal yang tidak terbaca TIDAK hilang: disimpan sebagai catatan lama", () => {
    assert.ok(migrated);
    const nilai = byKey(migrated.criticalFields, "nilaiBg");
    assert.equal(nilai.key === "nilaiBg" && nilai.mak.amount, "");
    assert.equal(nilai.legacy?.mak, "Rp 400 juta");
  });

  it("jangka waktu lama yang terbaca menjadi rentang tanggal ISO; durasi tidak terbaca masuk catatan", () => {
    assert.ok(migrated);
    const jangka = byKey(migrated.criticalFields, "jangkaWaktu");
    assert.ok(jangka.key === "jangkaWaktu");
    assert.deepEqual(jangka.underlyingDocument, { start: "2026-09-14", end: "2027-09-14" });
    assert.deepEqual(jangka.ptk, { start: "2026-09-14", end: "2027-09-14" });
    assert.deepEqual(jangka.mak, { start: "", end: "" });
    assert.equal(jangka.legacy?.mak, "12 bulan");
  });

  it("field baru mulai kosong dan bukan SESUAI", () => {
    assert.ok(migrated);
    for (const key of ["tujuanBg", "biaya", "kontraGaransi", "underlying"] as const) {
      const field = byKey(migrated.criticalFields, key);
      assert.equal(evaluateField(field).state, "BELUM LENGKAP", key);
      assert.equal(field.matchStatus, "BELUM LENGKAP", key);
    }
  });

  it("migrasi idempoten", () => {
    assert.ok(migrated);
    const again = migrateChecklist(JSON.parse(JSON.stringify(migrated)));
    assert.deepEqual(again, migrated);
  });

  it("draft Done tetap Done beserta completedAt", () => {
    const done = migrateChecklist(
      legacyDraft({ status: "Done", completedAt: "2026-09-03T05:00:00.000Z" }),
    );
    assert.ok(done);
    assert.equal(done.status, "Done");
    assert.equal(done.completedAt, "2026-09-03T05:00:00.000Z");
  });

  it("data rusak ditolak, bukan membuat aplikasi crash", () => {
    assert.equal(migrateChecklist(null), null);
    assert.equal(migrateChecklist("x"), null);
    assert.equal(migrateChecklist({ taskName: "tanpa id" }), null);
    assert.ok(migrateChecklist({ id: "a" }));
  });
});
