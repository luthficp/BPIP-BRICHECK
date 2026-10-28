import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptyChecklist } from "@/lib/checklist/factory";

import { applyExtraction } from "./apply";
import { parseBgDocument } from "./bg-parse";
import { SAMPLE_PTK, SAMPLE_STRUKTUR, sampleDoc } from "./fixtures";
import { describeCounts, STATUS_LABEL, STATUS_TONE, summarizeExtraction } from "./summary";

const summarize = (text: string, source: "mak" | "ptk" = "ptk") =>
  summarizeExtraction(applyExtraction(createEmptyChecklist("ADK Uji"), source, parseBgDocument(text)).changes);
const rowOf = (s: ReturnType<typeof summarize>, key: string) => s.rows.find((r) => r.key === key);

describe("summarizeExtraction: empat status", () => {
  it("teks dan warna status konsisten", () => {
    assert.deepEqual(STATUS_LABEL, {
      filled: "Terisi",
      confirm: "Ditemukan, Perlu Konfirmasi",
      missing: "Tidak Ditemukan",
      manual: "Selalu Manual",
    });
    assert.deepEqual(STATUS_TONE, { filled: "success", confirm: "warning", missing: "danger", manual: "muted" });
  });

  it("dokumen lengkap: tujuh field Terisi, Kontra Garansi Selalu Manual, tidak ada yang perlu perhatian", () => {
    const s = summarize(SAMPLE_PTK);
    assert.deepEqual(
      s.rows.map((r) => r.label),
      [
        "Jenis Bank Garansi",
        "Tujuan Bank Garansi",
        "Beneficiary",
        "Nilai Bank Garansi",
        "Jangka Waktu",
        "Biaya: Provisi",
        "Biaya: Administrasi",
        "Kontra Garansi",
      ],
    );
    assert.deepEqual(s.counts, { filled: 7, confirm: 0, missing: 0 });
    assert.equal(s.attention, 0);
    assert.equal(s.read, 7);
    for (const row of s.rows.slice(0, 7)) {
      assert.equal(row.status, "filled");
      assert.equal(row.statusLabel, "Terisi");
      assert.notEqual(row.value, "");
      assert.deepEqual(row.found, []);
      assert.deepEqual(row.reasons, []);
      assert.equal(row.needsAttention, false);
    }
    assert.equal(rowOf(s, "nilaiBg")?.value, "IDR 1,500,000,000");
    assert.equal(rowOf(s, "jangkaWaktu")?.value, "19/02/2026 s.d. 08/04/2027");
  });

  it("Kontra Garansi: satu-satunya baris Selalu Manual; bukan kegagalan dan tidak dihitung", () => {
    const s = summarize("");
    const kontra = rowOf(s, "kontraGaransi");
    assert.equal(kontra?.status, "manual");
    assert.equal(kontra?.statusLabel, "Selalu Manual");
    assert.equal(kontra?.tone, "muted");
    assert.equal(kontra?.needsAttention, false);
    assert.equal(s.rows.filter((r) => r.status === "manual").length, 1);
    assert.equal(s.rows.some((r) => r.label.includes("Underlying")), false);
    // Dokumen kosong: tujuh merah, tetapi Kontra tidak menambah hitungan.
    assert.deepEqual(s.counts, { filled: 0, confirm: 0, missing: 7 });
    assert.equal(s.attention, 7);
  });

  it("kuning: teks yang ditemukan dan alasan berasal dari PDF; merah: kosong dengan keterangan", () => {
    const s = summarize(
      sampleDoc(
        "ptk",
        `
Struktur, Tipe dan Syarat Bank Garansi sebagai berikut :
 2. Jenis Bank Garansi : Jaminan Pelaksanaan
 6. Plafond BG : Rp. 100.000.000
 6. Plafond BG : Rp. 200.000.000
 7. Jangka Waktu BG : 12 bulan
A. Syarat - Syarat Lain :
`,
      ),
    );
    const nilai = rowOf(s, "nilaiBg");
    assert.equal(nilai?.status, "confirm");
    assert.equal(nilai?.statusLabel, "Ditemukan, Perlu Konfirmasi");
    assert.equal(nilai?.value, "");
    assert.deepEqual(nilai?.found, ["Rp. 100.000.000", "Rp. 200.000.000"]);
    assert.equal(nilai?.reasons.length, 1);
    assert.equal(nilai?.needsAttention, true);

    const periode = rowOf(s, "jangkaWaktu");
    assert.equal(periode?.status, "confirm");
    assert.deepEqual(periode?.found, ["12 bulan"]);

    const benef = rowOf(s, "beneficiary");
    assert.equal(benef?.status, "missing");
    assert.equal(benef?.tone, "danger");
    assert.equal(benef?.value, "");
    assert.deepEqual(benef?.found, []);
    assert.deepEqual(benef?.reasons, []);
    assert.match(benef?.note ?? "", /Tidak ditemukan/);

    assert.deepEqual(s.counts, { filled: 2, confirm: 2, missing: 3 });
    assert.equal(s.attention, 5);
    assert.equal(s.read, 4);
  });

  it("kuning dengan nilai: nilai terisi tetap ditampilkan bersama sumber dan alasan", () => {
    const s = summarize(
      sampleDoc("mak", SAMPLE_STRUKTUR.replace("(satu milyar lima ratus juta rupiah)", "(satu milyar dua ratus juta rupiah)")),
      "mak",
    );
    const nilai = rowOf(s, "nilaiBg");
    assert.equal(nilai?.status, "confirm");
    assert.equal(nilai?.value, "IDR 1,500,000,000");
    assert.match(nilai?.found[0] ?? "", /satu milyar dua ratus juta rupiah/);
    assert.match(nilai?.reasons[0] ?? "", /berbeda dengan terbilang/);
  });

  it("alasan kuning tidak pernah muncul pada baris hijau, dan catatan netral tidak menjadikannya kuning", () => {
    const s = summarize(SAMPLE_PTK);
    const periode = rowOf(s, "jangkaWaktu");
    assert.equal(periode?.status, "filled");
    assert.match(periode?.info ?? "", /414.*413/);
    assert.deepEqual(periode?.reasons, []);
  });

  it("describeCounts: bagian bernilai nol dihilangkan", () => {
    assert.equal(describeCounts({ filled: 5, confirm: 1, missing: 1 }), "5 terisi, 1 perlu konfirmasi, 1 tidak ditemukan");
    assert.equal(describeCounts({ filled: 7, confirm: 0, missing: 0 }), "7 terisi");
    assert.equal(describeCounts({ filled: 0, confirm: 2, missing: 0 }), "2 perlu konfirmasi");
  });
});
