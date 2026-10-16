import type { BankGuaranteeChecklist } from "@/lib/checklist/types";

/**
 * Persistence boundary. UI dan hooks hanya bergantung pada interface ini.
 * Untuk pindah ke backend/database, cukup tulis implementasi baru
 * (mis. REST/tRPC/Server Actions) dan ganti export di `./index.ts`.
 */
export interface ChecklistRepository {
  list(): Promise<BankGuaranteeChecklist[]>;
  get(id: string): Promise<BankGuaranteeChecklist | null>;
  save(checklist: BankGuaranteeChecklist): Promise<void>;
  remove(id: string): Promise<void>;
}
