import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateKontraGaransi, summarizeKontra } from "../validation/three-way-match";
import { migrateChecklist } from "./migrate";
import { SCHEMA_VERSION } from "./types";

/** Draft skema 3: Kontra Garansi masih berupa field ke-7 pada criticalFields, Underlying field ke-8. */
function v3Draft(overrides: Record<string, unknown> = {}) {
  const text = (id: number, key: string, fieldName: string, value: string) => ({
    id,
    key,
    fieldName,
    underlyingDocument: value,
    ptk: value,
    mak: value,
    matchStatus: "SESUAI",
  });
  const detail = (noShm: string) => ({
    noShm,
    atasNama: "PT INBISCO",
    nilaiNpw: { currency: "IDR", amount: "750000000" },
    pengikatan: "APHT",
  });
  return {
    id: "v3-1",
    schemaVersion: 3,
    taskName: "BG Verification - PT INBISCO",
    taskNameCustom: false,
    adkName: "Andi",
    atasNama: "PT INBISCO",
    cif: "123",
    jenisPengajuan: "Baru",
    documentVerification: [
      // Kategori tanpa subitem pada skema 3 hanya berisi dokumen custom.
      {
        id: 1,
        documentName: "Surat Permohonan Bank Garansi",
        status: "Ada",
        notes: "tgl 1 Sep",
        categoryKey: "surat-permohonan",
        custom: true,
      },
      {
        id: 2,
        documentName: "Surat kuasa",
        status: "Tidak Ada",
        notes: "menyusul",
        categoryKey: "perjanjian-kerja-sama",
        custom: true,
      },
      { id: 3, documentName: "KTP", status: "Ada", notes: "", categoryKey: "identitas-debitur", custom: false },
    ],
    criticalFields: [
      text(1, "jenisBg", "Jenis Bank Garansi", "Performance Bond"),
      {
        id: 7,
        key: "kontraGaransi",
        fieldName: "Kontra Garansi",
        items: [
          {
            id: "item-a",
            type: "fixedAsset",
            values: {
              underlyingDocument: detail("SHM 1"),
              ptk: detail("SHM 1"),
              mak: detail("SHM 1"),
            },
          },
          {
            id: "item-b",
            type: "fixedAsset",
            values: {
              underlyingDocument: detail("SHM 2"),
              ptk: detail("SHM 2"),
              mak: detail("SHM 99"),
            },
          },
        ],
        legacy: { mak: "teks lama" },
        matchStatus: "TIDAK SESUAI",
      },
      { id: 8, key: "underlying", fieldName: "Underlying / Dasar Penerbitan", value: "Kontrak 1", matchStatus: "BERSAMA" },
    ],
    opiniAdk: "Opini.",
    status: "Done",
    completedAt: "2026-09-03T05:00:00.000Z",
    createdAt: "2026-09-01T03:00:00.000Z",
    updatedAt: "2026-09-02T04:00:00.000Z",
    ...overrides,
  };
}

