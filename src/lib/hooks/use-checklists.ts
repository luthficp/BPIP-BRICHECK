"use client";

import { useCallback, useEffect, useState } from "react";

import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { DATA_CHANGED_EVENT } from "@/lib/storage/cloud-repository";
import { checklistRepository } from "@/lib/storage";

/** Daftar semua checklist untuk Dashboard Monitor. `items === null` berarti masih memuat. */
export function useChecklists() {
  const [items, setItems] = useState<BankGuaranteeChecklist[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await checklistRepository.list());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Sinkron bila tab lain mengubah data.
    const onStorage = () => void refresh();
    window.addEventListener("storage", onStorage);
    // Mode Supabase: data baru dari server sudah masuk ke cache.
    window.addEventListener(DATA_CHANGED_EVENT, onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DATA_CHANGED_EVENT, onStorage);
    };
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await checklistRepository.remove(id);
      await refresh();
    },
    [refresh],
  );

  return { items, loading: items === null, refresh, remove };
}
