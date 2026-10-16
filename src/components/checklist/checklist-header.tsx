"use client";

import { CheckCircle2, Loader2, Lock, PencilLine, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { LABEL_ADK_NAME } from "@/lib/checklist/config";
import type { HeaderPatch } from "@/lib/checklist/mutations";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { formatTimestamp } from "@/lib/export/format";
import type { SaveState } from "@/lib/hooks/use-checklist-editor";
import { isFilled } from "@/lib/validation/three-way-match";
import { cn } from "@/lib/utils";

type ChecklistHeaderProps = {
  checklist: BankGuaranteeChecklist;
  saveState: SaveState;
  completion: { done: number; total: number; percent: number };
  readOnly: boolean;
  showErrors: boolean;
  onHeaderChange: (patch: HeaderPatch) => void;
  onTaskNameChange: (value: string) => void;
};

export function ChecklistHeader({
  checklist,
  saveState,
  completion,
  readOnly,
  showErrors,
  onHeaderChange,
  onTaskNameChange,
}: ChecklistHeaderProps) {
  const requiredField = (
    id: string,
    label: string,
    value: string,
    placeholder: string,
    onChange: (next: string) => void,
  ) => {
    const invalid = showErrors && !isFilled(value);
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>
          {label}
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          disabled={readOnly}
          aria-required="true"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
        {invalid && (
          <p id={`${id}-error`} className="text-xs font-medium text-danger">
            {label} wajib diisi.
          </p>
        )}
      </div>
    );
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight sm:text-xl">
          {checklist.taskName}
        </h1>

        <SaveIndicator state={saveState} readOnly={readOnly} />

        {checklist.status === "Done" ? (
          <Badge variant="info">
            <CheckCircle2 aria-hidden="true" />
            Done
          </Badge>
        ) : (
          <Badge variant="muted">
            <PencilLine aria-hidden="true" />
            Draft
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Progress
          value={completion.percent}
          aria-label="Kelengkapan checklist"
          className="h-1.5 flex-1"
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {completion.percent}% lengkap ({completion.done}/{completion.total})
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="task-name">Nama Task</Label>
          <Input
            id="task-name"
            value={checklist.taskName}
            onChange={(e) => onTaskNameChange(e.target.value)}
            readOnly={readOnly}
            disabled={readOnly}
          />
        </div>
        {requiredField("atas-nama", "Atas Nama", checklist.atasNama, "Nama nasabah / debitur", (v) =>
          onHeaderChange({ atasNama: v }),
        )}
        {requiredField("cif", "CIF", checklist.cif, "Nomor CIF", (v) => onHeaderChange({ cif: v }))}
        {requiredField(
          "jenis-pengajuan",
          "Jenis Pengajuan",
          checklist.jenisPengajuan,
          "Jenis pengajuan",
          (v) => onHeaderChange({ jenisPengajuan: v }),
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="adk-name-readonly">{LABEL_ADK_NAME} (Risk Owner)</Label>
          <div className="relative">
            <Input
              id="adk-name-readonly"
              value={checklist.adkName}
              readOnly
              className="bg-muted pr-8"
            />
            <Lock
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium leading-none">Timestamp</span>
          <dl className="grid gap-0.5 text-xs text-muted-foreground tabular-nums">
            <div className="flex gap-1.5">
              <dt className="w-16 shrink-0">Dibuat</dt>
              <dd>{formatTimestamp(checklist.createdAt)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="w-16 shrink-0">Diperbarui</dt>
              <dd>{formatTimestamp(checklist.updatedAt)}</dd>
            </div>
            {checklist.completedAt && (
              <div className="flex gap-1.5">
                <dt className="w-16 shrink-0">Selesai</dt>
                <dd>{formatTimestamp(checklist.completedAt)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </Card>
  );
}

function SaveIndicator({ state, readOnly }: { state: SaveState; readOnly: boolean }) {
  // aria-live agar perubahan status terbaca, tanpa mengganggu secara visual.
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        state === "error" ? "font-medium text-danger" : "text-muted-foreground",
      )}
      role="status"
      aria-live="polite"
    >
      {state === "saving" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Saving...
        </>
      )}
      {state === "saved" && (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Saved
        </>
      )}
      {state === "error" && (
        <>
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Gagal menyimpan
        </>
      )}
      {state === "idle" && (readOnly ? "Terkunci (Done)" : "Auto-save aktif")}
    </span>
  );
}
