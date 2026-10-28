/**
 * Teks contoh SINTETIS (nama, nomor, dan nominal fiktif) yang meniru susunan MABG dan PTBG.
 * Hanya dipakai pengujian; bukan data nasabah.
 */

export const SAMPLE_STRUKTUR = `
Struktur, Tipe dan Syarat Bank Garansi sebagai berikut :
    1.   Nama Peminjam           : PT. Contoh Abadi Sentosa Yang diwakili oleh :
                                   Pihak yang berwenang berdasarkan Akta Pendirian
    2.   Jenis Bank Garansi      : Jaminan Pelaksanaan
    3.   Nama Pengguna Jasa      : Dinas Pekerjaan Umum Kabupaten Contoh,
                                   Bidang Bina Marga
    4.   Nama Pekerjaan          : Pembangunan Jalan Lingkar Contoh
    5.   Nomor & Tgl SPPBJ       : 123/SPPBJ/2026 Tanggal : 18
                                   Februari 2026
    6.   Plafond BG              : Rp. 1.500.000.000 (satu milyar lima ratus juta rupiah)
    7.   Jangka Waktu BG        : 19 Februari 2026 sampai dengan 8 April 2027 (414 hari)
    6.   Provisi kredit          : 1% x Rp. 1.500.000.000 = Rp. 15.000.000
    8.   Administrasi            : Rp. 2.000.000,-
    9.   Agunan/Kontra           : PT. Penjamin Contoh SP2K No. 111/SP2K/2026
         Garansi                   dan SP3 BRI No. 0001230220261234 tanggal 23/02/2026
   10.   Pembuatan SPMK          : Di bawah tangan

A. Syarat - Syarat Lain :
   1. Terhadap pemberian fasilitas Bank Garansi dibuatkan perjanjian.
   2. Plafond BG juga disebut Rp. 9.999 pada syarat ini dan tidak boleh dipakai.
`;

const MAK_HEAD = `
            PT. BANK RAKYAT INDONESIA (PERSERO)
            KANTOR CABANG CONTOH

            MEMORANDUM ANALISA BANK GARANSI
I. IDENTIFIKASI NASABAH DAN USAHANYA.
1. Nama Peminjam          : PT. Contoh Abadi Sentosa
7. Permohonan : mengajukan Bank Garansi untuk Jaminan Pelaksanaan sebesar Rp. 1.500.000.000
IV. REKOMENDASI PEJABAT PEMRAKARSA/ PENGANALISA
Dengan memperhatikan hal - hal tersebut di atas, kami mengusulkan : Pemberian Bank Garansi
`;

const PTK_HEAD = `
BANK RAKYAT INDONESIA                                                                 Putusan B.G    1/3
KANTOR CABANG CONTOH

                                      PUTUSAN BANK GARANSI
                       Nomor : B.         -III/KC/ADK/02/2026
8.Total risiko yang akan diputus
BANK RAKYAT INDONESIA                                                   Putusan B.G    2/3
KANTOR CABANG CONTOH
9. PUTUSAN BANK GARANSI
`;

/** Dokumen contoh dengan isi bagian "Struktur, Tipe dan Syarat" yang dapat diganti (untuk variasi pengujian). */
export function sampleDoc(type: "mak" | "ptk", struktur: string = SAMPLE_STRUKTUR): string {
  return `${type === "mak" ? MAK_HEAD : PTK_HEAD}${struktur}\n${type === "mak" ? "MABG BG an. PT. Contoh Abadi Sentosa\n3" : ""}\n`;
}

export const SAMPLE_MAK = sampleDoc("mak");
export const SAMPLE_PTK = sampleDoc("ptk");
