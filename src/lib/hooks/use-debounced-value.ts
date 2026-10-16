"use client";

import { useEffect, useState } from "react";

/** Menunda nilai agar tampilan validasi tidak berkedip saat ADK sedang mengetik. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}
