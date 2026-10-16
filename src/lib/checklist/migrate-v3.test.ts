import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateField } from "../validation/three-way-match";
import { DOCUMENT_CATEGORIES, getCategoryStaticItems } from "./config";
import { migrateChecklist } from "./migrate";
import { SCHEMA_VERSION, type CriticalField, type KontraCriticalField } from "./types";

/** Draft skema 2: dokumen datar, Biaya 2 komponen, Kontra Garansi dropdown, Underlying per sumber. */
function v2Draft(overrides: Record<string, unknown> = {}) {
  const text = (id: number, key: string, fieldName: string, u: string, p: string, m: string) => ({
    id,
    key,
    fieldName,
    underlyingDocument: u,
    ptk: p,
    mak: m,
    matchStatus: "BELUM LENGKAP",
  });
  const fee = (provisi: string, administrasi: string) => ({ provisi, administrasi });
  return {
    id: "v2-1",
    schemaVersion: 2,
    taskName: "BG Verification - PT INBISCO",
    taskNameCustom: false,
    adkName: "Andi",
    atasNama: "PT INBISCO",
    cif: "123",
    jenisPengajuan: "Baru",
    documentVerification: [
      { id: 1, documentName: "Surat permohonan", status: "Ada", notes: "tgl 1 Sep" },
      { id: 2, documentName: "KTP", status: "Tidak Ada", notes: "menyusul" },
      { id: 8, documentName: "Izin Usaha", status: "Ada", notes: "" },
      { id: 9, documentName: "Dokumen aneh", status: null, notes: "catatan" },
    ],
    criticalFields: [
      text(1, "jenisBg", "Jenis Bank Garansi", "Performance Bond", "Performance Bond", "Performance Bond"),
      text(7, "kontraGaransi", "Kontra Garansi", "Fixed Asset", "Cash Collateral", ""),
      text(8, "underlying", "Underlying / Dasar Penerbitan", "Kontrak 1", "Kontrak 1", "Kontrak 2"),
      {
        id: 6,
        key: "biaya",
        fieldName: "Biaya",
        underlyingDocument: fee("500000", "250000"),
        ptk: fee("500000", "250000"),
        mak: fee("500000", "250000"),
        matchStatus: "SESUAI",
      },
    ],
    opiniAdk: "Opini lama.",
    status: "Done",
    completedAt: "2026-09-03T05:00:00.000Z",
    createdAt: "2026-09-01T03:00:00.000Z",
    updatedAt: "2026-09-02T04:00:00.000Z",
    ...overrides,
  };
}

const byKey = (fields: CriticalField[], key: CriticalField["key"]) => {
  const found = fields.find((f) => f.key === key);
  assert.ok(found, `field ${key}`);
  return found;
};

