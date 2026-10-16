import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptyChecklist } from "./factory";
import { hasRetiredPointData, migrateChecklist } from "./migrate";
import { getPksInfo } from "./pks";
import { SCHEMA_VERSION } from "./types";

type RawDoc = {
  id: number;
  documentName: string;
  status: "Ada" | "Tidak Ada" | null;
  notes: string;
  categoryKey: string;
  custom: boolean;
};

const retiredRow = (
  id: number,
  categoryKey: string,
  documentName: string,
  status: RawDoc["status"] = null,
  notes = "",
): RawDoc => ({ id, documentName, status, notes, categoryKey, custom: false });

/** Bentuk data tersimpan skema 5 (v7): tiga baris langsung poin 1-3 masih ada. */
function storedV5(filled = true) {
  const stored = JSON.parse(JSON.stringify(createEmptyChecklist("Andi")));
  stored.schemaVersion = 5;
  stored.status = "Done";
  stored.completedAt = "2026-10-14T05:00:00.000Z";
  stored.documentVerification.unshift(
    retiredRow(901, "surat-permohonan", "Surat Permohonan Bank Garansi dari Beneficiary", filled ? "Ada" : null, filled ? "No. 1" : ""),
    retiredRow(902, "permohonan-distributor", "Surat Pengajuan Bank Garansi dari Applicant", filled ? "Tidak Ada" : null),
    retiredRow(903, "perjanjian-kerja-sama", "Perjanjian Kerja Sama", filled ? "Ada" : null, filled ? "PKS/LAMA/9" : ""),
  );
  // Isian pada subpoin yang dipertahankan harus selamat.
  const doc = (category: string, name: string): RawDoc =>
    stored.documentVerification.find((d: RawDoc) => d.categoryKey === category && d.documentName === name);
  Object.assign(doc("underlying-transaction", "Surat Permohonan Bank Garansi dari Beneficiary"), {
    status: "Ada",
    notes: "UT-123",
  });
  Object.assign(doc("identitas-beneficiary", "Perjanjian Kerja Sama"), { status: "Ada", notes: "PKS/045/BRI-BFLP/2026" });
  return stored;
}

