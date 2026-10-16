import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recalculateMatches } from "../validation/three-way-match";
import { createEmptyChecklist } from "./factory";
import { setCriticalValue, setSharedValue } from "./mutations";
import { getRequirementSummaries } from "./requirement-summary";
import { TEXT_ALL_MATCH, mismatchText } from "./status-text";
import { makeSampleChecklist } from "./test-utils";
import type { BankGuaranteeChecklist } from "./types";

const asDraft = (c: BankGuaranteeChecklist): BankGuaranteeChecklist => ({
  ...c,
  status: "Draft",
  completedAt: undefined,
});

function critical(c: BankGuaranteeChecklist) {
  const item = getRequirementSummaries(c).find((s) => s.id === "critical");
  assert.ok(item && item.id === "critical");
  return item;
}

describe("ringkasan Syarat Penyelesaian (isi accordion)", () => {
  it("empat accordion dengan judul = nama step, tanpa deskripsi tambahan", () => {
    const items = getRequirementSummaries(createEmptyChecklist("Andi"));
    assert.deepEqual(
      items.map((i) => i.label),
      ["Informasi Aplikasi", "Document Verification", "Critical Field Validation", "Opini ADK"],
    );
  });

  it("checklist kosong: semua belum lengkap dan menyebut informasi yang perlu dilengkapi", () => {
    const items = getRequirementSummaries(createEmptyChecklist("Andi"));
    assert.ok(items.every((i) => !i.ok));
    // Document Verification: status mengikuti kondisi pemeriksaan (checklist kosong = semua Belum Diperiksa, biru).
    assert.ok(
      items.filter((i) => i.id !== "documents").every((i) => i.tone === "warning" && i.statusLabel === "Belum lengkap"),
    );
    const docsItem = items.find((i) => i.id === "documents");
    assert.ok(docsItem);
    assert.equal(docsItem.tone, "neutral");
    assert.equal(docsItem.statusLabel, "Belum Diperiksa");

    const [header, documents, crit, opinion] = items;
    assert.equal(header.id, "header");
    if (header.id === "header") assert.deepEqual(header.missing, ["Atas Nama", "CIF", "Jenis Pengajuan"]);
    if (documents.id === "documents") {
      assert.equal(documents.checked, 0);
      assert.equal(documents.unchecked.length, documents.total);
    }
    if (crit.id === "critical") {
      // Rasio critical field hanya menghitung tujuh field yang dibandingkan (bukan 8).
      assert.deepEqual(crit.counts, { total: 7, match: 0, mismatch: 0, incomplete: 7 });
      const note = (name: string) => crit.incompleteRows.find((r) => r.name === name)?.note;
      assert.equal(note("Beneficiary"), "Belum lengkap : 3 field belum terisi");
      assert.equal(note("Kontra Garansi"), "Belum lengkap : 3 field belum terisi");
      // Underlying / Dasar Penerbitan = Informasi Bersama: status sendiri, bukan critical field belum lengkap.
      assert.equal(note("Underlying / Dasar Penerbitan"), undefined);
      assert.deepEqual(crit.sharedInfo, {
        label: "Informasi Bersama",
        filled: false,
        statusLabel: "Belum diisi",
      });
    }
    if (opinion.id === "opinion") assert.equal(opinion.text, "");
  });

  it("kategori Critical Field dipisahkan dan dihitung dari data aktual", () => {
    // Fixture mismatch: 3 sesuai, 4 tidak sesuai (Beneficiary, Nilai, Biaya, Kontra), 1 bersama.
    const base = asDraft(makeSampleChecklist("mismatch"));
    let c = base;
    // Kosongkan satu sumber pada "Jenis Bank Garansi" (sebelumnya SESUAI) dan pada
    // "Beneficiary" (sebelumnya TIDAK SESUAI): keduanya menjadi Belum lengkap.
    const idOf = (key: string) => c.criticalFields.find((f) => f.key === key)!.id;
    c = setCriticalValue(c, idOf("jenisBg"), "mak", "");
    c = setCriticalValue(c, idOf("beneficiary"), "mak", "");
    c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };

    const item = critical(c);
    assert.deepEqual(item.counts, { total: 7, match: 2, mismatch: 3, incomplete: 2 });
    assert.equal(item.counts.match + item.counts.mismatch + item.counts.incomplete, item.counts.total);
    assert.equal(item.sharedInfo?.statusLabel, "Terisi");
    assert.deepEqual(item.mismatchRows.map((r) => r.name), ["Nilai Bank Garansi", "Biaya", "Kontra Garansi"]);
    assert.deepEqual(item.incompleteRows.map((r) => r.name), ["Jenis Bank Garansi", "Beneficiary"]);
    assert.equal(item.ok, false, "masih ada sumber kosong => syarat belum terpenuhi");
    assert.equal(item.tone, "danger", "TIDAK SESUAI yang terlihat tetap perlu ditinjau");
    assert.equal(item.statusLabel, "Belum lengkap & perlu ditinjau");
    assert.equal(item.status.kind, "mismatch-incomplete");
    assert.ok(!item.status.text.includes("Seluruh sumber terisi"));
  });

  it("sumber kosong tidak pernah dihitung sebagai mismatch", () => {
    let c = asDraft(makeSampleChecklist("clean"));
    const id = c.criticalFields.find((f) => f.key === "beneficiary")!.id;
    c = setCriticalValue(c, id, "underlyingDocument", "PT A");
    c = setCriticalValue(c, id, "ptk", "PT B"); // berbeda, tetapi Memorandum kosong
    c = setCriticalValue(c, id, "mak", "");
    c = { ...c, criticalFields: recalculateMatches(c.criticalFields) };
    const item = critical(c);
    assert.equal(item.counts.mismatch, 0);
    assert.equal(item.counts.incomplete, 1);
    assert.equal(item.incompleteRows[0].note, "Belum lengkap : 1 field belum terisi");
    assert.equal(item.statusLabel, "Belum lengkap");
    assert.equal(item.tone, "warning");
  });

  it("ada TIDAK SESUAI, seluruh sumber terisi: kalimat persis, status 'Perlu ditinjau', memblokir", () => {
    const c = asDraft(makeSampleChecklist("mismatch"));
    const item = critical(c);
    assert.equal(item.status.text, mismatchText(4));
    assert.equal(item.status.text, "Seluruh sumber terisi; terdapat 4 informasi yang belum sesuai.");
    assert.equal(item.ok, false, "TIDAK SESUAI menahan syarat penyelesaian");
    assert.equal(item.tone, "danger");
    assert.equal(item.statusLabel, "Perlu ditinjau");
    assert.deepEqual(item.counts, { total: 7, match: 3, mismatch: 4, incomplete: 0 });
    assert.equal(item.visibleMismatchRows, 4);
    assert.deepEqual(item.mismatchRows.map((r) => r.name), [
      "Beneficiary",
      "Nilai Bank Garansi",
      "Biaya",
      "Kontra Garansi",
    ]);
    assert.ok(item.mismatchRows.every((r) => r.reasons.length > 0 && !r.rowIncomplete));
  });

  it("seluruh sumber terisi dan sesuai: kalimat persis dan status 'Sesuai'", () => {
    const item = critical(asDraft(makeSampleChecklist("clean")));
    assert.equal(item.status.text, TEXT_ALL_MATCH);
    assert.equal(item.statusLabel, "Sesuai");
    assert.equal(item.tone, "success");
    assert.equal(item.ok, true);
    // Seluruh tujuh critical field sesuai => 7/7 (bukan 7/8). Underlying / Dasar Penerbitan =
    // Informasi Bersama: tidak dihitung sebagai critical field kedelapan dan tidak mengurangi rasio.
    assert.deepEqual(item.counts, { total: 7, match: 7, mismatch: 0, incomplete: 0 });
    assert.deepEqual(item.sharedInfo, { label: "Informasi Bersama", filled: true, statusLabel: "Terisi" });
  });

  it("Informasi Bersama kosong: critical field tetap 7/7, status Belum diisi, dan teks tidak menyebut critical field belum lengkap", () => {
    let c = asDraft(makeSampleChecklist("clean"));
    const underlying = c.criticalFields.find((f) => f.key === "underlying")!;
    c = setSharedValue(c, underlying.id, "   ");
    const item = critical(c);
    assert.deepEqual(item.counts, { total: 7, match: 7, mismatch: 0, incomplete: 0 });
    assert.deepEqual(item.sharedInfo, { label: "Informasi Bersama", filled: false, statusLabel: "Belum diisi" });
    assert.equal(item.ok, false, "Underlying wajib terisi untuk menyelesaikan");
    assert.deepEqual(item.incompleteRows, []);
    assert.equal(item.status.incompleteText, "Informasi Bersama (Underlying / Dasar Penerbitan) belum diisi.");
    assert.ok(!/\d+ dari \d+ critical field belum lengkap/.test(item.status.incompleteText ?? ""));
  });

  it("Document Verification: jumlah dan jenis dokumen yang sudah dan belum diperiksa", () => {
    let c = asDraft(makeSampleChecklist("clean")); // semua Ada kecuali Akta pendirian
    const docs = getRequirementSummaries(c).find((s) => s.id === "documents");
    assert.ok(docs && docs.id === "documents");
    assert.equal(docs.checked, docs.total);
    assert.deepEqual(docs.tidakAda, ["Akta pendirian"]);
    assert.equal(docs.ada.length, docs.total - 1);
    assert.equal(docs.ok, true);

    // Satu dokumen kembali belum diperiksa.
    c = {
      ...c,
      documentVerification: c.documentVerification.map((d) =>
        d.documentName === "KTP" ? { ...d, status: null } : d,
      ),
    };
    const partial = getRequirementSummaries(c).find((s) => s.id === "documents");
    assert.ok(partial && partial.id === "documents");
    assert.equal(partial.checked, partial.total - 1);
    assert.deepEqual(partial.unchecked, ["KTP"]);
    assert.equal(partial.ok, false);
    // Sampel clean memuat satu dokumen Tidak Ada: itu diprioritaskan sebagai status utama.
    assert.equal(partial.condition, "has-tidak-ada");
    assert.equal(partial.statusLabel, "Terdapat Dokumen yang Tidak Ada");
    assert.equal(partial.tone, "warning");
  });

  it("Document Verification: dokumen tambahan ikut dihitung (total dinamis) dan tampil di Belum Diperiksa dengan kategorinya", () => {
    const clean = asDraft(makeSampleChecklist("clean"));
    const before = getRequirementSummaries(clean).find((s) => s.id === "documents");
    assert.ok(before && before.id === "documents");
    assert.equal(before.total, clean.documentVerification.length, "total mengikuti data aktual");
    assert.equal(before.ada.length + before.tidakAda.length + before.unchecked.length, before.total);
    assert.equal(before.ok, true);
    assert.deepEqual(before.uncheckedItems, []);

    const c = {
      ...clean,
      documentVerification: [
        ...clean.documentVerification,
        {
          id: 999,
          documentName: "Surat kuasa",
          status: null,
          notes: "",
          categoryKey: "surat-surat-lainnya",
          custom: true,
        },
      ],
    };
    const docs = getRequirementSummaries(c).find((s) => s.id === "documents");
    assert.ok(docs && docs.id === "documents");
    assert.equal(docs.total, before.total + 1);
    assert.equal(docs.ada.length, before.ada.length, "dokumen baru belum dihitung sebagai Ada");
    assert.equal(docs.tidakAda.length, before.tidakAda.length, "...maupun Tidak Ada");
    assert.deepEqual(docs.unchecked, ["Surat kuasa"]);
    assert.deepEqual(docs.uncheckedItems, [
      { name: "Surat kuasa", categoryNo: 10, categoryTitle: "Surat-Surat Lainnya" },
    ]);
    assert.equal(docs.ok, false, "dokumen custom baru wajib diberi status juga (aturan penyelesaian tidak berubah)");
    assert.equal(docs.statusLabel, "Terdapat Dokumen yang Tidak Ada", "Tidak Ada (Akta pendirian) tetap menjadi status utama");
  });

  it("Document Verification: skenario semua Ada, campuran Ada/Tidak Ada, dan Belum Diperiksa", () => {
    const clean = asDraft(makeSampleChecklist("clean"));
    const find = (c: BankGuaranteeChecklist) => {
      const item = getRequirementSummaries(c).find((s) => s.id === "documents");
      assert.ok(item && item.id === "documents");
      return item;
    };
    // Semua Ada
    const allAda = find({
      ...clean,
      documentVerification: clean.documentVerification.map((d) => ({ ...d, status: "Ada" as const })),
    });
    assert.equal(allAda.ada.length, allAda.total);
    assert.equal(allAda.tidakAda.length, 0);
    assert.equal(allAda.unchecked.length, 0);
    // Campuran (sampel clean: satu dokumen Tidak Ada), semua sudah diperiksa
    const mixed = find(clean);
    assert.ok(mixed.tidakAda.length >= 1 && mixed.ada.length >= 1);
    assert.equal(mixed.unchecked.length, 0);
    assert.equal(mixed.checked, mixed.total);
    // Tidak Ada TIDAK dihitung sebagai Belum Diperiksa dan tidak masuk daftarnya
    assert.deepEqual(mixed.uncheckedItems, []);
    assert.ok(mixed.ok, "Tidak Ada tetap memenuhi aturan penyelesaian");
    assert.ok(!/Belum lengkap/i.test(mixed.statusLabel));
    assert.equal(mixed.statusLabel, "Terdapat Dokumen yang Tidak Ada");
    // Satu dokumen belum diperiksa + beberapa Tidak Ada: daftar hanya memuat yang belum diperiksa
    const target = clean.documentVerification.find((d) => d.documentName === "KTP")!;
    const withOne = find({
      ...clean,
      documentVerification: clean.documentVerification.map((d) => (d.id === target.id ? { ...d, status: null } : d)),
    });
    assert.deepEqual(withOne.uncheckedItems, [{ name: "KTP", categoryNo: 2, categoryTitle: "Identitas Debitur" }]);
    assert.equal(withOne.tidakAda.length, mixed.tidakAda.length, "jumlah Tidak Ada tidak berubah");
    assert.equal(withOne.ada.length, mixed.ada.length - 1);
    assert.equal(withOne.ada.length + withOne.tidakAda.length + withOne.unchecked.length, withOne.total);
    assert.ok(withOne.uncheckedItems.every((item) => !withOne.tidakAda.includes(item.name)));
  });

  it("subpoin Underlying Transaction wajib dijawab Ada/Tidak Ada seperti dokumen lain", () => {
    const clean = asDraft(makeSampleChecklist("clean"));
    const c = {
      ...clean,
      documentVerification: clean.documentVerification.map((d) =>
        d.categoryKey === "underlying-transaction" && d.documentName === "Surat Pengajuan Bank Garansi dari Applicant"
          ? { ...d, status: null }
          : d,
      ),
    };
    const docs = getRequirementSummaries(c).find((s) => s.id === "documents");
    assert.ok(docs && docs.id === "documents");
    assert.equal(docs.ok, false);
    assert.deepEqual(docs.uncheckedItems, [
      { name: "Surat Pengajuan Bank Garansi dari Applicant", categoryNo: 1, categoryTitle: "Underlying Transaction" },
    ]);
  });

  it("Nomor PKS kosong (PKS Ada): catatan aturan tersedia, tanpa mengubah jumlah Ada / Tidak Ada / Belum Diperiksa", () => {
    const clean = asDraft(makeSampleChecklist("clean"));
    const pks = clean.documentVerification.find(
      (d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama",
    )!;
    const base = getRequirementSummaries(clean).find((s) => s.id === "documents");
    const c = { ...clean, documentVerification: clean.documentVerification.map((d) => (d.id === pks.id ? { ...d, notes: "" } : d)) };
    const docs = getRequirementSummaries(c).find((s) => s.id === "documents");
    assert.ok(base && base.id === "documents" && docs && docs.id === "documents");
    assert.equal(docs.ok, false);
    assert.ok(docs.issues.length >= 1);
    assert.equal(docs.ada.length, base.ada.length);
    assert.equal(docs.tidakAda.length, base.tidakAda.length);
    assert.equal(docs.unchecked.length, 0);
  });

  describe("status ringkasan Document Verification per kondisi", () => {
    const docsOf = (c: BankGuaranteeChecklist) => {
      const item = getRequirementSummaries(c).find((s) => s.id === "documents");
      assert.ok(item && item.id === "documents");
      return item;
    };
    const withStatuses = (assign: (name: string, index: number) => "Ada" | "Tidak Ada" | null) => {
      const clean = asDraft(makeSampleChecklist("clean"));
      return {
        ...clean,
        documentVerification: clean.documentVerification.map((d, i) => ({ ...d, status: assign(d.documentName, i) })),
      };
    };

    it("A. semua Ada: badge hijau 'Lengkap', tanpa daftar Tidak Ada / Belum Diperiksa", () => {
      const d = docsOf(withStatuses(() => "Ada"));
      assert.equal(d.condition, "complete");
      assert.equal(d.tone, "success");
      assert.equal(d.statusLabel, "Lengkap");
      assert.equal(d.ada.length, d.total);
      assert.deepEqual([d.tidakAdaItems, d.uncheckedItems], [[], []]);
      assert.equal(d.ok, true);
    });

    it("B. ada Tidak Ada (semua sudah diperiksa): pesan persis, amber, daftar hanya dokumen Tidak Ada", () => {
      const d = docsOf(withStatuses((name) => (name === "KTP" || name === "SIUP" ? "Tidak Ada" : "Ada")));
      assert.equal(d.condition, "has-tidak-ada");
      assert.equal(d.tone, "warning");
      assert.equal(d.statusLabel, "Terdapat Dokumen yang Tidak Ada");
      assert.notEqual(d.statusLabel, "Perlu Perhatian");
      assert.deepEqual(d.tidakAdaItems.map((i) => i.name), ["KTP", "SIUP"]);
      assert.deepEqual(d.tidakAdaItems.map((i) => i.categoryTitle), ["Identitas Debitur", "Identitas Usaha Debitur"]);
      assert.equal(d.tidakAda.length, 2);
      assert.equal(d.unchecked.length, 0);
      assert.equal(d.ada.length + 2, d.total);
      assert.equal(d.ok, true, "Tidak Ada bukan kegagalan: aturan penyelesaian tidak berubah");
    });

    it("C. Ada + Belum Diperiksa (tanpa Tidak Ada): badge biru 'Belum Diperiksa', daftar hanya yang belum diperiksa", () => {
      const d = docsOf(withStatuses((name) => (name === "KTP" || name === "Gadai" ? null : "Ada")));
      assert.equal(d.condition, "has-unchecked");
      assert.equal(d.tone, "neutral");
      assert.equal(d.statusLabel, "Belum Diperiksa");
      assert.deepEqual(d.uncheckedItems.map((i) => i.name), ["KTP", "Gadai"]);
      assert.deepEqual(d.tidakAdaItems, []);
      assert.equal(d.ada.length + d.unchecked.length, d.total);
    });

    it("D. kombinasi Ada + Tidak Ada + Belum Diperiksa: status utama Tidak Ada, Belum Diperiksa tetap terpisah", () => {
      const d = docsOf(
        withStatuses((name) => (name === "KTP" ? null : name === "Fidusia" ? null : name === "NPWP" ? "Tidak Ada" : "Ada")),
      );
      assert.equal(d.condition, "has-tidak-ada");
      assert.equal(d.statusLabel, "Terdapat Dokumen yang Tidak Ada");
      assert.deepEqual(d.tidakAdaItems.map((i) => i.name), ["NPWP"]);
      assert.deepEqual(d.uncheckedItems.map((i) => i.name), ["KTP", "Fidusia"]);
      assert.ok(d.uncheckedItems.every((i) => !d.tidakAda.includes(i.name)), "Tidak Ada tidak dicampur ke Belum Diperiksa");
      assert.ok(d.tidakAdaItems.every((i) => !d.unchecked.includes(i.name)));
      assert.equal(d.ada.length + d.tidakAda.length + d.unchecked.length, d.total, "angka konsisten");
      assert.equal(d.ok, false, "dokumen belum diperiksa tetap menahan aturan penyelesaian");
    });

    it("subdokumen tambahan: total dan daftar ikut berubah (dinamis), tiap item dihitung sekali", () => {
      const base = withStatuses(() => "Ada");
      const before = docsOf(base);
      const add = (c: BankGuaranteeChecklist, id: number, name: string, status: "Ada" | "Tidak Ada" | null) => ({
        ...c,
        documentVerification: [
          ...c.documentVerification,
          { id, documentName: name, status, notes: "", categoryKey: "identitas-beneficiary", custom: true },
        ],
      });
      let c = add(base, 901, "NPWP Beneficiary", "Tidak Ada");
      c = add(c, 902, "Akta Beneficiary", null);
      const after = docsOf(c);
      assert.equal(after.total, before.total + 2);
      assert.equal(after.ada.length, before.ada.length);
      assert.deepEqual(after.tidakAdaItems.map((i) => [i.name, i.categoryTitle]), [["NPWP Beneficiary", "Identitas Beneficiary"]]);
      assert.deepEqual(after.uncheckedItems.map((i) => i.name), ["Akta Beneficiary"]);
      const all = [...after.ada, ...after.tidakAda, ...after.unchecked];
      assert.equal(all.length, after.total, "tidak ada item yang terhitung ganda");
    });

    it("nama dokumen panjang dibawa utuh ke daftar (pembungkusan ditangani tampilan)", () => {
      const long = "Surat Kuasa Khusus Pemberian Hak Tanggungan Atas Tanah Dan Bangunan Beserta Seluruh Benda Yang Berkaitan";
      const base = withStatuses(() => "Ada");
      const c = {
        ...base,
        documentVerification: [
          ...base.documentVerification,
          { id: 903, documentName: long, status: "Tidak Ada" as const, notes: "", categoryKey: "surat-surat-lainnya", custom: true },
        ],
      };
      assert.deepEqual(docsOf(c).tidakAdaItems.map((i) => i.name), [long]);
    });

    it("aturan Nomor PKS (PKS Ada tanpa nomor) tanpa Tidak Ada/Belum Diperiksa: bukan 'Lengkap'", () => {
      const base = withStatuses(() => "Ada");
      const pks = base.documentVerification.find((d) => d.categoryKey === "identitas-beneficiary" && d.documentName === "Perjanjian Kerja Sama")!;
      const c = { ...base, documentVerification: base.documentVerification.map((d) => (d.id === pks.id ? { ...d, notes: "" } : d)) };
      const d = docsOf(c);
      assert.equal(d.condition, "rule-issue");
      assert.notEqual(d.statusLabel, "Lengkap");
      assert.equal(d.ok, false);
      assert.ok(d.issues.length >= 1);
    });
  });

  it("Opini ADK: terisi dan kosong", () => {
    const filled = getRequirementSummaries(asDraft(makeSampleChecklist("clean"))).find((s) => s.id === "opinion");
    assert.ok(filled && filled.id === "opinion" && filled.ok);
    assert.match(filled.text, /Opini ADK baris 1/);
    const empty = getRequirementSummaries({ ...asDraft(makeSampleChecklist("clean")), opiniAdk: "  " }).find(
      (s) => s.id === "opinion",
    );
    assert.ok(empty && !empty.ok && empty.statusLabel === "Belum lengkap");
  });
});
