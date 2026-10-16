import { DOCUMENT_CATEGORIES, FALLBACK_DOCUMENT_CATEGORY, getDocumentCategory } from "./config";
import type { DocumentVerification } from "./types";

/**
 * Pembantu Document Verification berkategori (murni, tanpa React).
 * Kategori utama berasal dari `DOCUMENT_CATEGORIES`; subkategori statis ikut
 * konfigurasi, sedangkan subkategori custom ditambahkan ADK lewat tombol "+".
 */

export type LabelledDocument = DocumentVerification & { label: string };

export type DocumentGroup = {
  /** Nomor kategori (1..n, sesuai urutan DOCUMENT_CATEGORIES). */
  no: number;
  key: string;
  title: string;
  /** Dokumen kategori ini; `label` = nomor tampil, mis. "2.1" (kategori.urut). */
  documents: LabelledDocument[];
};

/** Kelompokkan dokumen menurut kategori (urutan kategori tetap; urutan dokumen = urutan data). */
export function groupDocuments(documents: readonly DocumentVerification[]): DocumentGroup[] {
  return DOCUMENT_CATEGORIES.map((category, index) => {
    const no = index + 1;
    return {
      no,
      key: category.key,
      title: category.title,
      documents: documents
        .filter((d) => d.categoryKey === category.key)
        .map((d, i) => ({ ...d, label: `${no}.${i + 1}` })),
    };
  });
}

/** Nama dibandingkan tanpa memperhatikan kapitalisasi dan spasi berlebih. */
export function normalizeDocumentName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

/** Dokumen lain pada kategori yang sama dengan nama sama (bila ada). */
export function findDuplicateDocument(
  documents: readonly DocumentVerification[],
  categoryKey: string,
  name: string,
): DocumentVerification | undefined {
  const wanted = normalizeDocumentName(name);
  if (!wanted) return undefined;
  return documents.find(
    (d) => d.categoryKey === categoryKey && normalizeDocumentName(d.documentName) === wanted,
  );
}

/** Dokumen sudah berisi data ADK (status atau keterangan). */
export function documentHasData(document: DocumentVerification): boolean {
  return document.status !== null || document.notes.trim() !== "";
}

export function nextDocumentId(documents: readonly DocumentVerification[]): number {
  return documents.reduce((max, d) => Math.max(max, d.id), 0) + 1;
}

export type DocumentTotals = {
  total: number;
  checked: number;
  ada: number;
  tidakAda: number;
  unchecked: number;
};

export function totalsOf(documents: readonly DocumentVerification[]): DocumentTotals {
  const ada = documents.filter((d) => d.status === "Ada").length;
  const tidakAda = documents.filter((d) => d.status === "Tidak Ada").length;
  return {
    total: documents.length,
    checked: ada + tidakAda,
    ada,
    tidakAda,
    unchecked: documents.length - ada - tidakAda,
  };
}

/** Kategori yang valid; kunci tak dikenal dialihkan ke "Surat-Surat Lainnya". */
export function resolveCategoryKey(key: string | undefined): string {
  return key && getDocumentCategory(key) ? key : FALLBACK_DOCUMENT_CATEGORY;
}
