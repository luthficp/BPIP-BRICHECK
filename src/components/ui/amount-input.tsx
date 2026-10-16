"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { FormattedInput } from "@/components/ui/formatted-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/checklist/config";
import type { AmountValue } from "@/lib/checklist/types";
import { isDigitOrDot } from "@/lib/input/caret";
import {
  feeHasSuspiciousDecimal,
  formatFeeInput,
  formatPastedFee,
  formatThousands,
  isSuspiciousDecimal,
  parsePastedAmount,
  toCanonicalAmount,
} from "@/lib/validation/amount";

const DECIMAL_WARNING =
  "Titik dibaca sebagai desimal. Gunakan koma sebagai pemisah ribuan (400,000) atau ketik angka tanpa pemisah.";

function DecimalWarning() {
  return (
    <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-warning">
      <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
      {DECIMAL_WARNING}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Nilai Bank Garansi                                                   */
/* ------------------------------------------------------------------ */

type AmountInputProps = {
  value: AmountValue;
  onChange: (patch: Partial<AmountValue>) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  /**
   * true = mata uang di atas nominal (untuk kolom sempit, mis. layout 2 x 2).
   * Default: sebaris (mata uang di kiri nominal).
   */
  stacked?: boolean;
};

/**
 * Mata uang + nominal. Yang disimpan adalah angka kanonik tanpa pemisah
 * ("4000000"); "4,000,000" hanya tampilan dan diperbarui saat mengetik.
 */
export function AmountInput({
  value,
  onChange,
  label,
  disabled,
  invalid,
  stacked = false,
}: AmountInputProps) {
  const display = formatThousands(value.amount);

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const parsed = parsePastedAmount(event.clipboardData.getData("text"), value.currency);
    if (!parsed) return; // biarkan paste biasa; teks akan dibersihkan oleh format
    event.preventDefault();
    onChange({ currency: parsed.currency, amount: parsed.amount });
  };

  return (
    <div>
      <div className={stacked ? "flex flex-col gap-1" : "flex items-center gap-1"}>
        <Select
          value={value.currency || DEFAULT_CURRENCY}
          onValueChange={(currency) => onChange({ currency })}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label={`${label}: mata uang`}
            aria-invalid={invalid ? true : undefined}
            className={stacked ? "w-full px-2" : "w-[5.25rem] shrink-0 px-2"}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormattedInput
          value={display}
          format={(raw) => formatThousands(toCanonicalAmount(raw))}
          isSignificant={isDigitOrDot}
          onValueChange={(next) => onChange({ amount: toCanonicalAmount(next) })}
          onPaste={handlePaste}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label={label}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          className="min-w-0 text-right tabular-nums"
        />
      </div>
      {isSuspiciousDecimal(value.amount) && <DecimalWarning />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Biaya (Provisi / Administrasi)                                       */
/* ------------------------------------------------------------------ */

type FeeInputProps = {
  value: string;
  onChange: (next: string) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Placeholder; default memuat petunjuk lengkap, ringkas untuk kolom sempit (mis. layout 2 x 2). */
  placeholder?: string;
};

/**
 * Satu komponen Biaya. Angka murni diberi pemisah ribuan otomatis; teks lain
 * (mis. "1.25% p.a.") dibiarkan apa adanya.
 */
export function FeeInput({
  value,
  onChange,
  label,
  disabled,
  invalid,
  placeholder = "Nominal atau %",
}: FeeInputProps) {
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const formatted = formatPastedFee(event.clipboardData.getData("text"));
    if (formatted === null) return; // bukan angka murni: paste biasa (mis. "1.25%")
    event.preventDefault();
    onChange(formatted);
  };

  return (
    <div className="min-w-0 flex-1">
      <FormattedInput
        value={value}
        format={formatFeeInput}
        isSignificant={isDigitOrDot}
        onValueChange={onChange}
        onPaste={handlePaste}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        disabled={disabled}
        className="min-w-0 tabular-nums"
      />
      {feeHasSuspiciousDecimal(value) && <DecimalWarning />}
    </div>
  );
}