describe("migrasi skema 2 -> terbaru", () => {
  const migrated = migrateChecklist(v2Draft());

  it("versi skema naik ke terbaru dan header/opini/status/timestamp tidak berubah", () => {
    assert.ok(migrated);
    assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 6);
    assert.equal(migrated.adkName, "Andi");
    assert.equal(migrated.opiniAdk, "Opini lama.");
    assert.equal(migrated.status, "Done");
    assert.equal(migrated.completedAt, "2026-09-03T05:00:00.000Z");
    assert.equal(migrated.createdAt, "2026-09-01T03:00:00.000Z");
  });

  it("dokumen lama dipetakan ke kategori baru dengan status dan keterangan utuh", () => {
    assert.ok(migrated);
    const docs = migrated.documentVerification;
    const ktp = docs.find((d) => d.documentName === "KTP");
    assert.ok(ktp);
    assert.equal(ktp.categoryKey, "identitas-debitur");
    assert.equal(ktp.status, "Tidak Ada");
    assert.equal(ktp.notes, "menyusul");
    assert.equal(ktp.custom, false);

    // "Surat permohonan" (nama lama) tidak punya padanan pada struktur kini (poin 1-3 sudah dihapus):
    // tidak dibuang, melainkan menjadi dokumen tambahan pada "Surat-Surat Lainnya" dengan isian utuh.
    const surat = docs.find((d) => d.documentName === "Surat permohonan");
    assert.ok(surat);
    assert.equal(surat.categoryKey, "surat-surat-lainnya");
    assert.equal(surat.custom, true);
    assert.equal(surat.status, "Ada");
    assert.equal(surat.notes, "tgl 1 Sep");

    const izin = docs.find((d) => d.documentName === "Izin Usaha");
    assert.equal(izin?.categoryKey, "identitas-usaha-debitur");
    assert.equal(izin?.custom, true);

    // Nama tak dikenal tidak dibuang.
    const aneh = docs.find((d) => d.documentName === "Dokumen aneh");
    assert.equal(aneh?.categoryKey, "surat-surat-lainnya");
    assert.equal(aneh?.notes, "catatan");
  });

  it("subkategori statis baru ditambahkan belum diperiksa; id unik", () => {
    assert.ok(migrated);
    const docs = migrated.documentVerification;
    const staticCount = DOCUMENT_CATEGORIES.reduce((sum, c) => sum + getCategoryStaticItems(c).length, 0);
    assert.equal(docs.filter((d) => !d.custom).length, staticCount);
    assert.equal(docs.find((d) => d.documentName === "NPWP")?.status, null);
    assert.equal(new Set(docs.map((d) => d.id)).size, docs.length);
  });

  it("Biaya: Provisi/Administrasi lama dipertahankan; Notaris/Lainnya kosong tidak dibawa (tanpa nilai yatim)", () => {
    assert.ok(migrated);
    const biaya = byKey(migrated.criticalFields, "biaya");
    assert.ok(biaya.key === "biaya");
    assert.deepEqual(biaya.components.map((c) => c.label), ["Provisi", "Administrasi"]);
    assert.deepEqual(biaya.ptk, { provisi: "500000", administrasi: "250000" });
    // Data lama Provisi/Administrasi terisi lengkap pada ketiga sumber dan sama => SESUAI
    // (Notaris/Lainnya bukan lagi komponen bawaan, sehingga tidak membuat baris belum lengkap).
    assert.equal(evaluateField(biaya).state, "SESUAI");
  });

  it("Kontra Garansi lama: satu item dari jenis yang dikenali, isian lama dicatat", () => {
    assert.ok(migrated);
    const kontra = byKey(migrated.criticalFields, "kontraGaransi") as KontraCriticalField;
    assert.equal(kontra.items.length, 1);
    assert.equal(kontra.items[0].type, "fixedAsset");
    assert.deepEqual(kontra.legacy, { underlyingDocument: "Fixed Asset", ptk: "Cash Collateral" });
    assert.equal(evaluateField(kontra).state, "BELUM LENGKAP", "detail item masih kosong");
  });

  it("Underlying lama (tiga nilai) menjadi satu isian bersama tanpa kehilangan teks", () => {
    assert.ok(migrated);
    const underlying = byKey(migrated.criticalFields, "underlying");
    assert.ok(underlying.key === "underlying");
    assert.equal(underlying.value, "Kontrak 1\nKontrak 2");
    assert.equal(evaluateField(underlying).state, "BERSAMA");
  });

  it("idempoten: migrasi ulang tidak mengubah apa pun", () => {
    assert.ok(migrated);
    const again = migrateChecklist(JSON.parse(JSON.stringify(migrated)));
    assert.deepEqual(again, migrated);
  });

  it("data skema 3 yang sudah punya dokumen custom dan item Kontra dipertahankan", () => {
    assert.ok(migrated);
    const stored = JSON.parse(JSON.stringify(migrated));
    stored.documentVerification.push({
      id: 500,
      documentName: "Surat kuasa",
      status: "Ada",
      notes: "asli",
      categoryKey: "identitas-beneficiary",
      custom: true,
    });
    const reloaded = migrateChecklist(stored);
    assert.ok(reloaded);
    const custom = reloaded.documentVerification.find((d) => d.documentName === "Surat kuasa");
    assert.deepEqual(
      [custom?.id, custom?.categoryKey, custom?.custom, custom?.status, custom?.notes],
      [500, "identitas-beneficiary", true, "Ada", "asli"],
    );
  });
});

