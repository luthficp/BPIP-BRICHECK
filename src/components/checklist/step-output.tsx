"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Info,
  ListChecks,
  Lock,
  TriangleAlert,
} from "lucide-react";

import { DocumentVerificationSummary } from "@/components/checklist/document-summary";
import { ReopenPanel } from "@/components/checklist/reopen";
import { ExportActions } from "@/components/export/export-actions";
import { AccordionItem } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { RequirementTarget } from "@/lib/checklist/completion";
import {
  LABEL_MARK_DONE,
  LABEL_MEMORANDUM,
  LABEL_PUTUSAN,
  LABEL_SUMMARY_OUTPUT,
  LABEL_UNDERLYING,
} from "@/lib/checklist/config";
import {
  getRequirementSummaries,
  type CriticalRequirementSummary,
  type HeaderRequirementSummary,
  type OpinionRequirementSummary,
  type RequirementSummary,
  type RequirementTone,
} from "@/lib/checklist/requirement-summary";
import { TEXT_ALL_REQUIREMENTS_MET } from "@/lib/checklist/status-text";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { formatTimestamp } from "@/lib/export/format";
import { cn } from "@/lib/utils";

type StepOutputProps = {
  checklist: BankGuaranteeChecklist;
  /** Dipanggil setelah ADK mengonfirmasi (seluruh syarat sudah terpenuhi). */
  onMarkDone: () => void;
  /** Membawa ADK ke tempat syarat tertentu dapat dilengkapi. */
  onGoToTarget: (target: RequirementTarget) => void;
  onReopen: () => void;
  onPrint: () => void;
};

/**
 * Step "Summary & Output". Halaman ini hanya berisi Syarat Penyelesaian:
 * empat accordion (Informasi Aplikasi, Document Verification, Critical Field
 * Validation, Opini ADK) berisi status ringkas dan ringkasan datanya. Tidak ada
 * alert terpisah; informasi hasil validasi dan penyelesaian ada di dalam
 * accordion terkait dan di bagian Syarat Penyelesaian itu sendiri.
 * Setelah Done, pilihan Output (PDF / Word / Print / Pratinjau) dan tombol
 * "Buka Kembali sebagai Draft" muncul di bawahnya.
 */
export function StepOutput({
  checklist,
  onMarkDone,
  onGoToTarget,
  onReopen,
  onPrint,
}: StepOutputProps) {
  const [confirmDone, setConfirmDone] = React.useState(false);
  const isDone = checklist.status === "Done";
  const summaries = getRequirementSummaries(checklist);
  const unmet = summaries.filter((req) => !req.ok);
  const allMet = unmet.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">4. {LABEL_SUMMARY_OUTPUT}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <section aria-labelledby="syarat-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="syarat-heading" className="text-base font-semibold">
                Syarat Penyelesaian
              </h2>
            </div>
            <p className="text-sm font-medium tabular-nums" aria-live="polite">
              {summaries.length - unmet.length} dari {summaries.length} syarat terpenuhi
            </p>
          </div>
          <Progress
            value={((summaries.length - unmet.length) / summaries.length) * 100}
            aria-label="Kemajuan syarat penyelesaian"
          />

          <div className="space-y-2">
            {summaries.map((summary) => (
              <RequirementAccordion
                key={summary.id}
                summary={summary}
                onGoTo={() => onGoToTarget(summary.target)}
              />
            ))}
          </div>

          {/* Pesan penyelesaian: bagian dari Syarat Penyelesaian, bukan alert. */}
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            {isDone ? (
              <p className="flex items-start gap-2 text-sm font-medium">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  Checklist selesai
                  {checklist.completedAt
                    ? ` pada ${formatTimestamp(checklist.completedAt)}`
                    : ""}{" "}
                  oleh {checklist.adkName}.
                </span>
              </p>
            ) : allMet ? (
              <p className="flex items-start gap-2 text-sm font-medium" aria-live="polite">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>{TEXT_ALL_REQUIREMENTS_MET}</span>
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground" aria-live="polite">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  <span className="font-medium text-foreground">
                    {LABEL_MARK_DONE} aktif setelah seluruh syarat terpenuhi.
                  </span>{" "}
                  Belum terpenuhi: {unmet.map((req) => req.label).join(", ")}. Buka accordion
                  terkait untuk melihat tindakan yang dibutuhkan.
                </span>
              </p>
            )}
            {!isDone && (
              <Button
                size="lg"
                className="shrink-0"
                disabled={!allMet}
                aria-disabled={!allMet}
                onClick={() => allMet && setConfirmDone(true)}
              >
                <CheckCircle2 />
                {LABEL_MARK_DONE}
              </Button>
            )}
          </div>
        </section>

        {isDone && (
          <>
            <section aria-labelledby="output-heading" className="space-y-2">
              <h2 id="output-heading" className="text-base font-semibold">
                Pilihan Output
              </h2>
              <ExportActions checklist={checklist} onPrint={onPrint} />
              <p className="text-xs text-muted-foreground">
                Setelah dicetak atau diekspor, SOK mereview secara manual: menulis opini, tanggal,
                dan tanda tangan basah pada dokumen.
              </p>
            </section>

            <ReopenPanel onReopen={onReopen} variant="card" />

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Selama berstatus Done, isian terkunci agar sama dengan dokumen yang dicetak.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={confirmDone} onOpenChange={setConfirmDone}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tandai checklist selesai?</DialogTitle>
            <DialogDescription>
              Status menjadi Done dan isian dikunci agar sama dengan dokumen yang akan dicetak
              untuk review SOK. Bila perlu mengubah, Anda dapat membukanya kembali sebagai Draft.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDone(false)}>
              Kembali
            </Button>
            <Button
              onClick={() => {
                setConfirmDone(false);
                onMarkDone();
              }}
            >
              <CheckCircle2 />
              Ya, tandai selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Accordion per syarat                                                 */
/* ------------------------------------------------------------------ */

const TONE_BADGE: Record<RequirementTone, "success" | "warning" | "danger" | "info"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  // Ringkasan informatif (Document Verification): biru netral, bukan penilaian lengkap / belum lengkap.
  neutral: "info",
};

const TONE_ICON_WRAP: Record<RequirementTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-primary-soft text-primary",
};

