"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  caretAfterSignificant,
  countSignificantBefore,
  type SignificantTest,
} from "@/lib/input/caret";

type FormattedInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  /** Teks yang ditampilkan (sudah berformat). */
  value: string;
  /** Mengubah isian mentah (hasil ketik/paste) menjadi teks berformat. */
  format: (raw: string) => string;
  /** Karakter yang dihitung untuk menjaga posisi kursor (umumnya digit). */
  isSignificant: SignificantTest;
  onValueChange: (formatted: string) => void;
};

/**
 * Input yang memformat isiannya saat diketik tanpa membuat kursor meloncat:
 * posisi kursor dipulihkan berdasarkan jumlah digit di kiri kursor.
 */
const FormattedInput = React.forwardRef<HTMLInputElement, FormattedInputProps>(
  ({ value, format, isSignificant, onValueChange, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const el = event.currentTarget;
      const raw = el.value;
      const caret = el.selectionStart ?? raw.length;
      const significantBefore = countSignificantBefore(raw, caret, isSignificant);
      const next = format(raw);

      onValueChange(next);

      // Teks tidak berubah (mis. ketikan biasa pada isian bebas): kursor sudah benar.
      if (next === raw) return;

      // Teks diformat ulang: kembalikan kursor ke tempat yang wajar setelah React menulis nilai.
      requestAnimationFrame(() => {
        if (document.activeElement !== el) return;
        const position = caretAfterSignificant(next, significantBefore, isSignificant);
        try {
          el.setSelectionRange(position, position);
        } catch {
          // Beberapa tipe input tidak mendukung seleksi; abaikan.
        }
      });
    };

    return <Input ref={ref} type="text" value={value} onChange={handleChange} {...props} />;
  },
);
FormattedInput.displayName = "FormattedInput";

export { FormattedInput };
