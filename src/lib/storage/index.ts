import { localStorageRepository } from "./local-storage-repository";
import type { ChecklistRepository } from "./repository";

/**
 * Repository aktif. Bawaan: localStorage (mode lokal, tanpa Supabase). Saat pengguna masuk pada mode Supabase,
 * AuthProvider memasang repository sinkron per-akun lewat `setActiveRepository`, dan UI/hooks tidak berubah
 * karena hanya memakai `checklistRepository` di bawah.
 */
let active: ChecklistRepository = localStorageRepository;

export function setActiveRepository(repository: ChecklistRepository): void {
  active = repository;
}

export function resetActiveRepository(): void {
  active = localStorageRepository;
}

export const checklistRepository: ChecklistRepository = {
  list: () => active.list(),
  get: (id) => active.get(id),
  save: (checklist) => active.save(checklist),
  remove: (id) => active.remove(id),
};

export { STORAGE_EVENT_KEY } from "./local-storage-repository";
export type { ChecklistRepository } from "./repository";
export { getLastAdkName, setLastAdkName } from "./preferences";
