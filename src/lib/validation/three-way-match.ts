import {
  getFieldDef,
  getKontraTypeDef,
  LABEL_MEMORANDUM,
  LABEL_PUTUSAN,
  LABEL_UNDERLYING,
  SOURCE_ORDER,
} from "@/lib/checklist/config";
import { getFeeComponents } from "@/lib/checklist/fees";
import { getKontraAmount, getKontraText, kontraItemTitles } from "@/lib/checklist/kontra";
import type {
  CriticalField,
  KontraCriticalField,
  KontraItem,
  MatchResult,
  MatchState,
  PerSourceCriticalField,
  SharedCriticalField,
  SourceKey,
} from "@/lib/checklist/types";
import { amountKey, toFeeKey } from "./amount";
import { normalizeText } from "./normalize";
import { getPeriodStatus } from "./period";

/**
 * Validation engine "Hasil Validasi" (perbandingan tiga sumber).
 *
 * Nama berkas & kunci data internal (`ptk`, `mak`) dipertahankan agar data
 * tersimpan tetap kompatibel; label untuk pengguna ada di `config.ts`.
 *
 * Aturan bisnis (Underlying Document adalah acuan, hasil TIDAK pernah diketik ADK):
 *   - BELUM LENGKAP  : satu atau lebih dari tiga nilai sumber pada baris itu
 *                      masih kosong/tidak valid. Selama ada nilai kosong, baris
 *                      TIDAK disimpulkan SESUAI maupun TIDAK SESUAI, tidak ada
 *                      sorotan penyimpangan, dan tidak dihitung sebagai mismatch.
 *   - SESUAI         : ketiga sumber terisi dan secara substantif sama pada
 *                      Underlying Document, Memorandum Analisa Bank Garansi,
 *                      dan Putusan Bank Garansi
 *   - TIDAK SESUAI   : ketiga sumber terisi dan ada perbedaan substantif
 *
 * Teks "Tidak tercantum" adalah nilai yang terisi biasa: ia dibandingkan sama
 * seperti teks lain terhadap nilai pada sumber lain.
 *
 * Perbandingan mengikuti tipe data:
 *   teks -> normalisasi aman | nominal -> angka + mata uang | jangka waktu ->
 *   tanggal mulai & akhir | biaya -> Provisi, Administrasi, dan field tambahan
 *   masing-masing terpisah | dropdown -> nilai pilihan.
 *
 * Kekhususan:
 *   - Biaya: tiap komponen punya hasil sendiri. Baris Biaya tetap BELUM LENGKAP
 *     bila ada satu nilai sumber kosong pada komponen mana pun.
 *   - Kontra Garansi: daftar item; tiap field detail item dibandingkan pada tiga
 *     sumber dan punya hasil sendiri; item dan baris merangkum hasilnya.
 *   - Underlying / Dasar Penerbitan: satu field bersama (state BERSAMA), tidak
 *     dibandingkan; kosong = BELUM LENGKAP.
 *
 * Urutan sumber pada semua tampilan: Underlying Document -> Memorandum Analisa
 * Bank Garansi (`mak`) -> Putusan Bank Garansi (`ptk`).
 */

export const SOURCE_KEYS: SourceKey[] = [...SOURCE_ORDER];

export function isFilled(value: string): boolean {
  return value.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/* Inti: bandingkan satu komponen pada tiga sumber                      */
/* ------------------------------------------------------------------ */

/** Isi satu sel (satu sumber, satu komponen) setelah normalisasi. */
export type Cell =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "ok"; key: string };

export type ComponentSpec = {
  id: string;
  label: string;
  cells: Record<SourceKey, Cell>;
};

export type ComponentEvaluation = {
  id: string;
  label: string;
  state: MatchState;
  /** Putusan/Memorandum yang menyimpang dari Underlying Document. */
  deviating: { ptk: boolean; mak: boolean };
  /** Penjelasan perbedaan untuk ADK. */
  reasons: string[];
  /** Sumber yang isinya belum lengkap atau tidak valid. */
  incomplete: SourceKey[];
  invalid: { source: SourceKey; message: string }[];
};

function pairDiffers(a: Cell, b: Cell): boolean | null {
  return a.status === "ok" && b.status === "ok" ? a.key !== b.key : null;
}

