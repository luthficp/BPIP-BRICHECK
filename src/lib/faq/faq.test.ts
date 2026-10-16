import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FAQ_SECTIONS, REQUIRED_GLOSSARY_TERMS } from "./content";

describe("konten FAQ", () => {
  const section = (id: string) => {
    const found = FAQ_SECTIONS.find((s) => s.id === id);
    assert.ok(found, `bagian ${id} ada`);
    return found;
  };

  it("memuat bagian Tentang, Panduan, Pertanyaan, dan Glosarium", () => {
    assert.deepEqual(
      FAQ_SECTIONS.map((s) => s.id),
      ["tentang", "panduan", "pertanyaan", "glosarium"],
    );
  });

  it("menyatakan BRICHECK bukan sistem approval", () => {
    const text = JSON.stringify(section("tentang"));
    assert.match(text, /bukan sistem approval/);
    assert.match(text, /BRICHECK — BRI Checklist & Validation/);
  });

  it("fungsi BRICHECK memuat keenam tujuan dari spesifikasi", () => {
    const fungsi = section("tentang").items.find((i) => i.id === "fungsi");
    assert.ok(fungsi?.points);
    assert.equal(fungsi.points.length, 6);
    const joined = fungsi.points.join(" ");
    for (const phrase of [
      "memandu ADK",
      "membandingkan informasi",
      "Hasil Validasi",
      "menyorot",
      "human error",
      "review manual SOK",
    ]) {
      assert.ok(joined.includes(phrase), `memuat "${phrase}"`);
    }
  });

  it("panduan mengikuti alur kerja aplikasi (10 langkah berurutan)", () => {
    const steps = section("panduan").items.map((i) => i.question);
    assert.equal(steps.length, 10);
    assert.deepEqual(steps, [
      "Buka Task Monitoring",
      "Create Checklist dan isi Nama Lengkap ADK",
      "Isi Informasi Pengajuan",
      "Document Verification",
      "Critical Field Validation",
      "Hasil Validasi",
      "Opini ADK",
      "Summary & Output",
      "Buka Kembali sebagai Draft",
      "Review SOK dengan tanda tangan basah",
    ]);
  });

  it("langkah Summary & Output menjelaskan empat accordion Syarat Penyelesaian", () => {
    const step8 = section("panduan").items.find((i) => i.id === "langkah-8");
    assert.ok(step8);
    const text = step8.answer.join(" ");
    assert.ok(text.includes("empat accordion Syarat Penyelesaian"));
    assert.ok(text.includes("jumlah dokumen berstatus Ada dan Tidak Ada"), "ringkasan DV berupa overview jumlah");
    assert.ok(text.includes('"Lengkap"') && text.includes("Terdapat Dokumen yang Tidak Ada"), "status DV per kondisi dijelaskan");
    assert.ok(text.includes("Belum Diperiksa"), "bagian Belum Diperiksa dijelaskan");
    assert.ok(!text.includes("Perlu Perhatian"), "label Perlu Perhatian tidak dipakai");
    for (const title of [
      "Informasi Aplikasi",
      "Document Verification",
      "Critical Field Validation",
      "Opini ADK",
    ]) {
      assert.ok(text.includes(title), `memuat ${title}`);
    }
    assert.ok(text.includes("Export PDF") && text.includes("Export Word") && text.includes("Print") && text.includes("Pratinjau"));
  });

  it("Hasil Validasi menjelaskan status Belum lengkap per baris", () => {
    const step6 = section("panduan").items.find((i) => i.id === "langkah-6");
    assert.ok(step6);
    assert.ok(step6.answer.join(" ").includes("Belum lengkap : 2 field belum terisi"));
  });

  it("tanya jawab menjelaskan blokir Opini ADK dan konfigurasi Kontra Garansi", () => {
    const qa = section("pertanyaan").items;
    const block = qa.find((i) => i.id === "mismatch-blokir");
    assert.ok(block);
    const text = block.answer.join(" ");
    assert.ok(text.includes("Opini ADK"));
    assert.ok(text.includes("Underlying Document, Memorandum Analisa Bank Garansi, dan Putusan Bank Garansi"));
    assert.ok(text.includes("kembali ke step sebelumnya, termasuk Step 1"));
    const kontra = qa.find((i) => i.id === "kontra-garansi");
    assert.ok(kontra);
    const kontraText = [...kontra.answer, ...(kontra.points ?? [])].join(" ");
    for (const phrase of ["Terapkan Detail Kontra Garansi", "Ubah Pilihan", "Terapkan Perubahan", "Ya, Terapkan Perubahan", "Asuransi (SP3)", "Nomor SHM", "Nomor BPKB", "Jenis Cash Coll", "Nomor SP3"]) {
      assert.ok(kontraText.includes(phrase), `memuat ${phrase}`);
    }
  });

  it("Document Verification menjelaskan accordion, pilihan Ada/Tidak Ada, dan tombol + (tanpa baris langsung poin 1-3)", () => {
    const step = section("panduan").items.find((i) => i.id === "langkah-4");
    assert.ok(step);
    const text = step.answer.join(" ");
    assert.ok(text.includes("kategori utama"));
    assert.ok(text.includes("accordion"));
    assert.ok(!text.includes("Tiga poin pertama"), "baris langsung poin 1-3 sudah dihapus");
    assert.ok(!text.includes("Poin 4"), "penomoran poin lama sudah tidak dipakai");
    assert.ok(text.includes("hanya salah satu"));
    assert.ok(text.includes('"+"'));
  });

  it("langkah pertama menyebut Home sebagai halaman awal; Critical Field Validation menjelaskan Biaya dinamis, info PKS, dan Underlying", () => {
    const first = section("panduan").items.find((i) => i.id === "langkah-1");
    assert.ok(first?.answer.join(" ").includes("Home adalah halaman pertama"));
    const cfv = section("panduan").items.find((i) => i.id === "langkah-5");
    assert.ok(cfv);
    const text = cfv.answer.join(" ");
    assert.ok(!text.includes("2×2"), "susunan 2×2 lama sudah diganti daftar dinamis");
    assert.ok(text.includes("Provisi dan Administrasi"));
    assert.ok(text.includes("serentak pada ketiga sumber"));
    assert.ok(text.includes("PKS ada dengan Nomor"));
    assert.ok(text.includes("Informasi PKS"));
    assert.ok(text.includes("PKS Tidak Ada. Silakan merujuk pada SE yang berlaku."));
    assert.ok(text.includes("Tambah Field"));
    assert.ok(text.includes("Tekan Enter untuk baris baru"));
    assert.ok(!/Notaris, Administrasi, dan Lainnya/.test(text));
  });

  it("Document Verification menjelaskan kategori baru, aturan Nomor PKS, dan label baru", () => {
    const dv = section("panduan").items.find((i) => i.id === "langkah-4");
    assert.ok(dv);
    const text = dv.answer.join(" ");
    for (const expected of [
      "Surat Permohonan Bank Garansi dari Beneficiary",
      "Underlying Transaction",
      "Identitas Beneficiary",
      "Isi Nomor PKS (Jika Ada)",
      "wajib berisi Nomor PKS",
    ]) {
      assert.ok(text.includes(expected), expected);
    }
  });

  it("glosarium memuat seluruh istilah yang diwajibkan", () => {
    const terms = section("glosarium").items.map((i) => i.question);
    for (const term of REQUIRED_GLOSSARY_TERMS) {
      assert.ok(terms.includes(term), `glosarium memuat ${term}`);
    }
    assert.ok(section("glosarium").items.every((i) => i.answer.join(" ").length > 20));
  });

  it("id unik di setiap bagian", () => {
    for (const s of FAQ_SECTIONS) {
      assert.equal(new Set(s.items.map((i) => i.id)).size, s.items.length, s.id);
    }
  });
});
