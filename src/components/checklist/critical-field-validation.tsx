"use client";

import * as React from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";

import { KontraRows, type KontraValueChange } from "@/components/checklist/kontra-garansi";
import { ResultCell } from "@/components/checklist/result-cell";
import { ValidationNotes } from "@/components/checklist/validation-notes";
import { ValidationSummaryBanner } from "@/components/checklist/validation-summary";
import { AmountInput, FeeInput } from "@/components/ui/amount-input";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { countEmptyCells } from "@/lib/checklist/completion";
import {
  LABEL_RESULT,
  SOURCES,
  getFieldDef,
  type CriticalFieldDef,
} from "@/lib/checklist/config";
import { compactMatchStateNote, getComponentResults, matchStateNote } from "@/lib/checklist/display";
import {
  MAX_FEE_NAME_LENGTH,
  feeComponentHasData,
  getFeeComponents,
  validateFeeName,
} from "@/lib/checklist/fees";
import type { KontraCounts } from "@/lib/checklist/kontra";
import { getPksInfo } from "@/lib/checklist/pks";
import type {
  AmountValue,
  CriticalField,
  DocumentVerification,
  FeeComponentDef,
  FeeValue,
  FeesCriticalField,
  KontraCriticalField,
  PerSourceCriticalField,
  PeriodValue,
  SharedCriticalField,
  SourceKey,
} from "@/lib/checklist/types";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { getPeriodStatus } from "@/lib/validation/period";
import {
  countTotalCells,
  evaluateField,
  isFilled,
  summarizeValidation,
  type FieldEvaluation,
} from "@/lib/validation/three-way-match";
import { cn } from "@/lib/utils";

type CriticalFieldValidationProps = {
  fields: CriticalField[];
  /** Document Verification; sumber info PKS (Identitas Beneficiary > Perjanjian Kerja Sama). */
  documents: DocumentVerification[];
  readOnly: boolean;
  /** true setelah ADK mencoba lanjut tetapi masih ada isian kosong/tidak valid. */
  showErrors: boolean;
  /** Teks & dropdown. */
  onValueChange: (fieldId: number, source: SourceKey, value: string) => void;
  onAmountChange: (fieldId: number, source: SourceKey, patch: Partial<AmountValue>) => void;
  onPeriodChange: (fieldId: number, source: SourceKey, patch: Partial<PeriodValue>) => void;
  onFeeChange: (fieldId: number, source: SourceKey, patch: Partial<FeeValue>) => void;
  /** Biaya: tambah field bernama bebas pada ketiga sumber sekaligus (nama sudah divalidasi). */
  onFeeAdd: (fieldId: number, name: string) => void;
  /** Biaya: hapus field tambahan dari ketiga sumber sekaligus. */
  onFeeRemove: (fieldId: number, componentId: string) => void;
  /** Underlying / Dasar Penerbitan: satu nilai bersama. */
  onSharedChange: (fieldId: number, value: string) => void;
  /** Kontra Garansi: jenis dan jumlah item. */
  onKontraConfig: (fieldId: number, counts: KontraCounts) => void;
  /** Kontra Garansi: satu field detail pada satu sumber. */
  onKontraValue: KontraValueChange;
};