function ToneIcon({ tone, id }: { tone: RequirementTone; id: RequirementSummary["id"] }) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "danger"
        ? TriangleAlert
        : tone === "neutral"
          ? CircleDashed
          : // Ringkasan Document Verification dengan Tidak Ada: informasi (bukan peringatan/kegagalan).
            id === "documents"
            ? Info
            : CircleAlert;
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        TONE_ICON_WRAP[tone],
      )}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function RequirementAccordion({
  summary,
  onGoTo,
}: {
  summary: RequirementSummary;
  onGoTo: () => void;
}) {
  return (
    <AccordionItem
      title={summary.label}
      tone={summary.tone === "neutral" ? "info" : summary.tone}
      // Syarat yang belum terpenuhi atau perlu ditinjau langsung terbuka; ringkasan Document
      // Verification selalu terbuka agar jumlah dan daftarnya langsung terlihat.
      defaultOpen={!summary.ok || summary.tone === "danger" || summary.id === "documents"}
      leading={<ToneIcon tone={summary.tone} id={summary.id} />}
      status={
        <Badge variant={TONE_BADGE[summary.tone]}>
          {summary.tone === "success" ? (
            <CheckCircle2 aria-hidden="true" />
          ) : summary.tone === "danger" ? (
            <TriangleAlert aria-hidden="true" />
          ) : summary.tone === "neutral" ? (
            <CircleDashed aria-hidden="true" />
          ) : summary.id === "documents" ? (
            <Info aria-hidden="true" />
          ) : (
            <CircleDashed aria-hidden="true" />
          )}
          {summary.statusLabel}
        </Badge>
      }
    >
      <div className="space-y-3">
        {summary.id === "header" && <HeaderBody summary={summary} />}
        {summary.id === "documents" && <DocumentVerificationSummary summary={summary} />}
        {summary.id === "critical" && <CriticalBody summary={summary} />}
        {summary.id === "opinion" && <OpinionBody summary={summary} />}

        {!summary.ok && (
          <Button variant="outline" size="sm" onClick={onGoTo}>
            {summary.action}
            <ArrowRight />
          </Button>
        )}
      </div>
    </AccordionItem>
  );
}

