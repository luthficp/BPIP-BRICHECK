"use client";

import * as React from "react";
import {
  Banknote,
  Building2,
  Car,
  ChevronRight,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { ResultCell } from "@/components/checklist/result-cell";
import { AmountInput } from "@/components/ui/amount-input";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { KONTRA_TYPES, SOURCES } from "@/lib/checklist/config";
import { compactMatchStateNote, matchStateLabel, type ComponentResultLine } from "@/lib/checklist/display";
import {
  countKontraByType,
  describeKontraCounts,
  getKontraAmount,
  getKontraText,
  kontraItemHasData,
  kontraItemTitles,
  summarizeKontraChange,
  totalKontraCount,
  type KontraChangeSummary,
  type KontraCounts,
} from "@/lib/checklist/kontra";
import type {
  AmountValue,
  KontraCriticalField,
  KontraItem,
  KontraType,
  SourceKey,
} from "@/lib/checklist/types";
import {
  evaluateField,
  type FieldEvaluation,
  type KontraFieldEvaluation,
  type KontraItemEvaluation,
} from "@/lib/validation/three-way-match";
import { cn } from "@/lib/utils";

/** Batas wajar jumlah item per jenis (menjaga tabel tetap terkendali). */
export const MAX_KONTRA_PER_TYPE = 10;

export type KontraValueChange = (
  fieldId: number,
  itemId: string,
  source: SourceKey,
  key: string,
  value: string | Partial<AmountValue>,
) => void;

const TYPE_ICONS: Record<KontraType, LucideIcon> = {
  fixedAsset: Building2,
  kendaraan: Car,
  cashCollateral: Banknote,
  asuransi: ShieldCheck,
};

/** Kelas sel tetap (kolom No dan Critical Field) agar sama dengan baris lain. */
const stickyNo = "sticky left-0 z-10";
const stickyField = "sticky left-12 z-10";

type KontraRowsProps = {
  rowNo: number;
  /** Data terbaru (untuk input). */
  field: KontraCriticalField;
  /** Data yang sudah "tenang" (ditunda sebentar) untuk menghitung tampilan status. */
  shown: KontraCriticalField;
  readOnly: boolean;
  /** true setelah ADK mencoba lanjut tetapi masih ada isian kosong. */
  showErrors: boolean;
  onApplyConfig: (fieldId: number, counts: KontraCounts) => void;
  onValueChange: KontraValueChange;
};

/**
 * Baris Kontra Garansi di dalam tabel Critical Field Validation:
 *   - baris utama (nomor 7): satu area menyatu berisi kartu pilihan + tombol aksi
 *     (membentang di bawah kolom sumber dan Hasil Validasi, tanpa garis pemisah);
 *     kolom Hasil Validasi tidak dipakai pada baris ini;
 *   - satu subbaris per item (7.1, 7.2, ...): detail pada tiga sumber berdampingan
 *     (layout 2 x 2) dan status validasi item pada kolom Hasil Validasi.
 * Item punya id tetap, sehingga data terjaga saat pilihan diubah.
 */
export function KontraRows({
  rowNo,
  field,
  shown,
  readOnly,
  showErrors,
  onApplyConfig,
  onValueChange,
}: KontraRowsProps) {
  const items = field.items;
  const hasItems = items.length > 0;

  // Evaluasi yang ditampilkan: data "tenang" bila strukturnya sama, selain itu data terbaru.
  const live = React.useMemo(() => evaluateField(field), [field]);
  const settled = React.useMemo(() => evaluateField(shown), [shown]);
  const sameStructure =
    shown.items.length === items.length && shown.items.every((item, i) => item.id === items[i]?.id);
  const evaluation: FieldEvaluation = sameStructure ? settled : live;
  const itemEvals = new Map<string, KontraItemEvaluation>(
    (evaluation.items ?? []).map((item) => [item.item.id, item]),
  );
  const titles = React.useMemo(() => kontraItemTitles(items), [items]);

  /* --- pilihan jenis & jumlah (mode awal / mode ubah) ------------------------ */
  const [editing, setEditing] = React.useState(false);
  const selecting = !readOnly && (!hasItems || editing);
  const [counts, setCounts] = React.useState<KontraCounts>(() => countKontraByType(items));
  const [confirm, setConfirm] = React.useState<{
    counts: KontraCounts;
    summary: KontraChangeSummary;
  } | null>(null);

  const current = countKontraByType(items);
  const total = totalKontraCount(counts);
  const changed = JSON.stringify(counts) !== JSON.stringify(current);

  // Di luar mode pilihan (termasuk setelah dimuat ulang / Done), panel selalu mengikuti daftar item.
  React.useEffect(() => {
    if (!selecting) setCounts(countKontraByType(items));
  }, [items, selecting]);

  const startEditing = () => {
    setCounts(current);
    setEditing(true);
  };
  const cancelEditing = () => {
    setCounts(current);
    setConfirm(null);
    setEditing(false);
  };
  const applyCounts = (next: KontraCounts) => {
    onApplyConfig(field.id, next);
    setConfirm(null);
    setEditing(false);
  };
  const submit = () => {
    if (total < 1) return;
    // Setiap penghapusan item (terisi maupun kosong) meminta konfirmasi lebih dulu.
    const summary = summarizeKontraChange(items, counts);
    if (summary.removedTotal > 0) {
      setConfirm({ counts, summary });
      return;
    }
    applyCounts(counts);
  };
  const bump = (type: KontraType, delta: number) =>
    setCounts((prev) => ({
      ...prev,
      [type]: Math.min(MAX_KONTRA_PER_TYPE, Math.max(0, prev[type] + delta)),
    }));

  /* --- buka / tutup detail item ------------------------------------------- */
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries((live.items ?? []).map((item) => [item.item.id, item.state !== "SESUAI"])),
  );
  // Item yang baru muncul (hasil pilihan) langsung terbuka agar dapat diisi dan diberi tanda "Baru".
  const knownIds = React.useRef(new Set(items.map((item) => item.id)));
  const [freshIds, setFreshIds] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    const added = items.filter((item) => !knownIds.current.has(item.id));
    if (added.length > 0) {
      setOpen((prev) => ({ ...prev, ...Object.fromEntries(added.map((item) => [item.id, true])) }));
      setFreshIds((prev) => new Set([...prev, ...added.map((item) => item.id)]));
    }
    knownIds.current = new Set(items.map((item) => item.id));
  }, [items]);

  const legacyEntries = SOURCES.flatMap((source) => {
    const text = field.legacy?.[source.key];
    return text ? [`${source.label}: "${text}"`] : [];
  });

  return (
    <>
      {/* Baris utama: pemilihan jenis & jumlah + tombol aksi dalam satu area menyatu */}
      <TableRow className="align-top">
        <TableCell className={cn(stickyNo, "bg-card tabular-nums text-muted-foreground")}>{rowNo}</TableCell>
        <TableCell className={cn(stickyField, "bg-card font-medium")}>{field.fieldName}</TableCell>
        <TableCell colSpan={SOURCES.length + 1}>
          <div className="space-y-2">
            {selecting ? (
              <div
                data-kontra-mode={hasItems ? "edit" : "initial"}
                className={cn(
                  "rounded-lg border p-3 transition-colors motion-reduce:transition-none",
                  hasItems ? "border-primary bg-primary-soft/50 ring-1 ring-primary/20" : "border-dashed bg-card",
                )}
              >
                {hasItems && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="default">
                      <Pencil aria-hidden="true" />
                      Mode ubah pilihan
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Tambah, kurangi, atau ganti jenis. Data tersimpan sampai Anda menekan Terapkan
                      Perubahan; detail item dikunci sementara.
                    </p>
                  </div>
                )}

                <ul
                  className="grid grid-cols-1 gap-2 md:grid-cols-2"
                  aria-label="Jenis kontra garansi"
                  data-kontra-grid
                >
                  {KONTRA_TYPES.map((def) => (
                    <TypeCard
                      key={def.key}
                      type={def.key}
                      label={def.label}
                      count={counts[def.key]}
                      onChange={(delta) => bump(def.key, delta)}
                    />
                  ))}
                </ul>

                {/* Ringkasan + tombol aksi: satu area dengan kartu (tanpa pemisah vertikal) */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground" aria-live="polite">
                    {total < 1
                      ? "Jumlah awal setiap jenis adalah 0. Pilih minimal satu item."
                      : `${total} item dipilih: ${describeKontraCounts(counts)}.`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {hasItems && (
                      <Button type="button" variant="outline" size="sm" onClick={cancelEditing}>
                        Batal
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={total < 1 || (hasItems && !changed)}
                      onClick={submit}
                    >
                      {hasItems ? "Terapkan Perubahan" : "Terapkan Detail Kontra Garansi"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : hasItems ? (
              <div
                data-kontra-mode="view"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2" aria-label="Pilihan Kontra Garansi yang diterapkan">
                  {KONTRA_TYPES.filter((def) => current[def.key] > 0).map((def) => {
                    const Icon = TYPE_ICONS[def.key];
                    return (
                      <Badge key={def.key} variant="info" className="gap-1.5 px-2.5 py-1">
                        <Icon aria-hidden="true" />
                        {def.label} × {current[def.key]}
                      </Badge>
                    );
                  })}
                  <span className="text-xs font-medium text-muted-foreground">
                    {items.length} item · pilihan diterapkan
                  </span>
                </div>
                {!readOnly && (
                  <Button type="button" variant="outline" size="sm" onClick={startEditing}>
                    <Pencil />
                    Ubah Pilihan
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada item Kontra Garansi.</p>
            )}

            {legacyEntries.length > 0 && (
              <p className="text-[11px] font-medium text-warning">
                Isian lama (sebelum pembaruan): {legacyEntries.join("; ")}. Isi ulang pada item di
                bawah.
              </p>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Subbaris item: 7.1, 7.2, ... */}
      {items.map((item, itemIndex) => {
        const itemEval = itemEvals.get(item.id);
        if (!itemEval) return null;
        return (
          <KontraItemRow
            key={item.id}
            fieldId={field.id}
            item={item}
            itemNo={`${rowNo}.${itemIndex + 1}`}
            evaluation={itemEval}
            expanded={open[item.id] ?? false}
            isNew={freshIds.has(item.id) && !kontraItemHasData(item)}
            locked={selecting}
            readOnly={readOnly}
            showErrors={showErrors}
            onToggle={() => setOpen((prev) => ({ ...prev, [item.id]: !(prev[item.id] ?? false) }))}
            onValueChange={onValueChange}
          />
        );
      })}

      {/* Konfirmasi: berlaku setiap kali item akan dihapus (terisi maupun kosong) */}
      <Dialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Terapkan perubahan Kontra Garansi?</DialogTitle>
            <DialogDescription>
              Perubahan ini akan menghapus {confirm?.summary.removedTotal ?? 0} item berikut beserta
              isiannya:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <ul className="space-y-1.5">
              {confirm?.summary.removed.map((group) => (
                <li key={group.type} className="rounded-md border bg-muted/40 px-3 py-2">
                  <span className="font-semibold text-foreground">
                    {group.label} × {group.count}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {group.titles.join(", ")} ·{" "}
                    {group.withData > 0
                      ? `${group.withData} sudah berisi data`
                      : "masih kosong"}
                  </span>
                </li>
              ))}
            </ul>
            {confirm && confirm.summary.added.length > 0 && (
              <p className="text-muted-foreground">
                Item baru (input kosong):{" "}
                {confirm.summary.added.map((added) => `${added.label} × ${added.count}`).join(", ")}.
              </p>
            )}
            <p className="text-muted-foreground">
              Item lain tidak terpengaruh dan tetap menyimpan datanya.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => confirm && applyCounts(confirm.counts)}>
              <Trash2 />
              Ya, Terapkan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Kartu pilihan jenis: ikon, nama, kontrol jumlah (+/−)                */
/* ------------------------------------------------------------------ */

function TypeCard({
  type,
  label,
  count,
  onChange,
}: {
  type: KontraType;
  label: string;
  count: number;
  onChange: (delta: number) => void;
}) {
  const Icon = TYPE_ICONS[type];
  const selected = count > 0;

  return (
    <li
      data-kontra-type={type}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "flex min-h-[4.25rem] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors motion-reduce:transition-none",
        selected ? "border-primary/50 bg-primary-soft" : "border-primary/20 bg-card",
      )}
    >
      {/* Ikon selalu biru (warna utama BRICHECK); status terpilih dibedakan lewat latar kartu */}
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-primary",
          selected ? "bg-card ring-1 ring-primary/30" : "bg-primary-soft",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-xs leading-tight",
            selected ? "font-medium text-primary" : "text-muted-foreground",
          )}
        >
          {selected ? `${count} item dipilih` : "Belum dipilih"}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={count <= 0}
          onClick={() => onChange(-1)}
          aria-label={`Kurangi ${label}`}
        >
          <Minus />
        </Button>
        <output
          className="w-6 text-center text-sm font-semibold tabular-nums"
          aria-label={`Jumlah ${label}`}
        >
          {count}
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={count >= MAX_KONTRA_PER_TYPE}
          onClick={() => onChange(1)}
          aria-label={`Tambah ${label}`}
        >
          <Plus />
        </Button>
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Satu item = satu subbaris (7.n)                                      */
/* ------------------------------------------------------------------ */

type KontraItemRowProps = {
  fieldId: number;
  item: KontraItem;
  itemNo: string;
  evaluation: KontraItemEvaluation;
  expanded: boolean;
  /** Item baru (kosong) hasil perubahan pilihan. */
  isNew: boolean;
  /** Mode pilihan terbuka: detail dikunci supaya "Batal" memulihkan keadaan semula. */
  locked: boolean;
  readOnly: boolean;
  showErrors: boolean;
  onToggle: () => void;
  onValueChange: KontraValueChange;
};

/**
 * Hasil per informasi (field) untuk kolom Hasil Validasi item: nama + status singkat. Jumlah
 * field belum terisi tidak diulang di sini (tampil sekali pada status keseluruhan item); alasan
 * perbedaan tetap disertakan untuk informasi yang TIDAK SESUAI.
 */
function fieldResultLines(evaluation: KontraItemEvaluation): ComponentResultLine[] {
  return evaluation.fields.map((f) => ({
    id: f.key,
    label: f.label,
    state: f.evaluation.state,
    stateLabel: matchStateLabel(f.evaluation.state),
    note: f.evaluation.state === "TIDAK SESUAI" ? f.evaluation.reasons.join("; ") : null,
  }));
}

function KontraItemRow({
  fieldId,
  item,
  itemNo,
  evaluation,
  expanded,
  isNew,
  locked,
  readOnly,
  showErrors,
  onToggle,
  onValueChange,
}: KontraItemRowProps) {
  const Icon = TYPE_ICONS[item.type];
  const total = evaluation.fields.length;
  const mismatch = evaluation.hasMismatch;
  const rowId = `kontra-item-${item.id}`;

  return (
    <TableRow
      id={rowId}
      data-kontra-item={item.id}
      data-state={evaluation.state}
      className={cn(
        "align-top motion-safe:animate-in motion-safe:fade-in-0",
        mismatch ? "bg-danger-soft/40" : "bg-primary-soft/30",
      )}
    >
      <TableCell
        className={cn(
          stickyNo,
          "tabular-nums text-muted-foreground",
          mismatch ? "border-l-4 border-l-danger bg-danger-soft" : "bg-primary-soft",
        )}
      >
        {itemNo}
      </TableCell>
      <TableCell className={cn(stickyField, mismatch ? "bg-danger-soft" : "bg-primary-soft")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-start gap-1.5 rounded-sm text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              {evaluation.title}
            </span>
            <span className="sr-only">{expanded ? ", tutup detail" : ", buka detail"}</span>
          </span>
        </button>
        {isNew && (
          <Badge variant="info" className="mt-1.5 ml-5.5">
            Baru
          </Badge>
        )}
      </TableCell>

      {SOURCES.map((source) => {
        const panelTitle = source.note ? `${source.label} (${source.note})` : source.label;
        return (
          <TableCell key={source.key} className="px-1.5">
            {expanded ? (
              // Panel sumber: header biru muda yang jelas + isian 2 kolom. Ketiga panel selalu
              // berukuran sama (kolom tabel sama lebar; header memakai tinggi minimum yang sama).
              <div
                role="group"
                aria-label={`${evaluation.title} - ${panelTitle}`}
                data-kontra-panel={source.key}
                className="overflow-hidden rounded-md border bg-card"
              >
                <p
                  data-kontra-panel-header
                  className="flex min-h-10 items-center bg-primary-soft px-2 py-1 text-xs font-semibold leading-tight text-primary"
                >
                  {panelTitle}
                </p>
                <div
                  className="grid grid-cols-2 items-start gap-x-1.5 gap-y-2 p-1.5"
                  data-kontra-grid
                >
                  {evaluation.fields.map((detail, index) => (
                    <KontraFieldInput
                      key={detail.key}
                      fieldId={fieldId}
                      item={item}
                      title={evaluation.title}
                      detail={detail}
                      source={source.key}
                      sourceLabel={source.label}
                      // Jumlah field ganjil: field terakhir membentang penuh (mis. Pengikatan pada Cash Collateral).
                      wide={total % 2 === 1 && index === total - 1}
                      disabled={readOnly || locked}
                      showErrors={showErrors}
                      onValueChange={onValueChange}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs tabular-nums text-muted-foreground">
                <strong
                  className={cn(
                    "font-semibold",
                    evaluation.filledBySource[source.key] === total ? "text-success" : "text-foreground",
                  )}
                >
                  {evaluation.filledBySource[source.key]}/{total}
                </strong>{" "}
                field terisi
              </p>
            )}
          </TableCell>
        );
      })}

      <TableCell>
        <ResultCell
          state={evaluation.state}
          note={compactMatchStateNote(evaluation)}
          components={expanded ? fieldResultLines(evaluation) : null}
        />
        {evaluation.state !== "TIDAK SESUAI" && mismatch && (
          <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-danger">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Ada informasi yang TIDAK SESUAI
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

function KontraFieldInput({
  fieldId,
  item,
  title,
  detail,
  source,
  sourceLabel,
  wide,
  disabled,
  showErrors,
  onValueChange,
}: {
  fieldId: number;
  item: KontraItem;
  title: string;
  detail: KontraFieldEvaluation;
  source: SourceKey;
  sourceLabel: string;
  wide: boolean;
  disabled: boolean;
  showErrors: boolean;
  onValueChange: KontraValueChange;
}) {
  const missing = showErrors && detail.evaluation.incomplete.includes(source);
  const deviates = source !== "underlyingDocument" && detail.evaluation.deviating[source] === true;
  const label = `${title} - ${detail.label} - ${sourceLabel}`;
  const values = item.values?.[source];

  return (
    <div className={cn("min-w-0 space-y-1", wide && "col-span-2")}>
      <span className="block text-xs text-muted-foreground">{detail.label}</span>
      {detail.kind === "currency" ? (
        <AmountInput
          stacked
          value={getKontraAmount(values, detail.key)}
          onChange={(patch) => onValueChange(fieldId, item.id, source, detail.key, patch)}
          label={label}
          disabled={disabled}
          invalid={deviates || missing}
        />
      ) : (
        <AutoTextarea
          value={getKontraText(values, detail.key)}
          onChange={(e) => onValueChange(fieldId, item.id, source, detail.key, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder={detail.label}
          aria-label={label}
          aria-invalid={deviates || missing ? true : undefined}
          readOnly={disabled}
          disabled={disabled}
        />
      )}
      {missing && <p className="text-xs font-medium text-danger">Wajib diisi</p>}
    </div>
  );
}