export function evaluateComponent(spec: ComponentSpec): ComponentEvaluation {
  const { underlyingDocument: u, ptk: p, mak: m } = spec.cells;
  const underlyingVsPtk = pairDiffers(u, p);
  const underlyingVsMak = pairDiffers(u, m);
  const ptkVsMak = pairDiffers(p, m);

  const incomplete = SOURCE_KEYS.filter((key) => spec.cells[key].status !== "ok");
  const invalid = SOURCE_KEYS.flatMap((source) => {
    const cell = spec.cells[source];
    return cell.status === "invalid" ? [{ source, message: cell.message }] : [];
  });

  // Ada nilai sumber yang kosong: jangan menyimpulkan apa pun (bukan mismatch).
  if (incomplete.length > 0) {
    return {
      id: spec.id,
      label: spec.label,
      state: "BELUM LENGKAP",
      deviating: { ptk: false, mak: false },
      reasons: [],
      incomplete,
      invalid,
    };
  }

  const state: MatchState =
    underlyingVsPtk || underlyingVsMak || ptkVsMak ? "TIDAK SESUAI" : "SESUAI";

  const reasons: string[] = [];
  if (underlyingVsMak) reasons.push(`${LABEL_MEMORANDUM} berbeda dengan ${LABEL_UNDERLYING}`);
  if (underlyingVsPtk) reasons.push(`${LABEL_PUTUSAN} berbeda dengan ${LABEL_UNDERLYING}`);
  if (ptkVsMak && !underlyingVsPtk && !underlyingVsMak) {
    reasons.push(`${LABEL_PUTUSAN} berbeda dengan ${LABEL_MEMORANDUM}`);
  }

  return {
    id: spec.id,
    label: spec.label,
    state,
    deviating: { ptk: underlyingVsPtk === true, mak: underlyingVsMak === true },
    reasons,
    incomplete,
    invalid,
  };
}

/* ------------------------------------------------------------------ */
/* Pembentuk sel per tipe data                                          */
/* ------------------------------------------------------------------ */

const EMPTY: Cell = { status: "empty" };

function textCell(raw: string, mode: "text" | "select"): Cell {
  const trimmed = raw.trim();
  if (!trimmed) return EMPTY;
  // Dropdown: nilai enum harus persis sama. Teks: normalisasi aman.
  return { status: "ok", key: mode === "select" ? `sel:${trimmed}` : `txt:${normalizeText(trimmed)}` };
}

function keyCell(key: string): Cell {
  return key ? { status: "ok", key } : EMPTY;
}

function mapSources<T>(build: (source: SourceKey) => T): Record<SourceKey, T> {
  return {
    underlyingDocument: build("underlyingDocument"),
    mak: build("mak"),
    ptk: build("ptk"),
  };
}

/** Komponen yang dibandingkan untuk satu critical field. */
export function getComponentSpecs(field: CriticalField): ComponentSpec[] {
  const def = getFieldDef(field.key);

  switch (field.key) {
    // Dievaluasi terpisah (lihat evaluateKontra / evaluateShared).
    case "kontraGaransi":
    case "underlying":
      return [];

    case "nilaiBg":
      return [
        {
          id: "amount",
          label: def.label,
          cells: mapSources((s) => keyCell(amountKey(field[s]))),
        },
      ];

    case "jangkaWaktu":
      return [
        {
          id: "start",
          label: "Tanggal mulai",
          cells: mapSources((s): Cell => {
            const status = getPeriodStatus(field[s]);
            if (status.startMessage) return { status: "invalid", message: status.startMessage };
            return status.startValid ? { status: "ok", key: `d:${field[s].start}` } : EMPTY;
          }),
        },
        {
          id: "end",
          label: "Tanggal akhir",
          cells: mapSources((s): Cell => {
            const status = getPeriodStatus(field[s]);
            if (status.endMessage) return { status: "invalid", message: status.endMessage };
            return status.endValid ? { status: "ok", key: `d:${field[s].end}` } : EMPTY;
          }),
        },
      ];

    case "biaya":
      // Komponen Biaya dinamis: Provisi, Administrasi, dan field tambahan (sama untuk ketiga sumber).
      return getFeeComponents(field).map((component) => ({
        id: component.id,
        label: component.label,
        cells: mapSources((s) => keyCell(toFeeKey(field[s]?.[component.id] ?? ""))),
      }));

    default: {
      const mode = def.kind === "select" ? "select" : "text";
      return [
        {
          id: "value",
          label: def.label,
          cells: mapSources((s) => textCell(field[s], mode)),
        },
      ];
    }
  }
}

