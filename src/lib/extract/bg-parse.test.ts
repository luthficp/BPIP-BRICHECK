import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanLines, detectDocType, mapJenisBg, parseBgDocument } from "./bg-parse";
import { SAMPLE_MAK, SAMPLE_PTK, SAMPLE_STRUKTUR, sampleDoc } from "./fixtures";

/** Dokumen dengan bagian struktur diganti; judul/header tetap dari fixture. */
const mak = (struktur: string) => parseBgDocument(sampleDoc("mak", struktur));
const ptk = (struktur: string) => parseBgDocument(sampleDoc("ptk", struktur));
const SECTION = "Struktur, Tipe dan Syarat Bank Garansi sebagai berikut :";

describe("detectDocType", () => {
  it("mengenali Memorandum dan Putusan dari judul", () => {
    assert.equal(detectDocType(SAMPLE_MAK), "mak");
    assert.equal(detectDocType(SAMPLE_PTK), "ptk");
  });
  it("judul tidak dikenali -> null", () => {
    assert.equal(detectDocType("Surat biasa tanpa judul yang dikenal"), null);
  });
  it("kata 'putusan bank garansi' di tengah memorandum tidak mengubah jenis", () => {
    const text = `MEMORANDUM ANALISA BANK GARANSI\n${" x".repeat(900)}\nberdasarkan putusan Bank Garansi`;
    assert.equal(detectDocType(text), "mak");
  });
});

describe("mapJenisBg (Tujuan Bank Garansi -> Jenis Bank Garansi)", () => {
  it("memetakan keenam tujuan pada spesifikasi", () => {
    assert.equal(mapJenisBg("Jaminan Pelaksanaan"), "Performance Bond");
    assert.equal(mapJenisBg("Jaminan Uang Muka"), "Advance Payment Bond");
    assert.equal(mapJenisBg("Jaminan Pembayaran"), "Payment Bond");
    assert.equal(mapJenisBg("Jaminan Perbaikan"), "Maintenance Bond");
    assert.equal(mapJenisBg("Jaminan Tender"), "Tender Bond");
    assert.equal(mapJenisBg("Jaminan Bea"), "Customs Bond");
  });
  it("padanan istilah lain dan nama jenis berbahasa Inggris tetap dikenali", () => {
    assert.equal(mapJenisBg("Jaminan Pemeliharaan"), "Maintenance Bond");
    assert.equal(mapJenisBg("Jaminan Penawaran"), "Tender Bond");
    assert.equal(mapJenisBg("Jaminan Bea Cukai"), "Customs Bond");
    assert.equal(mapJenisBg("Performance Bond"), "Performance Bond");
    assert.equal(mapJenisBg("Advance Payment Bond"), "Advance Payment Bond");
    assert.equal(mapJenisBg("Payment Bond"), "Payment Bond");
  });
  it("mengabaikan huruf besar/kecil, spasi, dan tanda baca", () => {
    assert.equal(mapJenisBg("  JAMINAN   pelaksanaan. "), "Performance Bond");
    assert.equal(mapJenisBg("Jaminan-Uang   Muka,"), "Advance Payment Bond");
  });
  it("tidak cocok atau ambigu -> null (tidak menebak)", () => {
    assert.equal(mapJenisBg("Jaminan Lain-lain"), null);
    assert.equal(mapJenisBg("Pembangunan Jalan"), null);
    assert.equal(mapJenisBg("Jaminan Pelaksanaan dan Uang Muka"), null);
    assert.equal(mapJenisBg(""), null);
  });
});

describe("cleanLines", () => {
  it("membuang baris kosong, header/footer halaman, dan merapikan spasi", () => {
    const lines = cleanLines("BANK RAKYAT INDONESIA     Putusan B.G   2/3\nKANTOR CABANG X\n\n  Isi   penting  \n3\n");
    assert.deepEqual(lines, ["Isi penting"]);
  });
});

