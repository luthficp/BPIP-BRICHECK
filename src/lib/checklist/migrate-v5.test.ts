import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateField } from "../validation/three-way-match";
import { createEmptyChecklist } from "./factory";
import { migrateChecklist } from "./migrate";
import { getPksInfo } from "./pks";
import { SCHEMA_VERSION, type FeesCriticalField } from "./types";

/**
 * Bentuk data tersimpan skema 4 (v6): tiga baris langsung (poin 1-3, dua di antaranya bernama lama),
 * tanpa kategori Underlying Transaction / Identitas Beneficiary, dan Biaya dengan empat komponen tetap.
 */
function storedV4(feeSources: Record<"underlyingDocument" | "ptk" | "mak", Record<string, string>>) {
  const stored = JSON.parse(JSON.stringify(createEmptyChecklist("Andi")));
  stored.schemaVersion = 4;
  stored.atasNama = "PT INBISCO";
  stored.documentVerification = stored.documentVerification
    .filter((d: { categoryKey: string }) => !["underlying-transaction", "identitas-beneficiary"].includes(d.categoryKey))
    ;
  // Baris langsung poin 1-3 (skema 4) dengan isian pengguna; ketiganya dihapus pada skema 6.
  stored.documentVerification.unshift(
    { id: 901, documentName: "Surat Permohonan Bank Garansi", status: "Ada", notes: "tgl 1 Okt", categoryKey: "surat-permohonan", custom: false },
    { id: 902, documentName: "Permohonan Distributor", status: "Tidak Ada", notes: "menyusul", categoryKey: "permohonan-distributor", custom: false },
    { id: 903, documentName: "Perjanjian Kerja Sama", status: "Ada", notes: "PKS/LAMA/1", categoryKey: "perjanjian-kerja-sama", custom: false },
  );
  // Isian pengguna yang harus selamat.
  const ktp = stored.documentVerification.find((d: { documentName: string }) => d.documentName === "KTP");
  Object.assign(ktp, { status: "Ada", notes: "asli" });
  const biaya = stored.criticalFields.find((f: { key: string }) => f.key === "biaya");
  delete biaya.components;
  Object.assign(biaya, feeSources);
  return stored;
}

const biayaOf = (c: NonNullable<ReturnType<typeof migrateChecklist>>): FeesCriticalField => {
  const field = c.criticalFields.find((f) => f.key === "biaya");
  assert.ok(field && field.key === "biaya");
  return field;
};