/* ------------------------------------------------------------------ */
/* Evaluasi satu critical field                                         */
/* ------------------------------------------------------------------ */

/** Hasil satu field detail pada satu item Kontra Garansi. */
export type KontraFieldEvaluation = {
  key: string;
  label: string;
  kind: "text" | "currency";
  evaluation: ComponentEvaluation;
};

/** Hasil satu item Kontra Garansi (merangkum seluruh field detailnya). */
export type KontraItemEvaluation = {
  item: KontraItem;
  /** "Fixed Asset #1", "Kendaraan #1", ... */
  title: string;
  typeLabel: string;
  state: MatchState;
  /** Jumlah isian (field detail x sumber) yang masih kosong pada item ini. */
  incompleteCount: number;
  /** Ada field detail yang BENAR-BENAR TIDAK SESUAI. */
  hasMismatch: boolean;
  fields: KontraFieldEvaluation[];
  /** Penjelasan perbedaan, diawali nama field. */
  reasons: string[];
  /** Jumlah field detail yang sudah terisi, per sumber. */
  filledBySource: Record<SourceKey, number>;
};

export type FieldEvaluation = {
  state: MatchState;
  components: ComponentEvaluation[];
  /** Putusan/Memorandum yang menyimpang pada komponen mana pun. */
  deviating: { ptk: boolean; mak: boolean };
  /** Penjelasan; diberi awalan nama komponen bila field punya lebih dari satu komponen. */
  reasons: string[];
  /**
   * Sumber yang nilainya belum terisi lengkap atau tidak valid (0-3), dipakai untuk
   * menandai sel sumber. Untuk field bersama selalu kosong.
   */
  incompleteSources: SourceKey[];
  /**
   * N pada "Belum lengkap : {N} field belum terisi". Field biasa: jumlah nilai sumber
   * yang kosong (0-3). Field bersama: 0/1. Kontra Garansi: jumlah isian detail yang
   * kosong pada seluruh item (3 bila belum ada item).
   */
  incompleteCount: number;
  /**
   * true bila ada komponen/field detail yang BENAR-BENAR TIDAK SESUAI dan terlihat di
   * layar, walau baris itu secara keseluruhan masih Belum lengkap. Dipakai untuk memblokir
   * lanjut ke Opini ADK.
   */
  hasMismatch: boolean;
  invalid: { source: SourceKey; message: string }[];
  /** Hanya Kontra Garansi: hasil per item. */
  items?: KontraItemEvaluation[];
};

/** Komponen yang belum boleh disimpulkan (baris belum lengkap): tanpa sorotan dan alasan mismatch. */
function neutralize(component: ComponentEvaluation): ComponentEvaluation {
  return {
    ...component,
    state: "BELUM LENGKAP",
    deviating: { ptk: false, mak: false },
    reasons: [],
  };
}

