/**
 * Membaca teks dari berkas PDF DI BROWSER (PDF.js). Berkas tidak diunggah ke server mana pun dan
 * tidak disimpan; hanya teksnya yang diproses di memori lalu dibuang.
 *
 * PDF.js dimuat dari berkas statis `public/pdfjs/` (satu asal dengan aplikasi), bukan dari npm,
 * sehingga tidak ada dependensi baru dan tidak ada konfigurasi bundler khusus.
 *
 * Hanya PDF berisi teks (hasil ekspor Word/sistem). PDF hasil scan/foto TIDAK didukung (belum ada OCR).
 */

export const PDFJS_MODULE_URL = "/pdfjs/pdf.min.mjs";
export const PDFJS_WORKER_URL = "/pdfjs/pdf.worker.min.mjs";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;
/** Di bawah ini PDF dianggap tidak berisi teks yang bisa dibaca (kemungkinan scan/gambar). */
export const MIN_TEXT_CHARS = 200;

export class PdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfReadError";
  }
}

type TextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };

type PdfPage = { getTextContent: () => Promise<{ items: unknown[] }> };
type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    disableAutoFetch?: boolean;
  }) => { promise: Promise<PdfDocument>; destroy: () => Promise<void> | void };
};

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    const url = PDFJS_MODULE_URL;
    pdfjsPromise = (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<PdfJs>)
      .then((mod) => {
        mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return mod;
      })
      .catch(() => {
        pdfjsPromise = null;
        throw new PdfReadError(
          "Pembaca PDF tidak dapat dimuat. Pastikan folder public/pdfjs ikut ter-deploy.",
        );
      });
  }
  return pdfjsPromise;
}

/** PDF yang sah memuat "%PDF-" pada 1024 byte pertama. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  for (let i = 0; i + marker.length <= head.length; i++) {
    if (marker.every((byte, j) => head[i + j] === byte)) return true;
  }
  return false;
}

function isTextItem(item: unknown): item is TextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as TextItem).str === "string" &&
    Array.isArray((item as TextItem).transform)
  );
}

/**
 * Menyusun item teks satu halaman menjadi baris: item dengan koordinat y berdekatan digabung dan
 * diurutkan dari kiri ke kanan; jarak horizontal yang cukup lebar menjadi spasi.
 */
export function itemsToLines(items: readonly unknown[]): string[] {
  const texts = items.filter(isTextItem).filter((item) => item.str !== "");
  type Row = { y: number; parts: { x: number; end: number; str: string }[] };
  const rows: Row[] = [];
  for (const item of texts) {
    const x = item.transform[4];
    const y = item.transform[5];
    const row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
    const part = { x, end: x + (item.width || 0), str: item.str };
    if (row) row.parts.push(part);
    else rows.push({ y, parts: [part] });
  }
  rows.sort((a, b) => b.y - a.y); // atas ke bawah
  return rows.map((row) => {
    const parts = row.parts.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEnd: number | null = null;
    for (const part of parts) {
      if (prevEnd !== null && part.x - prevEnd > 1.5 && !line.endsWith(" ") && !part.str.startsWith(" ")) {
        line += " ";
      }
      line += part.str;
      prevEnd = part.end;
    }
    return line;
  });
}

/** Teks seluruh PDF; baris dipisah newline, halaman dipisah baris kosong. */
export async function readPdfText(file: File): Promise<string> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new PdfReadError("Berkas harus berformat PDF.");
  }
  if (file.size === 0) throw new PdfReadError("Berkas kosong.");
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfReadError(`Ukuran berkas melebihi ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
  }

  // Isi berkas diperiksa, bukan hanya ekstensi/MIME: PDF yang sah diawali "%PDF-".
  const data = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(data)) {
    throw new PdfReadError("Isi berkas bukan PDF yang valid. Pilih berkas PDF yang benar.");
  }
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableAutoFetch: true });
  let doc: PdfDocument;
  try {
    doc = await task.promise;
  } catch {
    throw new PdfReadError("PDF tidak dapat dibuka (rusak atau dilindungi kata sandi).");
  }

  try {
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new PdfReadError(`PDF terlalu panjang (maksimal ${MAX_PDF_PAGES} halaman).`);
    }
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(itemsToLines(content.items).join("\n"));
    }
    const text = pages.join("\n\n");
    if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
      throw new PdfReadError(
        "Teks tidak terbaca. PDF kemungkinan hasil scan/foto; prototype belum mendukung OCR, isi manual.",
      );
    }
    return text;
  } finally {
    void task.destroy();
  }
}
