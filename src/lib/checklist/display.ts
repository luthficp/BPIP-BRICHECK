import { LABEL_SHARED_INFO } from "@/lib/checklist/config";
import { getFeeComponents } from "@/lib/checklist/fees";
import { describeKontraConfig, getKontraAmount, getKontraText } from "@/lib/checklist/kontra";
import { incompleteCountText, incompleteRowText } from "@/lib/checklist/status-text";
import type {
  CriticalField,
  KontraCriticalField,
  KontraDetail,
  MatchState,
  PerSourceCriticalField,
  SharedCriticalField,
  SourceKey,
} from "@/lib/checklist/types";
import { formatAmountValue, formatFeeInput } from "@/lib/validation/amount";
import {
  formatDuration,
  formatPeriodRange,
  getPeriodStatus,
} from "@/lib/validation/period";
import {
  evaluateField,
  type ComponentEvaluation,
  type FieldEvaluation,
  type KontraFieldEvaluation,
} from "@/lib/validation/three-way-match";

/**
 * Representasi teks tiap sel Critical Field untuk print, preview, dan PDF.
 * Satu sumber format agar nilai tampil konsisten di semua output
 * (nominal ber-separator, tanggal dd/mm/yyyy + jumlah hari, Provisi/Administrasi).
 */

export type DisplayLine = {
  text: string;
  /** Sel/komponen ini menyimpang dari Underlying Document. */
  deviant: boolean;
  /** Teks pendukung (mis. durasi) atau pesan tidak valid. */
  note?: "muted" | "invalid";
};

/** Field yang nilainya diisi per sumber (bukan field bersama / daftar kontra). */
export function isPerSourceField(field: CriticalField): field is PerSourceCriticalField {
  return field.key !== "underlying" && field.key !== "kontraGaransi";
}

export function getSourceLines(
  field: PerSourceCriticalField,
  source: SourceKey,
  evaluation: FieldEvaluation = evaluateField(field),
): DisplayLine[] {
  const deviates = (componentId?: string): boolean => {
    if (source === "underlyingDocument") return false;
    const key = source;
    if (componentId) {
      return evaluation.components.find((c) => c.id === componentId)?.deviating[key] === true;
    }
    return evaluation.deviating[key];
  };

  switch (field.key) {
    case "nilaiBg": {
      const text = formatAmountValue(field[source]);
      return text ? [{ text, deviant: deviates() }] : [];
    }

    case "jangkaWaktu": {
      const value = field[source];
      const status = getPeriodStatus(value);
      if (status.state === "empty") return [];

      const lines: DisplayLine[] = [
        { text: formatPeriodRange(value) || "-", deviant: deviates() },
      ];
      if (status.state === "valid") {
        lines.push({ text: `Durasi: ${formatDuration(status.days)}`, deviant: false, note: "muted" });
      } else if (status.state === "partial") {
        lines.push({ text: "Durasi: belum tersedia", deviant: false, note: "muted" });
      } else {
        const message = status.endMessage ?? status.startMessage ?? "Tanggal tidak valid";
        lines.push({ text: message, deviant: false, note: "invalid" });
      }
      return lines;
    }

    case "biaya": {
      const value = field[source] ?? {};
      const components = getFeeComponents(field);
      const filled = components.some((c) => (value[c.id] ?? "").trim() !== "");
      if (!filled) return [];
      return components.map((c) => {
        const text = formatFeeInput(value[c.id] ?? "").trim();
        return { text: `${c.label}: ${text || "-"}`, deviant: deviates(c.id) };
      });
    }

    default: {
      const text = field[source].trim();
      return text ? [{ text, deviant: deviates() }] : [];
    }
  }
}

/** Seluruh baris digabung dengan newline (untuk sel PDF). */
export function getSourceText(
  field: PerSourceCriticalField,
  source: SourceKey,
  evaluation?: FieldEvaluation,
): string {
  return getSourceLines(field, source, evaluation)
    .map((line) => line.text)
    .join("\n");
}

