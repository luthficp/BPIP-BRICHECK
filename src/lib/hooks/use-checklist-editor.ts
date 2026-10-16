"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { nowIso } from "@/lib/checklist/factory";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { checklistRepository } from "@/lib/storage";
import { recalculateMatches } from "@/lib/validation/three-way-match";

export type SaveState = "idle" | "saving" | "saved" | "error";
export type LoadState = "loading" | "ready" | "notfound";

const AUTOSAVE_DELAY_MS = 500;

/**
 * Memuat satu checklist dan menyediakan `update` dengan autosave (debounce).
 * - `matchStatus` selalu dihitung ulang oleh validation engine pada setiap update
 * - `updatedAt` diberi cap waktu sistem
 * - data di-flush saat unmount / tab ditutup agar tidak ada perubahan hilang
 */
export function useChecklistEditor(id: string) {
  const [checklist, setChecklist] = useState<BankGuaranteeChecklist | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveStateRaw] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const latest = useRef<BankGuaranteeChecklist | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateRef = useRef<SaveState>("idle");

  const setSaveState = useCallback((state: SaveState) => {
    saveStateRef.current = state;
    setSaveStateRaw(state);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    checklistRepository
      .get(id)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setLoadState("notfound");
          return;
        }
        latest.current = found;
        setChecklist(found);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("notfound");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const current = latest.current;
    if (!dirty.current || !current) return;
    dirty.current = false;
    try {
      await checklistRepository.save(current);
      if (!dirty.current) {
        setSaveState("saved");
        setSavedAt(nowIso());
      }
    } catch {
      dirty.current = true;
      setSaveState("error");
    }
  }, [setSaveState]);

  const update = useCallback(
    (
      updater: (current: BankGuaranteeChecklist) => BankGuaranteeChecklist,
      options: { immediate?: boolean } = {},
    ) => {
      const previous = latest.current;
      if (!previous) return;
      const draft = updater(previous);
      const next: BankGuaranteeChecklist = {
        ...draft,
        criticalFields: recalculateMatches(draft.criticalFields),
        updatedAt: nowIso(),
      };
      latest.current = next;
      dirty.current = true;
      setChecklist(next);
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, options.immediate ? 0 : AUTOSAVE_DELAY_MS);
    },
    [flush, setSaveState],
  );

  useEffect(() => {
    const handlePageHide = () => {
      void flush();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      void flush();
      // Hanya ganggu pengguna bila penyimpanan benar-benar gagal.
      if (saveStateRef.current === "error") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void flush();
    };
  }, [flush]);

  return { checklist, loadState, saveState, savedAt, update, flush };
}