export function CriticalFieldValidation({
  fields,
  documents,
  readOnly,
  showErrors,
  onValueChange,
  onAmountChange,
  onPeriodChange,
  onFeeChange,
  onFeeAdd,
  onFeeRemove,
  onSharedChange,
  onKontraConfig,
  onKontraValue,
}: CriticalFieldValidationProps) {
  // Tampilan validasi sedikit ditunda supaya tidak berkedip merah-hijau saat mengetik.
  // Nilai input tetap memakai `fields` (real-time); gating & penyimpanan tidak terpengaruh.
  const settled = useDebouncedValue(fields, 300);
  const settledById = React.useMemo(() => new Map(settled.map((f) => [f.id, f])), [settled]);

  const summary = React.useMemo(() => summarizeValidation(settled), [settled]);
  const emptyCells = React.useMemo(() => countEmptyCells(settled), [settled]);

  // Info PKS dibaca langsung dari Document Verification (tanpa diketik ulang) dan hanya informatif.
  const pksInfo = React.useMemo(() => getPksInfo(documents), [documents]);

  // Tambah / hapus field Biaya: dialog ada di luar tabel, dipakai bersama oleh baris Biaya.
  const [addTarget, setAddTarget] = React.useState<number | null>(null);
  const [removal, setRemoval] = React.useState<{
    fieldId: number;
    component: FeeComponentDef;
  } | null>(null);
  const addField = fields.find((f): f is FeesCriticalField => f.id === addTarget && f.key === "biaya");

  const requestFeeRemoval = (field: FeesCriticalField, component: FeeComponentDef) => {
    if (feeComponentHasData(field, component.id)) setRemoval({ fieldId: field.id, component });
    else onFeeRemove(field.id, component.id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">2. Critical Field Validation</CardTitle>
        <CardDescription>
          Masukkan informasi sebagaimana tertulis pada setiap sumber.{" "}
          <strong className="font-semibold text-foreground">Underlying Document</strong> adalah
          dokumen acuan utama. {LABEL_RESULT} dihitung otomatis; tidak perlu diketik.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ValidationSummaryBanner
          summary={summary}
          emptyCells={emptyCells}
          totalCells={countTotalCells(fields)}
          blocking={!readOnly}
        />

        <div className="rounded-md border">
          <Table className="min-w-[66rem] table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 w-12 bg-table-header">No</TableHead>
                <TableHead className="sticky left-12 z-10 w-32 bg-table-header">
                  Critical Field
                </TableHead>
                {SOURCES.map((source) => (
                  <TableHead key={source.key} className="w-60 whitespace-normal py-2 leading-tight">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span>{source.label}</span>
                      {source.note && <Badge variant="info">{source.note}</Badge>}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="w-40 whitespace-normal py-2 leading-tight">
                  {LABEL_RESULT}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const shown = settledById.get(field.id) ?? field;

                if (field.key === "kontraGaransi") {
                  return (
                    <KontraRows
                      key={field.id}
                      rowNo={index + 1}
                      field={field}
                      shown={shown as KontraCriticalField}
                      readOnly={readOnly}
                      showErrors={showErrors}
                      onApplyConfig={onKontraConfig}
                      onValueChange={onKontraValue}
                    />
                  );
                }

                const evaluation = evaluateField(shown);
                const mismatch = evaluation.state === "TIDAK SESUAI";
                const rowClass = cn("align-top", mismatch && "bg-danger-soft/40");
                const noClass = cn(
                  "sticky left-0 z-10 tabular-nums text-muted-foreground",
                  mismatch ? "border-l-4 border-l-danger bg-danger-soft" : "bg-card",
                );
                const nameClass = cn(
                  "sticky left-12 z-10 font-medium",
                  mismatch ? "bg-danger-soft" : "bg-card",
                );

                if (field.key === "underlying") {
                  // Satu area free-text lebar yang membentang di bawah kolom Underlying Document,
                  // Memorandum, Putusan, dan Hasil Validasi (tanpa kotak "Informasi bersama").
                  return (
                    <TableRow key={field.id} className="align-top">
                      <TableCell className="sticky left-0 z-10 bg-card tabular-nums text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="sticky left-12 z-10 bg-card font-medium">
                        {field.fieldName}
                      </TableCell>
                      <TableCell colSpan={SOURCES.length + 1}>
                        <SharedCell
                          field={field}
                          readOnly={readOnly}
                          missing={showErrors && !isFilled(field.value ?? "")}
                          onChange={(value) => onSharedChange(field.id, value)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }

                const live = evaluateField(field);
                return (
                  <TableRow key={field.id} className={rowClass}>
                    <TableCell className={noClass}>{index + 1}</TableCell>
                    <TableCell className={nameClass}>
                      <div className="flex flex-col items-start gap-2">
                        <span>{field.fieldName}</span>
                        {field.key === "biaya" && !readOnly && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-full justify-center gap-1 border-dashed border-primary/50 bg-primary-soft px-1.5 text-xs font-semibold text-primary shadow-none hover:border-primary hover:bg-primary hover:text-primary-foreground [&_svg]:size-3.5"
                            onClick={() => setAddTarget(field.id)}
                            aria-label="Tambah field biaya"
                            title="Tambah field biaya (dibuat serentak pada ketiga sumber)"
                            data-fee-add
                          >
                            <Plus aria-hidden="true" strokeWidth={2.5} />
                            Tambah Field
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    {SOURCES.map((source) => (
                      <TableCell key={source.key}>
                        <SourceCell
                          field={field}
                          source={source.key}
                          sourceLabel={source.label}
                          evaluation={evaluation}
                          missing={showErrors && live.incompleteSources.includes(source.key)}
                          readOnly={readOnly}
                          onValueChange={onValueChange}
                          onAmountChange={onAmountChange}
                          onPeriodChange={onPeriodChange}
                          onFeeChange={onFeeChange}
                          onRequestFeeRemoval={(component) =>
                            field.key === "biaya" && requestFeeRemoval(field, component)
                          }
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <ResultCell
                        state={evaluation.state}
                        note={
                          field.key === "biaya"
                            ? compactMatchStateNote(evaluation)
                            : matchStateNote(evaluation)
                        }
                        reasons={evaluation.reasons}
                        components={
                          field.key === "biaya" ? getComponentResults(evaluation.components) : null
                        }
                        info={field.key === "biaya" ? pksInfo : null}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <ValidationNotes />
      </CardContent>

      <AddFeeDialog
        field={addField ?? null}
        onClose={() => setAddTarget(null)}
        onSubmit={(name) => {
          if (addField) onFeeAdd(addField.id, name);
          setAddTarget(null);
        }}
      />

      <Dialog open={removal !== null} onOpenChange={(open) => !open && setRemoval(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus field biaya ini?</DialogTitle>
            <DialogDescription>
              Field &ldquo;{removal?.component.label}&rdquo; sudah berisi nilai. Field akan dihapus
              dari ketiga sumber sekaligus ({SOURCES.map((source) => source.label).join(", ")})
              beserta seluruh isiannya.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoval(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removal) onFeeRemove(removal.fieldId, removal.component.id);
                setRemoval(null);
              }}
            >
              <Trash2 />
              Ya, hapus dari ketiga sumber
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog tambah field biaya                                            */
/* ------------------------------------------------------------------ */

function AddFeeDialog({
  field,
  onClose,
  onSubmit,
}: {
  field: FeesCriticalField | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const open = field !== null;

  // Setiap kali dialog dibuka, mulai dari isian kosong.
  React.useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!field) return;
    const message = validateFeeName(name, getFeeComponents(field));
    if (message) {
      setError(message);
      return;
    }
    onSubmit(name);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Tambah field biaya</DialogTitle>
            <DialogDescription>
              Field baru dibuat serentak pada {SOURCES.map((source) => source.label).join(", ")}{" "}
              dan ikut dibandingkan seperti Provisi dan Administrasi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="fee-name-input" className="text-sm font-medium">
              Nama field biaya
            </label>
            <Input
              id="fee-name-input"
              value={name}
              autoFocus
              maxLength={MAX_FEE_NAME_LENGTH + 20}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Mis. Asuransi Kredit"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "fee-name-error" : undefined}
            />
            {error && (
              <p
                id="fee-name-error"
                className="flex items-center gap-1 text-xs font-medium text-danger"
              >
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit">
              <Plus />
              Tambah
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Underlying / Dasar Penerbitan: satu field bersama                    */
/* ------------------------------------------------------------------ */

function SharedCell({
  field,
  readOnly,
  missing,
  onChange,
}: {
  field: SharedCriticalField;
  readOnly: boolean;
  missing: boolean;
  onChange: (value: string) => void;
}) {
  const def = getFieldDef(field.key);
  return (
    <div>
      <AutoTextarea
        value={field.value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        aria-label={`${def.label} (satu isian bersama untuk seluruh sumber)`}
        aria-invalid={missing ? true : undefined}
        readOnly={readOnly}
        disabled={readOnly}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Satu isian untuk seluruh sumber; tidak dibandingkan. Tekan Enter untuk baris baru.
      </p>
      {missing && <p className="mt-1 text-xs font-medium text-danger">Wajib diisi</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sel isian per sumber                                                 */
/* ------------------------------------------------------------------ */

type SourceCellProps = {
  field: PerSourceCriticalField;
  source: SourceKey;
  sourceLabel: string;
  evaluation: FieldEvaluation;
  /** true bila ADK sudah mencoba lanjut dan sel ini masih kosong/tidak valid. */
  missing: boolean;
  readOnly: boolean;
  /** Biaya: minta hapus field tambahan (berlaku untuk ketiga sumber sekaligus). */
  onRequestFeeRemoval: (component: FeeComponentDef) => void;
} & Pick<
  CriticalFieldValidationProps,
  "onValueChange" | "onAmountChange" | "onPeriodChange" | "onFeeChange"
>;

function SourceCell({
  field,
  source,
  sourceLabel,
  evaluation,
  missing,
  readOnly,
  onValueChange,
  onAmountChange,
  onPeriodChange,
  onFeeChange,
  onRequestFeeRemoval,
}: SourceCellProps) {
  const def = getFieldDef(field.key);
  const label = `${def.label} - ${sourceLabel}`;
  const deviates = (componentId?: string): boolean => {
    if (source === "underlyingDocument") return false;
    if (componentId) {
      return evaluation.components.find((c) => c.id === componentId)?.deviating[source] === true;
    }
    return evaluation.deviating[source];
  };

  const legacy = field.legacy?.[source];
  const showLegacy = Boolean(legacy) && evaluation.incompleteSources.includes(source);

  let body: React.ReactNode;

  switch (field.key) {
    case "nilaiBg":
      body = (
        <AmountInput
          value={field[source]}
          onChange={(patch) => onAmountChange(field.id, source, patch)}
          label={label}
          disabled={readOnly}
          invalid={deviates() || (missing && field[source].amount.trim() === "")}
        />
      );
      break;

    case "jangkaWaktu": {
      const value = field[source];
      const status = getPeriodStatus(value);
      const message = status.endMessage ?? status.startMessage;
      body = (
        <div className="space-y-1.5">
          <LabeledRow label="Mulai">
            <DateInput
              value={value.start}
              onChange={(start) => onPeriodChange(field.id, source, { start })}
              label={`${label}: tanggal mulai`}
              disabled={readOnly}
              invalid={deviates("start") || (missing && !status.startValid)}
            />
          </LabeledRow>
          <LabeledRow label="Akhir">
            <DateInput
              value={value.end}
              onChange={(end) => onPeriodChange(field.id, source, { end })}
              label={`${label}: tanggal akhir`}
              disabled={readOnly}
              invalid={deviates("end") || (missing && !status.endValid) || Boolean(message)}
            />
          </LabeledRow>
          <p className="text-xs tabular-nums" aria-live="polite">
            <span className="text-muted-foreground">Durasi: </span>
            {status.state === "valid" ? (
              <strong className="font-semibold">{status.days} hari</strong>
            ) : (
              <span className="text-muted-foreground">belum tersedia</span>
            )}
          </p>
          {message && <p className="text-[11px] font-medium text-danger">{message}</p>}
        </div>
      );
      break;
    }

    case "biaya": {
      // Daftar vertikal; komponen (Provisi, Administrasi, lalu tambahan ADK) identik pada ketiga
      // sumber. Tombol hapus pada field tambahan menghapus field dari ketiga sumber sekaligus.
      const value = field[source];
      body = (
        <div className="space-y-2" data-fee-list>
          {getFeeComponents(field).map((component) => (
            <div key={component.id} className="min-w-0 space-y-1" data-fee-component={component.id}>
              <div className="flex items-start justify-between gap-1">
                <span className="min-w-0 break-words text-xs text-muted-foreground">
                  {component.label}
                </span>
                {component.custom && !readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mt-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-danger"
                    onClick={() => onRequestFeeRemoval(component)}
                    aria-label={`Hapus field biaya ${component.label} dari ketiga sumber`}
                    title="Hapus dari ketiga sumber"
                    data-fee-remove={component.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <FeeInput
                value={value[component.id] ?? ""}
                onChange={(next) => onFeeChange(field.id, source, { [component.id]: next })}
                label={`${label}: ${component.label}`}
                placeholder="Nominal / %"
                disabled={readOnly}
                invalid={
                  deviates(component.id) ||
                  (missing && (value[component.id] ?? "").trim() === "")
                }
              />
            </div>
          ))}
        </div>
      );
      break;
    }

    default:
      body = (
        <TextOrSelectInput
          def={def}
          label={label}
          value={field[source]}
          readOnly={readOnly}
          invalid={deviates() || (missing && field[source].trim() === "")}
          onChange={(next) => onValueChange(field.id, source, next)}
        />
      );
  }

  return (
    <div>
      {body}
      {showLegacy && (
        <p className="mt-1 text-[11px] font-medium text-warning">
          Isian lama: &ldquo;{legacy}&rdquo;. Isi ulang pada kolom di atas.
        </p>
      )}
      {missing && !showLegacy && (
        <p className="mt-1 text-xs font-medium text-danger">Wajib diisi</p>
      )}
    </div>
  );
}

function LabeledRow({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span
        className={cn(
          "shrink-0 pt-2 text-xs text-muted-foreground",
          wide ? "w-[4.75rem]" : "w-10",
        )}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function TextOrSelectInput({
  def,
  label,
  value,
  readOnly,
  invalid,
  onChange,
}: {
  def: CriticalFieldDef;
  label: string;
  value: string;
  readOnly: boolean;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  if (def.kind === "select") {
    return (
      <Select value={value} onValueChange={onChange} disabled={readOnly}>
        <SelectTrigger aria-label={label} aria-invalid={invalid ? true : undefined}>
          <SelectValue placeholder={def.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(def.options ?? []).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <AutoTextarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Field satu baris: Enter tidak menyisipkan baris baru.
        if (!def.multiline && e.key === "Enter") e.preventDefault();
      }}
      placeholder={def.placeholder}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      readOnly={readOnly}
      disabled={readOnly}
    />
  );
}