/** Label status untuk dokumen: "SESUAI" | "TIDAK SESUAI" | "Belum lengkap" | "Informasi bersama". */
export function matchStateLabel(state: MatchState): string {
  if (state === "BELUM LENGKAP") return "Belum lengkap";
  if (state === "BERSAMA") return LABEL_SHARED_INFO;
  return state;
}

/**
 * Deskripsi dinamis di bawah status baris. Hanya ada untuk baris Belum lengkap:
 * "Belum lengkap : {N} field belum terisi" (N = nilai sumber/isian yang kosong).
 */
export function matchStateNote(evaluation: {
  state: MatchState;
  incompleteCount: number;
}): string | null {
  return evaluation.state === "BELUM LENGKAP" ? incompleteRowText(evaluation.incompleteCount) : null;
}

/**
 * Deskripsi ringkas untuk layar (Biaya dan item Kontra Garansi): "{N} field belum terisi" sekali di
 * bawah badge status. Jumlah dihitung dari evaluasi (data aktual), bukan angka tetap.
 */
export function compactMatchStateNote(evaluation: {
  state: MatchState;
  incompleteCount: number;
}): string | null {
  return evaluation.state === "BELUM LENGKAP" ? incompleteCountText(evaluation.incompleteCount) : null;
}

/* ------------------------------------------------------------------ */
/* Biaya: hasil per komponen                                            */
/* ------------------------------------------------------------------ */

export type ComponentResultLine = {
  id: string;
  label: string;
  state: MatchState;
  stateLabel: string;
  /** "Belum lengkap : {N} field belum terisi" untuk komponen yang belum lengkap. */
  note: string | null;
};

/** Hasil Validasi per komponen Biaya (Provisi, Administrasi, dan field tambahan). */
export function getComponentResults(components: ComponentEvaluation[]): ComponentResultLine[] {
  return components.map((component) => ({
    id: component.id,
    label: component.label,
    state: component.state,
    stateLabel: matchStateLabel(component.state),
    note:
      component.state === "BELUM LENGKAP"
        ? incompleteRowText(component.incomplete.length)
        : null,
  }));
}

/** Satu baris ringkas per komponen: "Provisi: SESUAI" / "Notaris: Belum lengkap : 2 field belum terisi". */
export function componentResultText(result: ComponentResultLine): string {
  return result.note
    ? `${result.label}: ${result.stateLabel} - ${result.note}`
    : `${result.label}: ${result.stateLabel}`;
}

/* ------------------------------------------------------------------ */
/* Underlying / Dasar Penerbitan (satu field bersama)                   */
/* ------------------------------------------------------------------ */

export function getSharedLines(field: SharedCriticalField): DisplayLine[] {
  const text = (field.value ?? "").trim();
  return text ? [{ text, deviant: false }] : [];
}

/* ------------------------------------------------------------------ */
/* Kontra Garansi                                                       */
/* ------------------------------------------------------------------ */

/** Ringkasan konfigurasi: "Fixed Asset × 2, Kendaraan × 1" atau "Belum dikonfigurasi". */
export function kontraConfigText(field: KontraCriticalField): string {
  return describeKontraConfig(field.items ?? []) || "Belum dikonfigurasi";
}

/** Nilai satu field detail kontra pada satu sumber, untuk ditampilkan di output. */
export function getKontraDetailLines(
  field: KontraFieldEvaluation,
  detail: KontraDetail | undefined,
  source: SourceKey,
): DisplayLine[] {
  const deviant = source === "underlyingDocument" ? false : field.evaluation.deviating[source];
  const text =
    field.kind === "currency"
      ? formatAmountValue(getKontraAmount(detail, field.key))
      : getKontraText(detail, field.key).trim();
  return text ? [{ text, deviant }] : [];
}