describe("migrasi skema 5 -> 6 (hapus tiga poin duplikat)", () => {
  it("baris bawaan poin 1-3 dibuang; subpoin di Underlying Transaction dan PKS Identitas Beneficiary utuh", () => {
    const next = migrateChecklist(storedV5());
    assert.ok(next);
    assert.equal(next.schemaVersion, SCHEMA_VERSION);
    for (const key of ["surat-permohonan", "permohonan-distributor", "perjanjian-kerja-sama"]) {
      assert.equal(next.documentVerification.filter((d) => d.categoryKey === key).length, 0, key);
    }
    const underlying = next.documentVerification.find(
      (d) =>
        d.categoryKey === "underlying-transaction" &&
        d.documentName === "Surat Permohonan Bank Garansi dari Beneficiary",
    );
    assert.deepEqual([underlying?.status, underlying?.notes, underlying?.custom], ["Ada", "UT-123", false]);
    const info = getPksInfo(next.documentVerification);
    assert.equal(info.text, "PKS ada dengan Nomor PKS/045/BRI-BFLP/2026");
    // Tidak ada baris yatim: setiap dokumen berada pada kategori yang dikenal.
    const groupedCount = next.documentVerification.length;
    assert.equal(groupedCount, createEmptyChecklist("Andi").documentVerification.length);
  });

  it("status Done, opini, dan timestamp tidak berubah", () => {
    const next = migrateChecklist(storedV5());
    assert.ok(next);
    assert.equal(next.status, "Done");
    assert.equal(next.completedAt, "2026-10-14T05:00:00.000Z");
  });

  it("dokumen tambahan ADK pada poin yang dihapus tidak hilang: dipindahkan ke Surat-Surat Lainnya", () => {
    const stored = storedV5();
    stored.documentVerification.push(
      { id: 950, documentName: "Surat kuasa", status: "Ada", notes: "asli", categoryKey: "surat-permohonan", custom: true },
      { id: 951, documentName: "Addendum PKS", status: "Tidak Ada", notes: "menyusul", categoryKey: "perjanjian-kerja-sama", custom: true },
    );
    const next = migrateChecklist(stored);
    assert.ok(next);
    const moved = next.documentVerification.filter((d) => [950, 951].includes(d.id));
    assert.deepEqual(
      moved.map((d) => [d.id, d.documentName, d.categoryKey, d.custom, d.status, d.notes]),
      [
        [950, "Surat kuasa", "surat-surat-lainnya", true, "Ada", "asli"],
        [951, "Addendum PKS", "surat-surat-lainnya", true, "Tidak Ada", "menyusul"],
      ],
    );
  });

  it("nama kembar dengan dokumen yang sudah ada di Surat-Surat Lainnya diberi akhiran (keduanya tetap ada)", () => {
    const stored = storedV5();
    stored.documentVerification.push(
      { id: 960, documentName: "Surat kuasa", status: "Ada", notes: "lama", categoryKey: "surat-surat-lainnya", custom: true },
      { id: 961, documentName: "Surat kuasa", status: "Tidak Ada", notes: "dari poin 1", categoryKey: "surat-permohonan", custom: true },
    );
    const next = migrateChecklist(stored);
    assert.ok(next);
    const lainnya = next.documentVerification.filter((d) => d.categoryKey === "surat-surat-lainnya");
    assert.deepEqual(
      lainnya.map((d) => [d.id, d.documentName, d.notes]),
      [
        [960, "Surat kuasa", "lama"],
        [961, "Surat kuasa (dari poin lama)", "dari poin 1"],
      ],
    );
  });

  it("data skema 4 (belum ada kategori baru) langsung ke skema 6 tanpa kehilangan dokumen lain", () => {
    const stored = storedV5();
    stored.schemaVersion = 4;
    stored.documentVerification = stored.documentVerification.filter(
      (d: RawDoc) => !["underlying-transaction", "identitas-beneficiary"].includes(d.categoryKey),
    );
    const ktp = stored.documentVerification.find((d: RawDoc) => d.documentName === "KTP");
    Object.assign(ktp, { status: "Ada", notes: "asli" });
    const next = migrateChecklist(stored);
    assert.ok(next);
    const fresh = createEmptyChecklist("Andi");
    assert.equal(next.documentVerification.length, fresh.documentVerification.length);
    assert.deepEqual(
      [next.documentVerification.find((d) => d.documentName === "KTP")?.status, next.documentVerification.find((d) => d.documentName === "KTP")?.notes],
      ["Ada", "asli"],
    );
    assert.equal(getPksInfo(next.documentVerification).state, "belum-dipilih");
  });

  it("idempoten: memigrasikan ulang hasil migrasi tidak mengubah apa pun", () => {
    const stored = storedV5();
    stored.documentVerification.push(
      { id: 950, documentName: "Surat kuasa", status: "Ada", notes: "asli", categoryKey: "surat-permohonan", custom: true },
    );
    const once = migrateChecklist(stored);
    assert.ok(once);
    assert.deepEqual(migrateChecklist(JSON.parse(JSON.stringify(once))), once);
  });

  it("checklist skema 5 dengan poin 1-3 belum dijawab tetap bermigrasi (tidak ada syarat baru yang dilanggar)", () => {
    const next = migrateChecklist(storedV5(false));
    assert.ok(next);
    assert.equal(next.documentVerification.some((d) => d.categoryKey === "surat-permohonan"), false);
  });
});

describe("hasRetiredPointData (dasar cadangan sebelum data poin dibuang)", () => {
  it("true hanya bila baris bawaan poin yang dihapus sudah diisi (status atau keterangan)", () => {
    assert.equal(hasRetiredPointData(storedV5(true)), true);
    assert.equal(hasRetiredPointData(storedV5(false)), false, "baris kosong tidak perlu dicadangkan");
    const notesOnly = storedV5(false);
    notesOnly.documentVerification.find((d: RawDoc) => d.categoryKey === "perjanjian-kerja-sama").notes = "catatan";
    assert.equal(hasRetiredPointData(notesOnly), true);
  });

  it("false untuk dokumen tambahan (tidak dibuang) dan untuk data skema terbaru", () => {
    const stored = storedV5(false);
    stored.documentVerification.push(
      { id: 950, documentName: "Surat kuasa", status: "Ada", notes: "asli", categoryKey: "surat-permohonan", custom: true },
    );
    assert.equal(hasRetiredPointData(stored), false);
    assert.equal(hasRetiredPointData(createEmptyChecklist("Andi")), false);
    assert.equal(hasRetiredPointData(null), false);
    assert.equal(hasRetiredPointData({ documentVerification: "bukan array" }), false);
  });
});