describe("migrasi skema 3 -> terbaru (tanpa baris langsung poin 1-3)", () => {
  const base = migrateChecklist(v2Draft());

  /** Bentuk data tersimpan skema 3: poin 1-3 belum punya baris bawaan. */
  function storedV3() {
    assert.ok(base);
    const stored = JSON.parse(JSON.stringify(base));
    stored.schemaVersion = 3;
    return stored;
  }

  it("tidak ada baris untuk poin 1-3; dokumen lain tidak berubah", () => {
    const stored = storedV3();
    const before = stored.documentVerification.length;
    const next = migrateChecklist(stored);
    assert.ok(next);
    assert.equal(next.schemaVersion, SCHEMA_VERSION);
    assert.equal(next.documentVerification.length, before);
    for (const key of ["surat-permohonan", "permohonan-distributor", "perjanjian-kerja-sama"]) {
      assert.equal(next.documentVerification.filter((d) => d.categoryKey === key).length, 0, key);
    }
    const ktp = next.documentVerification.find((d) => d.documentName === "KTP");
    assert.deepEqual([ktp?.status, ktp?.notes], ["Tidak Ada", "menyusul"]);
    assert.equal(new Set(next.documentVerification.map((d) => d.id)).size, next.documentVerification.length);
  });

  it("migrasi idempoten: memuat ulang data skema terbaru tidak mengubah apa pun", () => {
    const once = migrateChecklist(storedV3());
    assert.ok(once);
    const twice = migrateChecklist(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(twice, once);
  });

  it("item Kontra Garansi (id stabil, isian) tetap utuh setelah migrasi", () => {
    const stored = storedV3();
    const kontra = stored.criticalFields.find((f: { key: string }) => f.key === "kontraGaransi");
    kontra.items = [
      { id: "kg-1", type: "fixedAsset", values: { underlyingDocument: { noShm: "SHM 1" }, ptk: {}, mak: {} } },
      { id: "kg-2", type: "asuransi", values: { underlyingDocument: {}, ptk: { noSp3: "SP3/9" }, mak: {} } },
    ];
    const next = migrateChecklist(stored);
    assert.ok(next);
    const field = byKey(next.criticalFields, "kontraGaransi") as KontraCriticalField;
    assert.deepEqual(field.items.map((i) => [i.id, i.type]), [["kg-1", "fixedAsset"], ["kg-2", "asuransi"]]);
    assert.equal(field.items[0].values.underlyingDocument.noShm, "SHM 1");
    assert.equal(field.items[1].values.ptk.noSp3, "SP3/9");
  });

  it("Kontra yang tersimpan di luar criticalFields (build percobaan) tetap dibaca", () => {
    const stored = storedV3();
    stored.criticalFields = stored.criticalFields.filter((f: { key: string }) => f.key !== "kontraGaransi");
    stored.kontraGaransi = {
      items: [{ id: "x-1", type: "kendaraan", values: { underlyingDocument: { noBpkb: "B 123" }, ptk: {}, mak: {} } }],
      matchStatus: "BELUM LENGKAP",
    };
    const next = migrateChecklist(stored);
    assert.ok(next);
    const field = byKey(next.criticalFields, "kontraGaransi") as KontraCriticalField;
    assert.equal(field.items.length, 1);
    assert.equal(field.items[0].id, "x-1");
    assert.equal(field.items[0].values.underlyingDocument.noBpkb, "B 123");
  });
});