describe("migrasi skema 3 -> 4 (Kontra Garansi menjadi step tersendiri)", () => {
  const migrated = migrateChecklist(v3Draft());

  it("versi skema 4; header, opini, status Done, dan timestamp tidak berubah", () => {
    assert.ok(migrated);
    assert.equal(migrated.schemaVersion, 4);
    assert.equal(SCHEMA_VERSION, 4);
    assert.equal(migrated.status, "Done");
    assert.equal(migrated.completedAt, "2026-09-03T05:00:00.000Z");
    assert.equal(migrated.opiniAdk, "Opini.");
    assert.equal(migrated.createdAt, "2026-09-01T03:00:00.000Z");
    assert.equal(migrated.updatedAt, "2026-09-02T04:00:00.000Z");
  });

  it("Kontra Garansi keluar dari criticalFields; id field dirapatkan 1..7; Underlying tetap satu isian bersama", () => {
    assert.ok(migrated);
    assert.deepEqual(
      migrated.criticalFields.map((f) => [f.id, f.key]),
      [
        [1, "jenisBg"],
        [2, "tujuanBg"],
        [3, "beneficiary"],
        [4, "nilaiBg"],
        [5, "jangkaWaktu"],
        [6, "biaya"],
        [7, "underlying"],
      ],
    );
    const underlying = migrated.criticalFields[6];
    assert.ok(underlying.key === "underlying");
    assert.equal(underlying.value, "Kontrak 1");
  });

  it("item Kontra, id item, nilai per sumber, dan catatan lama terbawa utuh", () => {
    assert.ok(migrated);
    const { items, legacy } = migrated.kontraGaransi;
    assert.deepEqual(items.map((i) => [i.id, i.type]), [
      ["item-a", "fixedAsset"],
      ["item-b", "fixedAsset"],
    ]);
    assert.equal(items[0].values.mak.noShm, "SHM 1");
    assert.equal(items[1].values.mak.noShm, "SHM 99");
    assert.deepEqual(items[1].values.ptk.nilaiNpw, { currency: "IDR", amount: "750000000" });
    assert.deepEqual(legacy, { mak: "teks lama" });
  });

  it("hasil validasi dihitung ulang dari data: item #1 SESUAI, item #2 TIDAK SESUAI", () => {
    assert.ok(migrated);
    const evaluation = evaluateKontraGaransi(migrated.kontraGaransi);
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.equal(migrated.kontraGaransi.matchStatus, "TIDAK SESUAI");
    const summary = summarizeKontra(migrated.kontraGaransi);
    assert.equal(summary.match, 1);
    assert.equal(summary.mismatch, 1);
    assert.deepEqual(summary.mismatchLabels, ["Fixed Asset #2 – Nomor SHM"]);
  });

  it("dokumen di kategori tanpa subitem: baris bernama sama diserap (status & keterangan utuh), lainnya tetap ada", () => {
    assert.ok(migrated);
    const docs = migrated.documentVerification;

    const surat = docs.filter((d) => d.categoryKey === "surat-permohonan");
    assert.equal(surat.length, 1, "tidak ada baris ganda");
    assert.deepEqual(
      [surat[0].documentName, surat[0].custom, surat[0].status, surat[0].notes],
      ["Surat Permohonan Bank Garansi", false, "Ada", "tgl 1 Sep"],
    );

    const pks = docs.filter((d) => d.categoryKey === "perjanjian-kerja-sama");
    const primary = pks.find((d) => !d.custom);
    assert.ok(primary);
    assert.equal(primary.documentName, "Perjanjian Kerja Sama");
    assert.equal(primary.status, null, "baris bawaan baru mulai belum dijawab");
    // Dokumen custom lama tidak dibuang.
    const extra = pks.find((d) => d.documentName === "Surat kuasa");
    assert.deepEqual([extra?.custom, extra?.status, extra?.notes], [true, "Tidak Ada", "menyusul"]);

    const distributor = docs.filter((d) => d.categoryKey === "permohonan-distributor");
    assert.equal(distributor.length, 1);
    assert.equal(distributor[0].status, null);

    assert.equal(docs.find((d) => d.documentName === "KTP")?.status, "Ada");
    assert.equal(new Set(docs.map((d) => d.id)).size, docs.length, "id dokumen unik");
  });

  it("idempoten: migrasi ulang tidak mengubah apa pun", () => {
    assert.ok(migrated);
    const again = migrateChecklist(JSON.parse(JSON.stringify(migrated)));
    assert.deepEqual(again, migrated);
  });

  it("Kontra tanpa item pada skema 3 menghasilkan Kontra kosong yang belum lengkap (bukan SESUAI)", () => {
    const draft = v3Draft();
    const fields = draft.criticalFields.map((f) => (f.key === "kontraGaransi" ? { ...f, items: [], legacy: undefined } : f));
    const result = migrateChecklist({ ...draft, criticalFields: fields });
    assert.ok(result);
    assert.deepEqual(result.kontraGaransi.items, []);
    assert.equal(evaluateKontraGaransi(result.kontraGaransi).state, "BELUM LENGKAP");
  });
});
