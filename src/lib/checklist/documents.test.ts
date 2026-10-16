import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOCUMENT_CATEGORIES,
  getCategoryStaticItems,
  getDocumentCategory,
  REMOVED_DOCUMENT_CATEGORY_KEYS,
} from "./config";
import {
  documentHasData,
  findDuplicateDocument,
  groupDocuments,
  normalizeDocumentName,
  totalsOf,
} from "./documents";
import { createEmptyChecklist } from "./factory";
import {
  addCustomDocument,
  removeCustomDocument,
  setDocumentNotes,
  setDocumentStatus,
} from "./mutations";

const groupOf = (documents: Parameters<typeof groupDocuments>[0], key: string) => {
  const group = groupDocuments(documents).find((g) => g.key === key);
  assert.ok(group, key);
  return group;
};

describe("Document Verification berkategori", () => {
  const c = createEmptyChecklist("Andi");

  it("10 kategori; kategori dibuat dari konfigurasi dengan subkategori awal", () => {
    const groups = groupDocuments(c.documentVerification);
    assert.equal(groups.length, 10);
    assert.deepEqual(
      groups.map((g) => g.documents.length),
      DOCUMENT_CATEGORIES.map((cat) => getCategoryStaticItems(cat).length),
    );
    // Hanya "Surat-Surat Lainnya" yang belum punya baris awal (ADK menambahkannya lewat tombol +).
    assert.deepEqual(
      groups.filter((g) => g.documents.length === 0).map((g) => g.title),
      ["Surat-Surat Lainnya"],
    );
  });

  it("tiga poin duplikat sudah dihapus: tidak ada baris langsung dan tidak ada kategori bernama sama", () => {
    const groups = groupDocuments(c.documentVerification);
    const titles = groups.map((g) => g.title);
    for (const removed of [
      "Surat Permohonan Bank Garansi dari Beneficiary",
      "Surat Pengajuan Bank Garansi dari Applicant",
      "Perjanjian Kerja Sama",
    ]) {
      assert.ok(!titles.includes(removed), removed);
    }
    for (const key of REMOVED_DOCUMENT_CATEGORY_KEYS) {
      assert.equal(getDocumentCategory(key), undefined, key);
      assert.ok(!c.documentVerification.some((d) => d.categoryKey === key), key);
    }
    // Setiap kategori adalah akordeon dengan nomor kategori.urut; tidak ada baris bernomor tunggal.
    assert.ok(groups.every((g) => g.documents.every((d) => /^\d+\.\d+$/.test(d.label))));
  });

  it("urutan kategori: Underlying Transaction pertama; Identitas Beneficiary tepat setelah Identitas Debitur", () => {
    const titles = groupDocuments(c.documentVerification).map((g) => g.title);
    assert.deepEqual(titles, [
      "Underlying Transaction",
      "Identitas Debitur",
      "Identitas Beneficiary",
      "Identitas Usaha Debitur",
      "Surat Utang",
      "Pengikatan Agunan",
      "Bukti Kepemilikan Agunan",
      "Pemeriksaan Agunan",
      "Paket Bank Garansi",
      "Surat-Surat Lainnya",
    ]);
    assert.equal(titles.indexOf("Identitas Beneficiary"), titles.indexOf("Identitas Debitur") + 1);
  });

  it("Identitas Beneficiary tetap memuat Nama Beneficiary, Alamat, dan Perjanjian Kerja Sama", () => {
    const group = groupOf(c.documentVerification, "identitas-beneficiary");
    assert.deepEqual(group.documents.map((d) => d.documentName), [
      "Nama Beneficiary",
      "Alamat",
      "Perjanjian Kerja Sama",
    ]);
    assert.ok(group.documents.every((d) => d.status === null && !d.custom));
  });

  it("Underlying Transaction tetap memuat tiga subpoin bawaan berurutan (termasuk yang bernama sama dengan poin yang dihapus)", () => {
    const group = groupOf(c.documentVerification, "underlying-transaction");
    assert.deepEqual(group.documents.map((d) => d.documentName), [
      "PKS/Surat Penunjukkan antara Applicant & Beneficiary",
      "Surat Permohonan Bank Garansi dari Beneficiary",
      "Surat Pengajuan Bank Garansi dari Applicant",
    ]);
    assert.ok(group.documents.every((d) => !d.custom));
  });

  it("mengisi subpoin Underlying Transaction tidak memengaruhi dokumen lain (dan sebaliknya)", () => {
    const underlying = c.documentVerification.find(
      (d) =>
        d.categoryKey === "underlying-transaction" &&
        d.documentName === "Surat Permohonan Bank Garansi dari Beneficiary",
    )!;
    const pks = c.documentVerification.find(
      (d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama",
    )!;
    let next = setDocumentStatus(c, underlying.id, "Ada");
    next = setDocumentNotes(next, underlying.id, "No. 123/UT");
    const after = (id: number) => next.documentVerification.find((d) => d.id === id)!;
    assert.equal(after(underlying.id).status, "Ada");
    assert.equal(after(underlying.id).notes, "No. 123/UT");
    assert.equal(after(pks.id).status, null);
    assert.equal(after(pks.id).notes, "");
    assert.equal(
      next.documentVerification.filter((d) => d.status !== null).length,
      1,
      "hanya satu dokumen yang berubah",
    );
  });

  it("penomoran konsisten: kategori.urut (mis. 1.1, 1.2)", () => {
    const groups = groupDocuments(c.documentVerification);
    assert.deepEqual(
      groups[0].documents.map((d) => `${d.label} ${d.documentName}`),
      [
        "1.1 PKS/Surat Penunjukkan antara Applicant & Beneficiary",
        "1.2 Surat Permohonan Bank Garansi dari Beneficiary",
        "1.3 Surat Pengajuan Bank Garansi dari Applicant",
      ],
    );
    assert.deepEqual(
      groups[1].documents.map((d) => `${d.label} ${d.documentName}`),
      ["2.1 KTP", "2.2 Kartu Keluarga", "2.3 Copy surat kewarganegaraan/surat keterangan ganti nama", "2.4 Foto debitur"],
    );
    assert.deepEqual(
      groups[2].documents.map((d) => `${d.label} ${d.documentName}`),
      ["3.1 Nama Beneficiary", "3.2 Alamat", "3.3 Perjanjian Kerja Sama"],
    );
    assert.equal(groupOf(c.documentVerification, "pengikatan-agunan").documents[7].label, "6.8");
  });

  it("kategori bukan dokumen: tidak ada entri dokumen untuk judul kategori", () => {
    const names = new Set(c.documentVerification.map((d) => d.documentName));
    for (const category of DOCUMENT_CATEGORIES) {
      // "Perjanjian Kerja Sama" hanya ada sebagai subpoin (Identitas Beneficiary), bukan kategori.
      assert.equal(names.has(category.title), false, category.title);
    }
  });
});

describe("tombol + : menambah subkategori custom", () => {
  const c = createEmptyChecklist("Andi");

  it("menambah pada kategori kosong menghasilkan nomor 10.1 dan ditandai custom", () => {
    const result = addCustomDocument(c, "surat-surat-lainnya", "  Surat   kuasa ");
    assert.ok(result.ok);
    const added = result.checklist.documentVerification.find((d) => d.id === result.documentId);
    assert.deepEqual(
      [added?.documentName, added?.categoryKey, added?.custom, added?.status, added?.notes],
      ["Surat kuasa", "surat-surat-lainnya", true, null, ""],
    );
    const group = groupOf(result.checklist.documentVerification, "surat-surat-lainnya");
    assert.deepEqual(group.documents.map((d) => d.label), ["10.1"]);
  });

  it("tombol + tersedia di SELURUH kategori accordion (termasuk Underlying Transaction & Identitas Beneficiary)", () => {
    for (const category of DOCUMENT_CATEGORIES) {
      const result = addCustomDocument(c, category.key, "Dokumen tambahan uji");
      assert.ok(result.ok, category.key);
      const group = groupOf(result.checklist.documentVerification, category.key);
      const added = group.documents.at(-1)!;
      assert.equal(added.documentName, "Dokumen tambahan uji");
      assert.equal(added.custom, true);
      assert.equal(group.documents.length, getCategoryStaticItems(category).length + 1);
    }
  });

  it("subpoin bawaan Identitas Beneficiary tidak dapat dihapus; yang ditambahkan dapat dihapus", () => {
    const added = addCustomDocument(c, "identitas-beneficiary", "NPWP Beneficiary");
    assert.ok(added.ok);
    const group = groupOf(added.checklist.documentVerification, "identitas-beneficiary");
    assert.deepEqual(group.documents.map((d) => d.label), ["3.1", "3.2", "3.3", "3.4"]);
    const removed = removeCustomDocument(added.checklist, added.documentId);
    assert.equal(removed.documentVerification.length, c.documentVerification.length);
    const pks = c.documentVerification.find((d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama")!;
    assert.equal(removeCustomDocument(c, pks.id).documentVerification.length, c.documentVerification.length);
  });

  it("menambah pada kategori yang tidak dikenal (mis. poin yang dihapus) ditolak dan data tidak berubah", () => {
    for (const key of REMOVED_DOCUMENT_CATEGORY_KEYS) {
      const result = addCustomDocument(c, key, "Surat kuasa");
      assert.equal(result.ok, false, key);
      assert.equal(!result.ok && result.reason, "unknown-category");
    }
    assert.equal(c.documentVerification.length, createEmptyChecklist("Andi").documentVerification.length);
  });

  it("menambah pada kategori berisi diletakkan setelah subkategori yang ada", () => {
    const result = addCustomDocument(c, "identitas-debitur", "Surat nikah");
    assert.ok(result.ok);
    const group = groupOf(result.checklist.documentVerification, "identitas-debitur");
    assert.equal(group.documents.at(-1)?.label, "2.5");
    assert.equal(group.documents.at(-1)?.documentName, "Surat nikah");
  });

  it("nama kosong ditolak", () => {
    for (const name of ["", "   "]) {
      const result = addCustomDocument(c, "identitas-debitur", name);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "empty");
    }
  });

  it("nama kembar pada kategori yang sama ditolak (tanpa peduli kapitalisasi/spasi)", () => {
    const result = addCustomDocument(c, "identitas-debitur", "  ktp ");
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, "duplicate");
    assert.ok(findDuplicateDocument(c.documentVerification, "identitas-debitur", "KARTU   KELUARGA"));
    // Nama yang sama di kategori lain diperbolehkan.
    assert.equal(addCustomDocument(c, "surat-surat-lainnya", "KTP").ok, true);
  });

  it("hapus hanya untuk dokumen custom; subkategori statis tidak dapat dihapus", () => {
    const added = addCustomDocument(c, "surat-surat-lainnya", "Surat kuasa");
    assert.ok(added.ok);
    const removed = removeCustomDocument(added.checklist, added.documentId);
    assert.equal(removed.documentVerification.length, c.documentVerification.length);
    const staticDoc = c.documentVerification[0];
    assert.equal(removeCustomDocument(c, staticDoc.id).documentVerification.length, c.documentVerification.length);
  });

  it("dokumen berisi status/keterangan dikenali sebagai 'berisi data' (untuk konfirmasi hapus)", () => {
    const added = addCustomDocument(c, "surat-surat-lainnya", "Surat kuasa");
    assert.ok(added.ok);
    let next = added.checklist;
    const doc = () => next.documentVerification.find((d) => d.id === added.documentId)!;
    assert.equal(documentHasData(doc()), false);
    next = setDocumentNotes(next, added.documentId, "catatan");
    assert.equal(documentHasData(doc()), true);
    next = setDocumentNotes(next, added.documentId, "");
    next = setDocumentStatus(next, added.documentId, "Tidak Ada");
    assert.equal(documentHasData(doc()), true);
  });

  it("total dokumen termasuk dokumen custom", () => {
    const added = addCustomDocument(c, "surat-surat-lainnya", "Surat kuasa");
    assert.ok(added.ok);
    const totals = totalsOf(added.checklist.documentVerification);
    assert.equal(totals.total, c.documentVerification.length + 1);
    assert.equal(totals.unchecked, totals.total);
    assert.equal(normalizeDocumentName("  A  b "), "a b");
  });
});