describe("parseBgDocument: dokumen contoh (susunan seperti MABG dan PTBG)", () => {
  for (const [name, text, type] of [
    ["Memorandum", SAMPLE_MAK, "mak"],
    ["Putusan", SAMPLE_PTK, "ptk"],
  ] as const) {
    it(`${name}: membaca ketujuh field`, () => {
      const p = parseBgDocument(text);
      assert.equal(p.detectedType, type);
      assert.equal(p.tujuanBg?.value, "Jaminan Pelaksanaan");
      assert.equal(p.jenisBg?.value, "Performance Bond");
      assert.equal(p.jenisBg?.raw, "Jaminan Pelaksanaan");
      assert.equal(p.beneficiary?.value, "Dinas Pekerjaan Umum Kabupaten Contoh, Bidang Bina Marga");
      assert.deepEqual(p.nilaiBg?.value, { currency: "IDR", amount: "1500000000" });
      assert.deepEqual(p.jangkaWaktu?.value, { start: "2026-02-19", end: "2027-04-08" });
      assert.equal(p.provisi?.value, "15,000,000");
      assert.equal(p.administrasi?.value, "2,000,000");
      assert.deepEqual(p.unresolved, {});
      assert.deepEqual(p.notes, {});
      assert.deepEqual(p.warnings, []);
      // Semua dibaca dari butir berlabel pada bagian struktur dan konsisten: tidak ada alasan konfirmasi.
      for (const field of [p.jenisBg, p.tujuanBg, p.beneficiary, p.nilaiBg, p.jangkaWaktu, p.provisi, p.administrasi]) {
        assert.equal(field?.reasons, undefined);
      }
    });
  }

  it("Plafond pada Syarat Lain tidak ikut terbaca; hanya bagian struktur", () => {
    assert.equal(parseBgDocument(SAMPLE_PTK).nilaiBg?.value.amount, "1500000000");
  });

  it("selisih durasi di dokumen (414 hari) dan hitungan aplikasi (413) menjadi catatan netral, bukan alasan konfirmasi", () => {
    const p = parseBgDocument(SAMPLE_PTK);
    assert.match(p.infos.jangkaWaktu ?? "", /414.*413/);
    assert.equal(p.jangkaWaktu?.reasons, undefined);
    assert.deepEqual(p.warnings, []);
  });

  it("Kontra Garansi tidak dibaca sama sekali (tetap manual)", () => {
    const p = parseBgDocument(SAMPLE_PTK) as unknown as Record<string, unknown>;
    assert.equal("kontra" in p, false);
    assert.equal(JSON.stringify(p).includes("0001230220261234"), false);
  });
});