describe("migrasi skema 4 -> terbaru (v7 + v8)", () => {
  const blank = { provisi: "", administrasi: "", notaris: "", lainnya: "" };

  it("versi naik ke terbaru; baris poin 1-3 dibuang, dokumen lain dan header utuh", () => {
    const next = migrateChecklist(storedV4({ underlyingDocument: blank, ptk: blank, mak: blank }));
    assert.ok(next);
    assert.equal(next.schemaVersion, SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 6);
    for (const key of ["surat-permohonan", "permohonan-distributor", "perjanjian-kerja-sama"]) {
      assert.equal(next.documentVerification.filter((d) => d.categoryKey === key).length, 0, key);
    }
    // Isian poin lama tidak muncul di tempat lain (PKS Identitas Beneficiary dimulai kosong).
    const pks = next.documentVerification.find(
      (d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama",
    );
    assert.deepEqual([pks?.status, pks?.notes], [null, ""]);
    const ktp = next.documentVerification.find((d) => d.documentName === "KTP");
    assert.deepEqual([ktp?.status, ktp?.notes], ["Ada", "asli"]);
    assert.equal(next.atasNama, "PT INBISCO");
  });

  it("kategori baru ditambahkan belum diperiksa; id dokumen unik", () => {
    const next = migrateChecklist(storedV4({ underlyingDocument: blank, ptk: blank, mak: blank }));
    assert.ok(next);
    const names = (key: string) =>
      next.documentVerification.filter((d) => d.categoryKey === key).map((d) => [d.documentName, d.status, d.notes]);
    assert.deepEqual(names("underlying-transaction"), [
      ["PKS/Surat Penunjukkan antara Applicant & Beneficiary", null, ""],
      ["Surat Permohonan Bank Garansi dari Beneficiary", null, ""],
      ["Surat Pengajuan Bank Garansi dari Applicant", null, ""],
    ]);
    assert.deepEqual(names("identitas-beneficiary"), [
      ["Nama Beneficiary", null, ""],
      ["Alamat", null, ""],
      ["Perjanjian Kerja Sama", null, ""],
    ]);
    // Dokumen bernama sama pada kategori berbeda tetap dokumen terpisah.
    const ids = next.documentVerification.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(getPksInfo(next.documentVerification).state, "belum-dipilih");
  });

  it("Biaya lama tanpa isian Notaris/Lainnya: hanya Provisi dan Administrasi, nilai lama utuh, tanpa nilai yatim", () => {
    const next = migrateChecklist(
      storedV4({
        underlyingDocument: { provisi: "500000", administrasi: "250000", notaris: "", lainnya: "" },
        ptk: { provisi: "500000", administrasi: "250000", notaris: "", lainnya: "" },
        mak: { provisi: "500000", administrasi: "250000", notaris: "", lainnya: "" },
      }),
    );
    assert.ok(next);
    const biaya = biayaOf(next);
    assert.deepEqual(biaya.components.map((c) => [c.id, c.label, c.custom]), [
      ["provisi", "Provisi", false],
      ["administrasi", "Administrasi", false],
    ]);
    for (const source of ["underlyingDocument", "ptk", "mak"] as const) {
      assert.deepEqual(biaya[source], { provisi: "500000", administrasi: "250000" });
    }
    assert.equal(evaluateField(biaya).state, "SESUAI");
  });

  it("Biaya lama dengan Notaris/Lainnya terisi: dipertahankan sebagai field tambahan pada ketiga sumber (data tidak hilang)", () => {
    const next = migrateChecklist(
      storedV4({
        underlyingDocument: { provisi: "1", administrasi: "2", notaris: "150000", lainnya: "" },
        ptk: { provisi: "1", administrasi: "2", notaris: "150000", lainnya: "" },
        mak: { provisi: "1", administrasi: "2", notaris: "", lainnya: "" },
      }),
    );
    assert.ok(next);
    const biaya = biayaOf(next);
    assert.deepEqual(biaya.components.map((c) => [c.id, c.label, c.custom]), [
      ["provisi", "Provisi", false],
      ["administrasi", "Administrasi", false],
      ["notaris", "Notaris", true],
    ]);
    assert.equal(biaya.underlyingDocument.notaris, "150000");
    assert.equal(biaya.ptk.notaris, "150000");
    assert.equal(biaya.mak.notaris, "", "tetap kosong => baris belum lengkap, bukan SESUAI");
    assert.equal(evaluateField(biaya).state, "BELUM LENGKAP");
    // "Lainnya" kosong di semua sumber tidak dibawa.
    for (const source of ["underlyingDocument", "ptk", "mak"] as const) {
      assert.equal("lainnya" in biaya[source], false);
    }
  });

  it("idempoten: memigrasikan ulang hasil migrasi tidak mengubah apa pun", () => {
    const once = migrateChecklist(
      storedV4({
        underlyingDocument: { provisi: "1", administrasi: "2", notaris: "3", lainnya: "4" },
        ptk: { provisi: "1", administrasi: "2", notaris: "3", lainnya: "4" },
        mak: { provisi: "1", administrasi: "2", notaris: "3", lainnya: "4" },
      }),
    );
    assert.ok(once);
    const twice = migrateChecklist(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(twice, once);
    assert.deepEqual(biayaOf(once).components.map((c) => c.label), ["Provisi", "Administrasi", "Notaris", "Lainnya"]);
  });

  it("field biaya tambahan versi 7 selamat dari simpan -> muat (id, nama, urutan, nilai)", () => {
    const base = createEmptyChecklist("Andi");
    const stored = JSON.parse(JSON.stringify(base));
    const biaya = stored.criticalFields.find((f: { key: string }) => f.key === "biaya");
    biaya.components.push({ id: "fee-abc", label: "Asuransi Kredit", custom: true });
    for (const source of ["underlyingDocument", "ptk", "mak"]) biaya[source]["fee-abc"] = "99";
    const next = migrateChecklist(JSON.parse(JSON.stringify(stored)));
    assert.ok(next);
    const loaded = biayaOf(next);
    assert.deepEqual(loaded.components.map((c) => [c.id, c.label, c.custom]), [
      ["provisi", "Provisi", false],
      ["administrasi", "Administrasi", false],
      ["fee-abc", "Asuransi Kredit", true],
    ]);
    for (const source of ["underlyingDocument", "ptk", "mak"] as const) {
      assert.equal(loaded[source]["fee-abc"], "99");
    }
  });
});