/** Pesan tidak valid yang sama (mis. di dua komponen) cukup ditampilkan sekali. */
function dedupeInvalid(components: ComponentEvaluation[]) {
  const seen = new Set<string>();
  return components
    .flatMap((c) => c.invalid)
    .filter((item) => {
      const id = `${item.source}:${item.message}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function isTidakSesuai(component: ComponentEvaluation): boolean {
  return component.state === "TIDAK SESUAI";
}

/* --- Underlying / Dasar Penerbitan: satu field bersama ------------------ */

function evaluateShared(field: SharedCriticalField): FieldEvaluation {
  const filled = isFilled(field.value ?? "");
  return {
    state: filled ? "BERSAMA" : "BELUM LENGKAP",
    components: [],
    deviating: { ptk: false, mak: false },
    reasons: [],
    incompleteSources: [],
    incompleteCount: filled ? 0 : 1,
    hasMismatch: false,
    invalid: [],
  };
}

/* --- Kontra Garansi: daftar item ----------------------------------------- */

function kontraFieldSpec(
  item: KontraItem,
  field: { key: string; label: string; kind: "text" | "currency" },
): ComponentSpec {
  return {
    id: `${item.id}:${field.key}`,
    label: field.label,
    cells: mapSources((source) => {
      const detail = item.values?.[source];
      return field.kind === "currency"
        ? keyCell(amountKey(getKontraAmount(detail, field.key)))
        : textCell(getKontraText(detail, field.key), "text");
    }),
  };
}

function evaluateKontraItem(item: KontraItem, title: string): KontraItemEvaluation {
  const def = getKontraTypeDef(item.type);
  const fields: KontraFieldEvaluation[] = def.fields.map((fieldDef) => ({
    key: fieldDef.key,
    label: fieldDef.label,
    kind: fieldDef.kind,
    evaluation: evaluateComponent(kontraFieldSpec(item, fieldDef)),
  }));

  const incompleteCount = fields.reduce((sum, f) => sum + f.evaluation.incomplete.length, 0);
  const hasMismatch = fields.some((f) => isTidakSesuai(f.evaluation));
  // Item tidak pernah SESUAI/TIDAK SESUAI selama ada isian detail yang kosong.
  const state: MatchState = fields.some((f) => f.evaluation.state === "BELUM LENGKAP")
    ? "BELUM LENGKAP"
    : hasMismatch
      ? "TIDAK SESUAI"
      : "SESUAI";

  const filledBySource = mapSources(
    (source) => fields.filter((f) => !f.evaluation.incomplete.includes(source)).length,
  );

  return {
    item,
    title,
    typeLabel: def.label,
    state,
    incompleteCount,
    hasMismatch,
    fields,
    reasons: fields.flatMap((f) =>
      f.evaluation.reasons.map((reason) => `${f.label}: ${reason}`),
    ),
    filledBySource,
  };
}

function evaluateKontra(field: KontraCriticalField): FieldEvaluation {
  const items = field.items ?? [];

  // Belum ada item: baris Belum lengkap (3 = belum ada isian sumber sama sekali).
  if (items.length === 0) {
    return {
      state: "BELUM LENGKAP",
      components: [],
      deviating: { ptk: false, mak: false },
      reasons: [],
      incompleteSources: [...SOURCE_KEYS],
      incompleteCount: SOURCE_KEYS.length,
      hasMismatch: false,
      invalid: [],
      items: [],
    };
  }

  const titles = kontraItemTitles(items);
  const evaluated = items.map((item) => evaluateKontraItem(item, titles.get(item.id) ?? item.id));
  const components = evaluated.flatMap((e) =>
    e.fields.map((f) => ({
      ...f.evaluation,
      label: `${e.title} – ${f.label}`,
    })),
  );

  const incompleteCount = evaluated.reduce((sum, e) => sum + e.incompleteCount, 0);
  const incompleteSources = SOURCE_KEYS.filter((source) =>
    components.some((c) => c.incomplete.includes(source)),
  );
  const hasMismatch = evaluated.some((e) => e.hasMismatch);
  const state: MatchState = evaluated.some((e) => e.state === "BELUM LENGKAP")
    ? "BELUM LENGKAP"
    : hasMismatch
      ? "TIDAK SESUAI"
      : "SESUAI";

  return {
    state,
    components,
    deviating: {
      ptk: components.some((c) => c.deviating.ptk),
      mak: components.some((c) => c.deviating.mak),
    },
    reasons: evaluated.flatMap((e) => e.reasons.map((reason) => `${e.title} – ${reason}`)),
    incompleteSources,
    incompleteCount,
    hasMismatch,
    invalid: [],
    items: evaluated,
  };
}

/* --- Field per sumber ------------------------------------------------------- */

function evaluatePerSource(field: PerSourceCriticalField): FieldEvaluation {
  const evaluated = getComponentSpecs(field).map(evaluateComponent);

  // Aturan tingkat baris: satu nilai sumber yang kosong pada komponen mana pun
  // membuat seluruh baris BELUM LENGKAP, termasuk komponen lain yang sudah terisi.
  const incompleteSources = SOURCE_KEYS.filter((source) =>
    evaluated.some((c) => c.incomplete.includes(source)),
  );
  const settled = incompleteSources.length === 0;

  // Biaya: setiap komponen (Provisi, Administrasi, dan field tambahan) menampilkan hasilnya
  // sendiri; komponen yang lengkap tetap dinilai walau komponen lain belum terisi.
  const independent = field.key === "biaya";
  const components = settled || independent ? evaluated : evaluated.map(neutralize);

  const hasMismatch = components.some(isTidakSesuai);
  const state: MatchState = !settled ? "BELUM LENGKAP" : hasMismatch ? "TIDAK SESUAI" : "SESUAI";

  const multi = components.length > 1;
  const reasons = components.flatMap((c) =>
    c.reasons.map((reason) => (multi ? `${c.label}: ${reason}` : reason)),
  );

  return {
    state,
    components,
    deviating: {
      ptk: components.some((c) => c.deviating.ptk),
      mak: components.some((c) => c.deviating.mak),
    },
    reasons,
    incompleteSources,
    incompleteCount: incompleteSources.length,
    hasMismatch,
    invalid: dedupeInvalid(components),
  };
}

export function evaluateField(field: CriticalField): FieldEvaluation {
  switch (field.key) {
    case "underlying":
      return evaluateShared(field);
    case "kontraGaransi":
      return evaluateKontra(field);
    default:
      return evaluatePerSource(field);
  }
}

/** Jumlah "nilai" yang dihitung pada kelengkapan field (penyebut N): 3 sumber, 1 bersama, atau seluruh isian kontra. */
export function getFieldCellTotal(field: CriticalField): number {
  switch (field.key) {
    case "underlying":
      return 1;
    case "kontraGaransi": {
      const items = field.items ?? [];
      if (items.length === 0) return SOURCE_KEYS.length;
      return items.reduce(
        (sum, item) => sum + getKontraTypeDef(item.type).fields.length * SOURCE_KEYS.length,
        0,
      );
    }
    default:
      return SOURCE_KEYS.length;
  }
}

/* ------------------------------------------------------------------ */
/* Pembantu tingkat string (teks & dropdown)                            */
/* ------------------------------------------------------------------ */

export type StringKind = "text" | "select";

function stringSpec(kind: StringKind, u: string, p: string, m: string): ComponentSpec {
  return {
    id: "value",
    label: "Nilai",
    cells: {
      underlyingDocument: textCell(u, kind),
      ptk: textCell(p, kind),
      mak: textCell(m, kind),
    },
  };
}

/** State tampilan untuk isian teks/dropdown. */
export function getMatchState(kind: StringKind, u: string, p: string, m: string): MatchState {
  return evaluateComponent(stringSpec(kind, u, p, m)).state;
}

/**
 * Fungsi inti sesuai spesifikasi untuk teks/dropdown. Hanya mengembalikan
 * "SESUAI" bila ketiga sumber terisi dan sama; sumber kosong diperlakukan
 * sebagai TIDAK SESUAI (aman: kontrol tidak pernah memberi jaminan palsu).
 */
export function calculateThreeWayMatch(
  u: string,
  p: string,
  m: string,
  kind: StringKind = "text",
): MatchResult {
  return getMatchState(kind, u, p, m) === "SESUAI" ? "SESUAI" : "TIDAK SESUAI";
}

/** Sumber (Putusan/Memorandum) yang menyimpang dari Underlying Document untuk teks/dropdown. */
export function getDeviatingSources(
  kind: StringKind,
  u: string,
  p: string,
  m: string,
): { ptk: boolean; mak: boolean } {
  return evaluateComponent(stringSpec(kind, u, p, m)).deviating;
}

/* ------------------------------------------------------------------ */
/* Tingkat checklist                                                    */
/* ------------------------------------------------------------------ */

export function getFieldMatchState(field: CriticalField): MatchState {
  return evaluateField(field).state;
}

/** Hitung ulang matchStatus seluruh field (dipanggil setiap perubahan data). */
export function recalculateMatches(fields: CriticalField[]): CriticalField[] {
  return fields.map((field) => {
    const next = getFieldMatchState(field);
    return next === field.matchStatus ? field : { ...field, matchStatus: next };
  });
}

/**
 * Apakah ada hasil TIDAK SESUAI yang terlihat (pada baris, komponen Biaya, atau field
 * detail Kontra Garansi). Dipakai untuk peringatan global dan memblokir lanjut ke Opini ADK.
 */
export function hasMismatch(fields: CriticalField[]): boolean {
  return fields.some((field) => evaluateField(field).hasMismatch);
}

/** Jumlah baris critical field yang memuat hasil TIDAK SESUAI yang terlihat. */
export function countMismatchRows(fields: CriticalField[]): number {
  return fields.filter((field) => evaluateField(field).hasMismatch).length;
}

/** Jumlah isian (nilai sumber / isian detail) yang masih kosong atau tidak valid. */
export function countIncompleteCells(fields: CriticalField[]): number {
  return fields.reduce((sum, field) => sum + evaluateField(field).incompleteCount, 0);
}

/** Total isian yang dihitung pada kelengkapan (penyebut untuk `countIncompleteCells`). */
export function countTotalCells(fields: CriticalField[]): number {
  return fields.reduce((sum, field) => sum + getFieldCellTotal(field), 0);
}

export type ValidationSummary = {
  total: number;
  match: number;
  /** Jumlah field yang BENAR-BENAR TIDAK SESUAI (bukan sekadar belum lengkap). */
  mismatch: number;
  /** Jumlah baris berstatus Belum lengkap (dihitung terpisah dari mismatch dan sesuai). */
  incomplete: number;
  /** Jumlah field informasi bersama yang sudah terisi (tidak dibandingkan). */
  shared: number;
  mismatchLabels: string[];
  incompleteLabels: string[];
  /** Jumlah isian yang masih kosong/tidak valid, di semua field. */
  incompleteCells: number;
  /** Jumlah baris yang punya minimal satu isian kosong/tidak valid (sama dengan `incomplete`). */
  incompleteFieldCount: number;
  /** true bila tidak ada satu pun isian yang kosong/tidak valid. */
  allSourcesFilled: boolean;
  /**
   * Ringkasan khusus critical field yang DIBANDINGKAN (tanpa Underlying / Dasar Penerbitan, yang
   * merupakan informasi bersama dan bukan critical field tambahan). Dipakai untuk rasio
   * "Critical Field Sesuai 7/7" pada Summary & Output.
   */
  comparedTotal: number;
  comparedMatch: number;
  comparedIncomplete: number;
  /** Isian sumber kosong/tidak valid hanya pada field yang dibandingkan. */
  comparedIncompleteCells: number;
  /** Jumlah field informasi bersama (Underlying / Dasar Penerbitan); 1 pada checklist normal. */
  sharedTotal: number;
  /** true bila ada informasi bersama yang belum diisi. */
  sharedMissing: boolean;
};

export function summarizeValidation(fields: CriticalField[]): ValidationSummary {
  const summary: ValidationSummary = {
    total: fields.length,
    match: 0,
    mismatch: 0,
    incomplete: 0,
    shared: 0,
    mismatchLabels: [],
    incompleteLabels: [],
    incompleteCells: 0,
    incompleteFieldCount: 0,
    allSourcesFilled: true,
    comparedTotal: 0,
    comparedMatch: 0,
    comparedIncomplete: 0,
    comparedIncompleteCells: 0,
    sharedTotal: 0,
    sharedMissing: false,
  };
  for (const field of fields) {
    const evaluation = evaluateField(field);
    const state = evaluation.state;
    if (field.key === "underlying") {
      summary.sharedTotal += 1;
      if (state !== "BERSAMA") summary.sharedMissing = true;
    } else {
      summary.comparedTotal += 1;
      if (state === "SESUAI") summary.comparedMatch += 1;
      if (state === "BELUM LENGKAP") summary.comparedIncomplete += 1;
      summary.comparedIncompleteCells += evaluation.incompleteCount;
    }
    summary.incompleteCells += evaluation.incompleteCount;
    if (evaluation.incompleteCount > 0) summary.incompleteFieldCount += 1;
    // TIDAK SESUAI dihitung dari hasil yang benar-benar terlihat, termasuk komponen/item
    // yang sudah terisi dan berbeda di dalam baris yang masih belum lengkap. Angka ini
    // sama dengan yang dipakai untuk menahan lanjut ke Opini ADK.
    if (evaluation.hasMismatch) {
      summary.mismatch += 1;
      summary.mismatchLabels.push(field.fieldName);
    }
    if (state === "SESUAI") summary.match += 1;
    else if (state === "BERSAMA") summary.shared += 1;
    else if (state === "BELUM LENGKAP") {
      summary.incomplete += 1;
      summary.incompleteLabels.push(field.fieldName);
    }
  }
  summary.allSourcesFilled = summary.incompleteCells === 0;
  return summary;
}

/**
 * Seluruh critical field sesuai: tidak ada TIDAK SESUAI dan tidak ada yang belum lengkap.
 * Field informasi bersama (Underlying / Dasar Penerbitan) tidak dibandingkan, sehingga
 * tidak boleh dihitung sebagai "belum sesuai" hanya karena bukan berstatus SESUAI.
 */
export function isFullyMatched(summary: ValidationSummary): boolean {
  return summary.total > 0 && summary.mismatch === 0 && summary.incomplete === 0;
}