describe("parseBgDocument: susunan poin berbeda (skenario 5)", () => {
  const withoutNumbers = `
${SECTION}
   Jenis Bank Garansi      : Jaminan Uang Muka
   Nama Pengguna Jasa      : Dinas Contoh Provinsi
   Jangka Waktu BG         : 1 Maret 2026 sampai dengan 28 Februari 2027
   Plafond BG              : Rp. 500.000.000
   Administrasi            : Rp. 1.000.000,-
   Provisi                 : Rp. 5.000.000
A. Syarat - Syarat Lain :
`;
  it("tanpa nomor butir dan dengan urutan berbeda", () => {
    const p = ptk(withoutNumbers);
    assert.equal(p.jenisBg?.value, "Advance Payment Bond");
    assert.equal(p.beneficiary?.value, "Dinas Contoh Provinsi");
    assert.deepEqual(p.jangkaWaktu?.value, { start: "2026-03-01", end: "2027-02-28" });
    assert.deepEqual(p.nilaiBg?.value, { currency: "IDR", amount: "500000000" });
    assert.equal(p.administrasi?.value, "1,000,000");
    assert.equal(p.provisi?.value, "5,000,000");
  });

  it("nomor butir bergeser dan berulang, label tetap dikenali", () => {
    const p = mak(`
${SECTION}
  14. Jangka Waktu BG   : 5 Mei 2026 sampai dengan 4 Mei 2027
  14. Nama Pengguna Jasa : PT. Penerima Contoh
   2) Provisi kredit   : 2% x Rp. 100.000.000 = Rp. 2.000.000
   b. Plafond Bank Garansi : Rp. 100.000.000
   99. Administrasi : Rp. 250.000
   1. Jenis Bank Garansi : Jaminan Tender
A. Syarat - Syarat Lain :
`);
    assert.equal(p.jenisBg?.value, "Tender Bond");
    assert.equal(p.beneficiary?.value, "PT. Penerima Contoh");
    assert.equal(p.provisi?.value, "2,000,000");
    assert.equal(p.administrasi?.value, "250,000");
    assert.deepEqual(p.nilaiBg?.value, { currency: "IDR", amount: "100000000" });
    assert.deepEqual(p.jangkaWaktu?.value, { start: "2026-05-05", end: "2027-05-04" });
  });

  it("nilai yang dipenggal ke beberapa baris tetap terbaca utuh", () => {
    const p = ptk(`
${SECTION}
 3. Nama Pengguna Jasa : Balai Besar Pelaksanaan
                         Jalan Nasional Wilayah
                         Sumatera Barat
 6. Plafond BG : Rp.
                 750.000.000
A. Syarat - Syarat Lain :
`);
    assert.equal(p.beneficiary?.value, "Balai Besar Pelaksanaan Jalan Nasional Wilayah Sumatera Barat");
    assert.deepEqual(p.nilaiBg?.value, { currency: "IDR", amount: "750000000" });
  });

  it("butir bernomor tanpa titik dua: nilai ada di baris yang sama", () => {
    const p = ptk(`
${SECTION}
 2. Jenis Bank Garansi Jaminan Pembayaran
 3. Nama Pengguna Jasa PT. Tanpa Titik Dua
 6. Plafond BG Rp. 20.000.000
A. Syarat - Syarat Lain :
`);
    assert.equal(p.tujuanBg?.value, "Jaminan Pembayaran");
    assert.equal(p.jenisBg?.value, "Payment Bond");
    assert.equal(p.beneficiary?.value, "PT. Tanpa Titik Dua");
    assert.equal(p.nilaiBg?.value.amount, "20000000");
  });

  it("kata kunci sepadan: Jumlah BG dan Biaya Provisi / Biaya Administrasi", () => {
    const p = mak(`
${SECTION}
 1. Jenis Bank Garansi : Jaminan Pelaksanaan
 2. Jumlah BG : Rp. 90.000.000
 3. Biaya Provisi : Rp. 900.000
 4. Biaya Administrasi : Rp. 100.000
A. Syarat - Syarat Lain :
`);
    assert.equal(p.nilaiBg?.value.amount, "90000000");
    assert.equal(p.provisi?.value, "900,000");
    assert.equal(p.administrasi?.value, "100,000");
  });

  it("bagian 'Struktur, Tipe dan Syarat' tidak ada: mencari seluruh dokumen dan memberi catatan", () => {
    const p = parseBgDocument(`MEMORANDUM ANALISA BANK GARANSI
Rekomendasi:
 2. Jenis Bank Garansi : Jaminan Perbaikan
 3. Nama Pengguna Jasa : PT. Tanpa Bagian
 6. Plafond BG : Rp. 10.000.000
 7. Jangka Waktu BG : 1 Januari 2026 sampai dengan 31 Desember 2026
 8. Provisi : Rp. 100.000
 9. Administrasi : Rp. 50.000
${"x ".repeat(200)}`);
    assert.equal(p.jenisBg?.value, "Maintenance Bond");
    assert.equal(p.beneficiary?.value, "PT. Tanpa Bagian");
    assert.ok(p.warnings.some((w) => w.includes("tidak ditemukan")));
    // Tanpa bagian struktur, hubungan label-nilai tidak berjangkar: setiap nilai diberi alasan yang jelas.
    for (const field of [p.jenisBg, p.beneficiary, p.nilaiBg, p.jangkaWaktu, p.provisi, p.administrasi]) {
      assert.match(field?.reasons?.join(" ") ?? "", /tidak ditemukan, sehingga butir dicari dari seluruh dokumen/);
    }
  });

  it("isian yang tidak ada di bagian struktur dicari di seluruh dokumen dan diberi catatan", () => {
    const p = mak(`
${SECTION}
 2. Jenis Bank Garansi : Jaminan Pelaksanaan
A. Syarat - Syarat Lain :
 Administrasi : Rp. 75.000
`);
    // Syarat lain berada setelah bagian struktur -> hanya ditemukan lewat pencarian seluruh dokumen.
    assert.equal(p.administrasi?.value, "75,000");
    assert.match(p.administrasi?.reasons?.join(" ") ?? "", /luar bagian/);
  });
});

