import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LABEL_ADK_NAME,
  LABEL_TASK_MONITORING,
  PKS_NOTES_PLACEHOLDER,
  VALIDATION_NOTES,
} from "./checklist/config";

/**
 * Pemeriksaan konsistensi istilah: tidak boleh ada label lama yang tersisa pada
 * kode sumber (UI, cetak, PDF, Word, FAQ) maupun README.
 * Kunci data internal huruf kecil (`ptk`, `mak`) sengaja dipertahankan demi
 * kompatibilitas data tersimpan, sehingga pemeriksaan hanya mengenai penulisan
 * label (huruf besar / frasa tampilan).
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");
const projectRoot = join(srcRoot, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return [full];
  });
}

const sourceFiles = walk(srcRoot).filter(
  (file) => /\.(ts|tsx|css|mjs)$/.test(file) && !/\.test\.ts$/.test(file),
);
const scanned = [...sourceFiles, join(projectRoot, "README.md"), join(projectRoot, "package.json")];

function offenders(pattern: RegExp): string[] {
  return scanned.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, index) => (pattern.test(line) ? [`${relative(projectRoot, file)}:${index + 1}: ${line.trim()}`] : [])),
  );
}

describe("konsistensi istilah (tanpa label lama)", () => {
  it('tidak ada "PTK" atau "MAK" sebagai label', () => {
    assert.deepEqual(offenders(/\bPTK\b/), []);
    assert.deepEqual(offenders(/\bMAK\b/), []);
  });

  it('tidak ada "3-Way Match" / "three-way" pada teks tampilan', () => {
    assert.deepEqual(offenders(/3-?way/i), []);
  });

  it("tidak ada Export Excel, exceljs, atau pilihan Ikuti Sistem", () => {
    assert.deepEqual(offenders(/Export Excel|exceljs|Ikuti [Ss]istem/), []);
    assert.deepEqual(offenders(/\bexcel\b/i), []);
  });

  it('label "Nama ADK" diganti "Nama Lengkap ADK" (spesifikasi 14.3)', () => {
    assert.deepEqual(offenders(/\bNama ADK\b/), []);
    const dialog = readFileSync(join(srcRoot, "components/dashboard/create-checklist-dialog.tsx"), "utf8");
    assert.ok(dialog.includes("LABEL_ADK_NAME"));
    assert.equal(LABEL_ADK_NAME, "Nama Lengkap ADK");
  });

  it('menu "Dashboard" diganti "Task Monitoring" (spesifikasi 14.4)', () => {
    // Hanya teks tampilan; nama komponen/identifier (DashboardHeader dsb.) boleh tetap.
    assert.deepEqual(offenders(/>\s*Dashboard\s*</), []);
    assert.deepEqual(offenders(/["'`]\s*Dashboard\s*["'`]/), []);
    assert.deepEqual(offenders(/(?:ke|buka|Buka|di|pada) Dashboard\b/), []);
    assert.equal(LABEL_TASK_MONITORING, "Task Monitoring");
    const header = readFileSync(join(srcRoot, "components/app-header.tsx"), "utf8");
    assert.ok(header.includes("LABEL_TASK_MONITORING"));
    const heading = readFileSync(join(srcRoot, "components/dashboard/dashboard-header.tsx"), "utf8");
    assert.match(heading, /<h1[\s\S]*LABEL_TASK_MONITORING[\s\S]*<\/h1>/);
  });

  it("urutan sumber di teks tampilan: Underlying, Memorandum, lalu Putusan", () => {
    // Frasa berurutan yang menyebut Putusan sebelum Memorandum tidak boleh tersisa.
    assert.deepEqual(offenders(/Putusan Bank Garansi,? (?:dan )?Memorandum Analisa/), []);
    assert.deepEqual(offenders(/LABEL_PUTUSAN\}?,? (?:dan )?\{?LABEL_MEMORANDUM/), []);
    assert.deepEqual(offenders(/Underlying Document\)?,? (?:\(acuan\) )?Putusan/), []);
  });

  it('step 4 bernama "Summary & Output" (bukan "Output" saja)', () => {
    assert.deepEqual(offenders(/title: "Output"/), []);
    assert.deepEqual(offenders(/4\. Output\b/), []);
  });

  it("nama aplikasi lama tidak tersisa", () => {
    assert.deepEqual(offenders(/BRI Bank Guarantee Verification/), []);
  });

  it("placeholder Keterangan lama diganti dan tidak pernah disimpan sebagai nilai", () => {
    assert.deepEqual(offenders(/Mis\. 14 September 2026/), []);
    const doc = readFileSync(join(srcRoot, "components/checklist/document-verification.tsx"), "utf8");
    assert.ok(doc.includes('"Isi keterangan sesuai Jenis Dokumen"'));
    // Placeholder hanya dipakai pada atribut placeholder, bukan nilai.
    assert.match(doc, /placeholder=\{[\s\S]*KETERANGAN_PLACEHOLDER[\s\S]*\}/);
  });
});

describe("label dokumen v7 (Document Verification)", () => {
  it("label lama poin 1-2 tidak tampil di UI, output, maupun FAQ (hanya sebagai nama lama untuk migrasi)", () => {
    const userFacing = scanned.filter(
      (file) =>
        /[\\/]components[\\/]/.test(file) ||
        /[\\/]lib[\\/]export[\\/]/.test(file) ||
        /[\\/]lib[\\/]faq[\\/]/.test(file),
    );
    const hits = userFacing.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          /Permohonan Distributor|"Surat Permohonan Bank Garansi"|Surat Permohonan Bank Garansi,/.test(line)
            ? [`${relative(projectRoot, file)}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );
    assert.deepEqual(hits, []);
  });

  it("placeholder Keterangan Perjanjian Kerja Sama persis \"Isi Nomor PKS (Jika Ada)\"", () => {
    const doc = readFileSync(join(srcRoot, "components/checklist/document-verification.tsx"), "utf8");
    assert.ok(doc.includes("PKS_NOTES_PLACEHOLDER"));
    assert.equal(PKS_NOTES_PLACEHOLDER, "Isi Nomor PKS (Jika Ada)");
  });
});

describe("Critical Field Validation: catatan validasi ringkas", () => {
  it("paragraf penjelasan panjang yang lama sudah diganti", () => {
    assert.deepEqual(offenders(/Perbedaan huruf besar\/kecil, spasi berlebih/), []);
    assert.deepEqual(offenders(/NOT_LISTED_HINT/), []);
  });

  it("empat poin berlabel sesuai spesifikasi", () => {
    assert.deepEqual(
      VALIDATION_NOTES.map((n) => n.label),
      ["Kelengkapan sumber", "Perbandingan teks", "Nominal dan persentase", "Jangka waktu dan biaya"],
    );
    const by = (label: string) => VALIDATION_NOTES.find((n) => n.label === label)!.text;
    assert.equal(
      by("Kelengkapan sumber"),
      "Jika informasi tidak tercantum pada sumber, isi `Tidak tercantum`.",
    );
    assert.match(by("Perbandingan teks"), /Kapitalisasi, spasi berlebih, dan titik\/koma pada singkatan seperti `PT\.` diabaikan; perbedaan isi tetap terdeteksi\./);
    assert.match(by("Nominal dan persentase"), /Koma adalah pemisah ribuan dan titik adalah desimal \(contoh: `1\.25%`\); nominal dibandingkan sebagai angka\./);
    assert.match(by("Jangka waktu dan biaya"), /durasi = tanggal akhir . tanggal mulai \(selisih kalender, tidak inklusif\)\. Provisi, Administrasi, dan setiap field biaya tambahan dibandingkan secara terpisah\./);
    assert.ok(VALIDATION_NOTES.every((n) => !n.text.includes("\n") && n.text.length < 220), "ringkas, bukan paragraf panjang");
  });
});

describe("Summary & Output: hanya Syarat Penyelesaian, tanpa alert terpisah", () => {
  const source = readFileSync(join(srcRoot, "components/checklist/step-output.tsx"), "utf8");

  it("tidak memakai komponen Alert maupun banner validasi", () => {
    assert.ok(!/ui\/alert/.test(source), "tidak mengimpor Alert");
    assert.ok(!/<Alert\b/.test(source), "tidak merender Alert");
    assert.ok(!/ValidationSummaryBanner/.test(source), "tidak memakai banner Hasil Validasi");
    assert.ok(!/role="alert"/.test(source));
  });

  it("memakai accordion untuk empat syarat dan memuat bagian Syarat Penyelesaian", () => {
    assert.ok(/AccordionItem/.test(source));
    assert.ok(source.includes("Syarat Penyelesaian"));
  });
});
