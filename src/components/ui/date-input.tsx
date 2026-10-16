"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormattedInput } from "@/components/ui/formatted-input";
import { formatDateMask } from "@/lib/input/date-mask";
import { isDigit } from "@/lib/input/caret";
import { displayToIso, isoToDisplay } from "@/lib/validation/period";
import { cn } from "@/lib/utils";

type DateInputProps = {
  /** Tanggal ISO (yyyy-mm-dd); "" = belum diisi. */
  value: string;
  /** Dipanggil dengan tanggal ISO, atau "" bila isian belum lengkap/tidak valid. */
  onChange: (iso: string) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
};

/**
 * Input tanggal dd/mm/yyyy (mask otomatis) + date picker bawaan browser.
 * Nilai tersimpan selalu ISO; tampilan selalu dd/mm/yyyy, tidak bergantung
 * pada locale browser. Isian yang belum lengkap/tidak valid disimpan sebagai
 * kosong sehingga tidak pernah dianggap sebagai tanggal.
 */
export function DateInput({
  value,
  onChange,
  label,
  disabled,
  invalid,
  className,
}: DateInputProps) {
  const [text, setText] = React.useState(() => isoToDisplay(value));
  const [touched, setTouched] = React.useState(false);
  const pickerRef = React.useRef<HTMLInputElement>(null);

  // Sinkronkan dari luar (data dimuat, dipilih lewat picker) tanpa menimpa ketikan sebagian.
  React.useEffect(() => {
    if (value) {
      const shown = isoToDisplay(value);
      if (shown !== text) setText(shown);
    } else if (displayToIso(text) !== null) {
      setText("");
    }
  }, [value, text]);

  const handleText = (next: string) => {
    setText(next);
    const iso = displayToIso(next) ?? "";
    if (iso !== value) onChange(iso);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      // showPicker dapat melempar galat bila tidak dipicu aksi pengguna; coba cara lain.
    }
    el.focus();
    el.click();
  };

  const impossible = text.length === 10 && displayToIso(text) === null;
  const partial = touched && text.length > 0 && text.length < 10;
  const error = impossible ? "Tanggal tidak valid" : partial ? "Lengkapi: dd/mm/yyyy" : null;
  const showInvalid = invalid || Boolean(error);

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className="relative flex items-center gap-1">
        <FormattedInput
          value={text}
          format={formatDateMask}
          isSignificant={isDigit}
          onValueChange={handleText}
          onBlur={() => setTouched(true)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          maxLength={10}
          aria-label={label}
          aria-invalid={showInvalid ? true : undefined}
          disabled={disabled}
          className="min-w-0 tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={`Pilih tanggal: ${label}`}
          disabled={disabled}
          onClick={openPicker}
        >
          <CalendarDays aria-hidden="true" />
        </Button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pointer-events-none absolute bottom-0 right-0 h-9 w-9 opacity-0"
        />
      </div>
      {error && (
        <p className="mt-0.5 text-[11px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