describe("parseBgDocument: Provisi dan Administrasi pada format berbeda (skenario 6)", () => {
  const fee = (line: string, key: "provisi" | "administrasi" = "provisi") =>
    ptk(`\n${SECTION}\n 1. ${line}\nA. Syarat - Syarat Lain :\n`)[key];

  it("nominal setelah tanda sama dengan; persen dan rumus diabaikan", () => {
    assert.equal(fee("Provisi kredit : 1% x Rp. 2.355.795.900 = Rp. 23.557.959")?.value, "23,557,959");
  });
  it("tanpa kata 'Kredit'", () => {
    assert.equal(fee("Provisi : Rp. 12.000.000,-")?.value, "12,000,000");
    assert.equal(fee("Biaya Provisi : Rp 12.000.000")?.value, "12,000,000");
  });
  it("hanya persentase: terbaca sebagai persen dengan catatan", () => {
    const f = fee("Provisi : 1,5% p.a.");
    assert.equal(f?.value, "1.5%");
    assert.match(f?.reasons?.join(" ") ?? "", /persentase/);
    assert.equal(f?.raw, "1,5% p.a.");
  });
  it("nominal dengan kode mata uang", () => {
    assert.equal(fee("Administrasi : USD 1,500.25", "administrasi")?.value, "USD 1,500.25");
  });
  it("angka murni tanpa simbol mata uang", () => {
    assert.equal(fee("Administrasi : 2.000.000,-", "administrasi")?.value, "2,000,000");
  });
  it("kalimat: 'Provisi sebesar Rp ...' tanpa butir berlabel", () => {
    const p = mak(`
${SECTION}
 2. Jenis Bank Garansi : Jaminan Pelaksanaan
Biaya provisi sebesar Rp. 4.000.000 dan administrasi Rp. 500.000 dibayar di muka.
A. Syarat - Syarat Lain :
`);
    assert.equal(p.provisi?.value, "4,000,000");
    assert.match(p.provisi?.reasons?.join(" ") ?? "", /kalimat|luar bagian/);
    assert.equal(p.administrasi?.value, "500,000");
  });
  it("Provisi dan Administrasi tidak tertukar atau digabung", () => {
    const p = ptk(`
${SECTION}
 8. Provisi kredit : 1% x Rp. 100.000.000 = Rp. 1.000.000
 9. Administrasi : Rp. 300.000
A. Syarat - Syarat Lain :
`);
    assert.equal(p.provisi?.value, "1,000,000");
    assert.equal(p.administrasi?.value, "300,000");
  });
  it("butir gabungan 'Provisi dan Administrasi' tidak dianggap Provisi maupun Administrasi", () => {
    const p = ptk(`
${SECTION}
 8. Provisi dan Administrasi : Rp. 1.300.000
A. Syarat - Syarat Lain :
`);
    assert.equal(p.provisi, null);
    assert.equal(p.administrasi, null);
  });
  it("kalimat syarat 'melunasi biaya provisi dan administrasi' tidak menghasilkan nilai", () => {
    const p = ptk(`
${SECTION}
 2. Jenis Bank Garansi : Jaminan Pelaksanaan
A. Syarat - Syarat Lain :
 4.3. Telah melunasi biaya provisi dan administrasi untuk setiap penerbitan surat Bank Garansi.
`);
    assert.equal(p.provisi, null);
    assert.equal(p.administrasi, null);
  });
});