function HeaderBody({ summary }: { summary: HeaderRequirementSummary }) {
  return (
    <>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {summary.fields.map((field) => (
          <div key={field.label} className="flex items-baseline gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">{field.label}</dt>
            <dd
              className={cn(
                "min-w-0 break-words font-medium",
                field.value === "" && "text-warning",
              )}
            >
              {field.value === "" ? "Belum diisi" : field.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">
        {summary.ok
          ? "Seluruh data wajib sudah terisi."
          : `Perlu dilengkapi: ${summary.missing.join(", ")}.`}
      </p>
    </>
  );
}

const TILE_TONES = {
  info: "border-primary/25 bg-primary-soft text-primary",
  success: "border-success-border bg-success-soft text-success",
  danger: "border-danger-border bg-danger-soft text-danger",
  warning: "border-warning-border bg-warning-soft text-warning",
} as const;

function Tile({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: keyof typeof TILE_TONES;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", TILE_TONES[tone])}>
      <dt className="text-xs font-semibold">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold leading-none tabular-nums">
        {value}
        <span className="ml-1 text-xs font-medium opacity-80">/ {total}</span>
      </dd>
    </div>
  );
}

function CriticalBody({ summary }: { summary: CriticalRequirementSummary }) {
  const { counts, status, sharedInfo } = summary;
  const incompleteSentence = status.incompleteText
    ? `${status.incompleteText} Data yang belum lengkap tidak dianggap sesuai dan tidak dihitung sebagai ketidaksesuaian.`
    : null;

  return (
    <>
      <div className="space-y-1 text-sm">
        <p className="font-medium">{status.text}</p>
        {incompleteSentence && <p className="text-muted-foreground">{incompleteSentence}</p>}
      </div>

      {/* Critical Field: hanya tujuh field yang dibandingkan antar sumber. */}
      <section aria-label="Critical Field" data-summary-block="critical" className="space-y-2">
        <p className="text-sm font-semibold" data-critical-ratio>
          Critical Field Sesuai{" "}
          <span className="tabular-nums">
            {counts.match}/{counts.total}
          </span>
        </p>
        <dl className="grid grid-cols-3 gap-2" aria-label="Rekap Hasil Validasi Critical Field">
          <Tile label="Sesuai" value={counts.match} total={counts.total} tone="success" />
          <Tile label="Tidak sesuai" value={counts.mismatch} total={counts.total} tone="danger" />
          <Tile label="Belum lengkap" value={counts.incomplete} total={counts.total} tone="warning" />
        </dl>
      </section>

      {/* Informasi Bersama: terpisah dari rasio critical field, khusus Underlying / Dasar Penerbitan. */}
      {sharedInfo && (
        <section
          aria-label="Informasi Bersama"
          data-summary-block="shared"
          data-shared-status={sharedInfo.filled ? "filled" : "empty"}
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-l-4 px-3 py-2",
            sharedInfo.filled
              ? "border-primary/25 border-l-primary bg-primary-soft"
              : "border-warning-border border-l-warning bg-warning-soft",
          )}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {sharedInfo.label}
              <span className="font-medium text-muted-foreground"> — Underlying / Dasar Penerbitan</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Satu isian untuk seluruh sumber; tidak dibandingkan dan bukan critical field kedelapan.
            </p>
          </div>
          <p
            className={cn(
              "flex items-center gap-1 text-sm font-bold",
              sharedInfo.filled ? "text-primary" : "text-warning",
            )}
            data-shared-badge
          >
            {sharedInfo.filled ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <CircleDashed className="h-4 w-4" aria-hidden="true" />
            )}
            {sharedInfo.statusLabel}
          </p>
        </section>
      )}

      {summary.mismatchRows.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-danger">Perlu ditinjau</h4>
          <ul className="space-y-0.5 text-sm">
            {summary.mismatchRows.map((row) => (
              <li key={row.name}>
                <span className="font-medium">{row.name}</span>
                {row.reasons.length > 0 && (
                  <span className="text-muted-foreground">: {row.reasons.join("; ")}</span>
                )}
                {row.rowIncomplete && (
                  <span className="text-muted-foreground"> (baris ini juga belum lengkap)</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            TIDAK SESUAI menahan lanjut ke Opini ADK dan penyelesaian. Tinjau dan koreksi
            berdasarkan {LABEL_UNDERLYING}, {LABEL_MEMORANDUM}, dan {LABEL_PUTUSAN} pada Critical
            Field Validation; Anda tetap dapat mengubah isian dan kembali ke step sebelumnya.
          </p>
        </div>
      )}

      {summary.incompleteRows.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-warning">Belum lengkap</h4>
          <ul className="space-y-0.5 text-sm">
            {summary.incompleteRows.map((row) => (
              <li key={row.name}>
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground"> — {row.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function OpinionBody({ summary }: { summary: OpinionRequirementSummary }) {
  if (!summary.ok) {
    return <p className="text-sm">Opini ADK belum diisi. Tuliskan hasil pemeriksaan Anda.</p>;
  }
  return (
    <>
      <p className="text-sm">Opini ADK sudah diisi.</p>
      <p className="line-clamp-6 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
        {summary.text}
      </p>
    </>
  );
}
