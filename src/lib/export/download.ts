/** Mengunduh Blob sebagai file (browser only). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Beri waktu browser memulai unduhan sebelum URL dilepas.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