describe("parseBgDocument: Tujuan -> Jenis Bank Garansi (skenario 7)", () => {
  const cases: [string, string][] = [
    ["Jaminan Pelaksanaan", "Performance Bond"],
    ["Jaminan Uang Muka", "Advance Payment Bond"],
    ["Jaminan Pembayaran", "Payment Bond"],
    ["Jaminan Perbaikan", "Maintenance Bond"],
    ["Jaminan Tender", "Tender Bond"],
    ["Jaminan Bea", "Customs Bond"],
  ];
  for (const [tujuan, jenis] of cases) {
    it(`${tujuan} -> ${jenis}, dipetakan terpisah pada Memorandum dan Putusan`, () => {
      for (const parse of [mak, ptk]) {
        const p = parse(`\n${SECTION}\n 2. Jenis Bank Garansi : ${tujuan}\nA. Syarat - Syarat Lain :\n`);
        assert.equal(p.tujuanBg?.value, tujuan);
        assert.equal(p.jenisBg?.value, jenis);
      }
    });
  }

  it("label 'Tujuan Bank Garansi' diprioritaskan atas 'Jenis Bank Garansi'", () => {
    const p = ptk(`
${SECTION}
 2. Jenis Bank Garansi : Bank Garansi Rupiah
 3. Tujuan Bank Garansi : Jaminan Uang Muka
A. Syarat - Syarat Lain :
`);
    assert.equal(p.tujuanBg?.value, "Jaminan Uang Muka");
    assert.equal(p.jenisBg?.value, "Advance Payment Bond");
  });

  it("tanpa butir berlabel: frasa tujuan dibaca dari kalimat rekomendasi", () => {
    const p = mak(`\nPemberian Bank Garansi jaminan  pelaksanaan dengan total Rp. 1.\n${SECTION}\n 4. Nama Pekerjaan : Jalan\nA. Syarat - Syarat Lain :\n`);
    assert.equal(p.tujuanBg?.value, "Jaminan Pelaksanaan");
    assert.equal(p.jenisBg?.value, "Performance Bond");
    assert.match(p.tujuanBg?.reasons?.join(" ") ?? "", /kalimat|luar bagian/);
    // Jenis diturunkan dari Tujuan dan mewarisi alasan yang sama.
    assert.deepEqual(p.jenisBg?.reasons, p.tujuanBg?.reasons);
  });

  it("tujuan tidak cocok mapping: Tujuan terisi, Jenis tidak ditebak", () => {
    const p = ptk(`\n${SECTION}\n 2. Jenis Bank Garansi : Jaminan Khusus\nA. Syarat - Syarat Lain :\n`);
    assert.equal(p.tujuanBg?.value, "Jaminan Khusus");
    assert.equal(p.jenisBg, null);
    assert.deepEqual(p.unresolved.jenisBg?.found, ["Jaminan Khusus"]);
    assert.match(p.unresolved.jenisBg?.reason ?? "", /mapping/);
  });

  it("Nama Pekerjaan tidak lagi dipakai sebagai Tujuan Bank Garansi", () => {
    const p = ptk(`\n${SECTION}\n 4. Nama Pekerjaan : Paket Preservasi Jalan\nA. Syarat - Syarat Lain :\n`);
    assert.equal(p.tujuanBg, null);
  });
});

