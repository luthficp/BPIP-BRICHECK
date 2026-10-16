/**
 * Pembantu posisi kursor untuk input yang diformat otomatis (pemisah ribuan,
 * mask tanggal). Posisi dihitung dari jumlah karakter "bermakna" (digit) di
 * kiri kursor, sehingga kursor tidak meloncat ketika pemisah disisipkan/dihapus.
 */

export type SignificantTest = (char: string) => boolean;

/** Jumlah karakter bermakna di sebelah kiri `caret`. */
export function countSignificantBefore(
  text: string,
  caret: number,
  isSignificant: SignificantTest,
): number {
  let count = 0;
  const end = Math.min(Math.max(caret, 0), text.length);
  for (let i = 0; i < end; i += 1) {
    if (isSignificant(text[i])) count += 1;
  }
  return count;
}

/** Posisi kursor tepat setelah karakter bermakna ke-`count` pada teks hasil format. */
export function caretAfterSignificant(
  text: string,
  count: number,
  isSignificant: SignificantTest,
): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (isSignificant(text[i])) {
      seen += 1;
      if (seen === count) return i + 1;
    }
  }
  return text.length;
}

export const isDigitOrDot: SignificantTest = (char) => (char >= "0" && char <= "9") || char === ".";
export const isDigit: SignificantTest = (char) => char >= "0" && char <= "9";
