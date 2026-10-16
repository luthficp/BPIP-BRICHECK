const LAST_ADK_KEY = "bri-bg-checklist:last-adk";

/** Nama Lengkap ADK terakhir dipakai, agar tidak diketik ulang setiap membuat checklist. */
export function getLastAdkName(): string {
  try {
    return window.localStorage.getItem(LAST_ADK_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLastAdkName(name: string): void {
  try {
    window.localStorage.setItem(LAST_ADK_KEY, name);
  } catch {
    /* storage tidak tersedia: abaikan, hanya kenyamanan */
  }
}