describe("parseBgDocument: tidak ditemukan atau ambigu (skenario 8)", () => {
  it("field yang tidak ada dibiarkan null tanpa nilai default", () => {
    const p = ptk(`\n${SECTION}\n 2. Jenis Bank Garansi : Jaminan Pelaksanaan\nA. Syarat - Syarat Lain :\n`);
    assert.equal(p.beneficiary, null);
    assert.equal(p.nilaiBg, null);
    assert.equal(p.jangkaWaktu, null);
    assert.equal(p.provisi, null);
    assert.equal(p.administrasi, null);
    assert.deepEqual(p.unresolved, {});
    // Tidak ada butir sama sekali -> tidak ada kandidat dan tidak ada alasan yang dikarang.
    assert.equal(p.unresolved.nilaiBg, undefined);
    assert.equal(p.notes.nilaiBg, undefined);
  });

  it("dua nilai berbeda untuk satu field: tidak diisi, kandidat dikembalikan", () => {
    const p = ptk(`
${SECTION}
 2. Jenis Bank Garansi : Jaminan Pelaksanaan
 6. Plafond BG : Rp. 100.000.000
 6. Plafond BG : Rp. 200.000.000
A. Syarat - Syarat Lain :
`);
    assert.equal(p.nilaiBg, null);
    assert.equal(p.unresolved.nilaiBg?.found.length, 2);
    assert.deepEqual(p.unresolved.nilaiBg?.found, ["Rp. 100.000.000", "Rp. 200.000.000"]);
    assert.match(p.unresolved.nilaiBg?.reason ?? "", /2 nilai berbeda/);
  });

  it("nilai yang sama disebut dua kali bukan ambigu", () => {
    const p = ptk(`
${SECTION}
 6. Plafond BG : Rp. 100.000.000
 7. Jumlah BG : Rp 100.000.000,-
A. Syarat - Syarat Lain :
`);
    assert.equal(p.nilaiBg?.value.amount, "100000000");
    assert.deepEqual(p.unresolved, {});
  });

  it("dua tujuan berbeda: Tujuan dan Jenis keduanya tidak diisi", () => {
    const p = ptk(`
${SECTION}
 2. Jenis Bank Garansi : Jaminan Pelaksanaan
 3. Jenis Bank Garansi : Jaminan Uang Muka
A. Syarat - Syarat Lain :
`);
    assert.equal(p.tujuanBg, null);
    assert.equal(p.jenisBg, null);
    assert.equal(p.unresolved.tujuanBg?.found.length, 2);
    assert.deepEqual(p.unresolved.jenisBg?.found, p.unresolved.tujuanBg?.found);
    assert.match(p.unresolved.jenisBg?.reason ?? "", /Jenis Bank Garansi belum dapat ditentukan/);
  });

  it("tiga tanggal atau lebih pada Jangka Waktu: ambigu, tidak diisi", () => {
    const p = ptk(`
${SECTION}
 7. Jangka Waktu BG : 1 Januari 2026 sampai dengan 31 Desember 2026 atau 1 Februari 2027
A. Syarat - Syarat Lain :
`);
    assert.equal(p.jangkaWaktu, null);
    assert.equal(p.unresolved.jangkaWaktu?.found.length, 1);
    assert.match(p.unresolved.jangkaWaktu?.found[0] ?? "", /1 Februari 2027/);
    assert.match(p.unresolved.jangkaWaktu?.reason ?? "", /lebih dari dua tanggal/);
  });

  it("label ada tetapi nilai tidak terbaca: tidak diisi, teks yang terbaca dan alasannya dikembalikan", () => {
    const p = ptk(`
${SECTION}
 6. Plafond BG : menyesuaikan kebutuhan
 7. Jangka Waktu BG : 12 bulan
A. Syarat - Syarat Lain :
`);
    assert.equal(p.nilaiBg, null);
    assert.deepEqual(p.unresolved.nilaiBg?.found, ["menyesuaikan kebutuhan"]);
    assert.match(p.unresolved.nilaiBg?.reason ?? "", /tidak dapat dibaca sebagai nominal/);
    assert.equal(p.jangkaWaktu, null);
    assert.deepEqual(p.unresolved.jangkaWaktu?.found, ["12 bulan"]);
    assert.match(p.unresolved.jangkaWaktu?.reason ?? "", /tidak dapat dibaca sebagai periode/);
  });

  it("teks kosong atau tanpa kata kunci: semuanya null dan tidak error", () => {
    for (const text of ["", "Dokumen lain\nTanpa kata kunci apa pun"]) {
      const p = parseBgDocument(text);
      assert.equal(p.jenisBg, null);
      assert.equal(p.nilaiBg, null);
      assert.equal(p.provisi, null);
    }
  });
});

describe("SAMPLE_STRUKTUR", () => {
  it("masih memuat butir Kontra Garansi yang sengaja tidak dibaca", () => {
    assert.match(SAMPLE_STRUKTUR, /Agunan\/Kontra/);
  });
});

describe("parseBgDocument: alasan konfirmasi berbasis bukti (revisi 3)", () => {
  const nilai = (line: string) => ptk(`\n${SECTION}\n 6. ${line}\nA. Syarat - Syarat Lain :\n`).nilaiBg;

  it("nominal angka dan terbilang konsisten: tidak ada alasan (Terisi)", () => {
    const f = nilai("Plafond BG : Rp. 500.000.000,- (Lima Ratus Juta Rupiah)");
    assert.equal(f?.value.amount, "500000000");
    assert.equal(f?.reasons, undefined);
    // Contoh dokumen: 'satu milyar lima ratus juta rupiah' = Rp. 1.500.000.000
    assert.equal(parseBgDocument(SAMPLE_PTK).nilaiBg?.reasons, undefined);
  });

  it("nominal angka dan terbilang berbeda: nilai angka diisi, alasan menyebut keduanya", () => {
    const f = nilai("Plafond BG : Rp. 550.000.000,- (Lima Ratus Juta Rupiah)");
    assert.equal(f?.value.amount, "550000000");
    assert.equal(f?.reasons?.length, 1);
    assert.match(f?.reasons?.[0] ?? "", /550,000,000/);
    assert.match(f?.reasons?.[0] ?? "", /Lima Ratus Juta Rupiah/);
    assert.match(f?.reasons?.[0] ?? "", /500,000,000/);
    // Teks sumber yang ditampilkan ke ADK memuat angka dan terbilang apa adanya.
    assert.match(f?.raw ?? "", /Rp\. 550\.000\.000,-.*Lima Ratus Juta Rupiah/);
  });

  it("terbilang yang tidak dapat dibaca tidak pernah ditandai berbeda", () => {
    assert.equal(nilai("Plafond BG : Rp. 500.000.000,- (lima ratus juta rupiah lebih)")?.reasons, undefined);
    assert.equal(nilai("Plafond BG : USD 1,000,000 (One Million US Dollars)")?.reasons, undefined);
    assert.equal(nilai("Plafond BG : Rp. 500.000.000,- (sesuai surat permohonan)")?.reasons, undefined);
  });

  it("biaya: terbilang berbeda ditandai, konsisten tidak", () => {
    const fee = (line: string) => ptk(`\n${SECTION}\n 8. ${line}\nA. Syarat - Syarat Lain :\n`).provisi;
    const bad = fee("Provisi : Rp. 1.000.000 (dua juta rupiah)");
    assert.equal(bad?.value, "1,000,000");
    assert.match(bad?.reasons?.join(" ") ?? "", /berbeda dengan terbilang/);
    assert.equal(fee("Provisi : Rp. 2.000.000,- (dua juta rupiah)")?.reasons, undefined);
  });

  it("tanggal numerik yang bisa dibaca dua cara ditandai; tanggal yang jelas tidak", () => {
    const period = (line: string) => ptk(`\n${SECTION}\n 7. ${line}\nA. Syarat - Syarat Lain :\n`).jangkaWaktu;
    const ambiguous = period("Jangka Waktu BG : 03/04/2026 s/d 02/05/2027");
    assert.deepEqual(ambiguous?.value, { start: "2026-04-03", end: "2027-05-02" });
    assert.match(ambiguous?.reasons?.join(" ") ?? "", /03\/04\/2026.*hari\/bulan\/tahun/);
    assert.equal(period("Jangka Waktu BG : 19/02/2026 s/d 28/04/2027")?.reasons, undefined);
    assert.equal(period("Jangka Waktu BG : 3 April 2026 sampai dengan 2 Mei 2027")?.reasons, undefined);
  });

  it("hanya persentase: alasan jelas dan teks sumber apa adanya", () => {
    const p = ptk(`\n${SECTION}\n 8. Administrasi : 0,5% flat\nA. Syarat - Syarat Lain :\n`);
    assert.equal(p.administrasi?.value, "0.5%");
    assert.equal(p.administrasi?.raw, "0,5% flat");
    assert.match(p.administrasi?.reasons?.join(" ") ?? "", /Hanya persentase/);
  });

  it("Tujuan tidak ditemukan sama sekali: Jenis diberi penyebab pasti, bukan kandidat", () => {
    const p = ptk(`\n${SECTION}\n 4. Nama Pekerjaan : Jalan\nA. Syarat - Syarat Lain :\n`);
    assert.equal(p.unresolved.jenisBg, undefined);
    assert.match(p.notes.jenisBg ?? "", /Tujuan Bank Garansi tidak ditemukan/);
  });

  it("alasan tidak pernah kosong atau generik: setiap alasan menyebut apa yang diperiksa", () => {
    const p = parseBgDocument(SAMPLE_PTK);
    assert.equal(Object.keys(p.unresolved).length, 0);
    const bad = ptk(`
${SECTION}
 6. Plafond BG : Rp. 100.000.000
 6. Plafond BG : Rp. 200.000.000
 7. Jangka Waktu BG : sampai selesai
A. Syarat - Syarat Lain :
`);
    for (const item of Object.values(bad.unresolved)) {
      assert.ok(item.found.length > 0 && item.found.every((t) => t.trim() !== ""));
      assert.ok(item.reason.length > 20);
    }
  });
});
