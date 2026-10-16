"use client";

import Link from "next/link";
import * as React from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, FileQuestion } from "lucide-react";
import { toast } from "sonner";

import { AdkOpinion } from "@/components/checklist/adk-opinion";
import { ChecklistHeader } from "@/components/checklist/checklist-header";
import { CriticalFieldValidation } from "@/components/checklist/critical-field-validation";
import { DocumentVerification } from "@/components/checklist/document-verification";
import { ReopenPanel } from "@/components/checklist/reopen";
import { Stepper } from "@/components/checklist/stepper";
import { StepOutput } from "@/components/checklist/step-output";
import { PrintLayout } from "@/components/export/print-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  canMarkDone,
  countEmptyCriticalCells,
  countMismatches,
  describeStep2Issue,
  getCompletion,
  getFirstBlockingStep,
  getInitialStep,
  getUnansweredDocuments,
  isMismatchBlocking,
  isStep1Complete,
  isStep2Complete,
  isStep3Complete,
  type RequirementTarget,
} from "@/lib/checklist/completion";
import { LABEL_TASK_MONITORING, STEPS, type StepId } from "@/lib/checklist/config";
import type { KontraCounts } from "@/lib/checklist/kontra";
import {
  addCustomDocument,
  addFeeComponent,
  applyKontraConfig,
  markDone,
  patchHeader,
  removeCustomDocument,
  removeFeeComponent,
  reopenAsDraft,
  setAmountValue,
  setCriticalValue,
  setDocumentNotes,
  setDocumentStatus,
  setFeeValue,
  setKontraValue,
  setOpiniAdk,
  setPeriodValue,
  setSharedValue,
  setTaskName,
  type HeaderPatch,
} from "@/lib/checklist/mutations";
import type {
  AmountValue,
  BankGuaranteeChecklist,
  DocumentStatus,
  FeeValue,
  PeriodValue,
  SourceKey,
} from "@/lib/checklist/types";
import { buildFileBase } from "@/lib/export/format";
import { useChecklistEditor } from "@/lib/hooks/use-checklist-editor";
import { ROUTE_TASKS } from "@/lib/routes";

type ErrorFlags = Partial<Record<StepId | "header", boolean>>;

/** Judul toast saat navigasi maju ditahan. TIDAK SESUAI dibedakan dari isian yang belum lengkap. */
function describeBlockTitle(step: StepId, c: BankGuaranteeChecklist): string {
  if (step === 2 && countEmptyCriticalCells(c) === 0 && countMismatches(c) > 0) {
    return "Belum dapat lanjut ke Opini ADK";
  }
  return `Lengkapi Step ${step} terlebih dahulu`;
}

/** Pesan singkat mengapa step tertentu belum lengkap. */
function describeIncomplete(step: StepId, c: BankGuaranteeChecklist): string {
  switch (step) {
    case 1:
      return `${getUnansweredDocuments(c).length} dokumen belum diberi status Ada / Tidak Ada`;
    case 2:
      // Isian belum lengkap dan TIDAK SESUAI disebut terpisah; keduanya menahan lanjut ke Opini ADK.
      return describeStep2Issue(c);
    case 3:
      return "Opini ADK belum diisi";
    case 4:
      return "";
  }
}

export function ChecklistWorkspace({ id }: { id: string }) {
  const { checklist, loadState, saveState, update } = useChecklistEditor(id);
  const [stepState, setStep] = React.useState<StepId>(1);
  const [initialised, setInitialised] = React.useState(false);
  const [errors, setErrors] = React.useState<ErrorFlags>({});
  const [printedAt, setPrintedAt] = React.useState(() => new Date());
  const stepAnchor = React.useRef<HTMLDivElement>(null);

  // Saat pertama dimuat: buka step pertama yang belum lengkap (atau Output bila Done).
  React.useEffect(() => {
    if (checklist && !initialised) {
      setStep(getInitialStep(checklist));
      setInitialised(true);
    }
  }, [checklist, initialised]);

  if (loadState === "loading" || (loadState === "ready" && !checklist)) {
    return <WorkspaceSkeleton />;
  }
  if (loadState === "notfound" || !checklist) {
    return <NotFound />;
  }

  // Sebelum efek inisialisasi berjalan, langsung pakai step awal agar tidak berkedip di Step 1.
  const step: StepId = initialised ? stepState : getInitialStep(checklist);
  const readOnly = checklist.status === "Done";
  const completion = getCompletion(checklist);

  const completed: Record<StepId, boolean> = {
    1: isStep1Complete(checklist),
    2: isStep2Complete(checklist),
    3: isStep3Complete(checklist),
    4: readOnly,
  };
  const locked: Record<StepId, boolean> = {
    1: false,
    2: !readOnly && getFirstBlockingStep(2, checklist) !== null,
    3: !readOnly && getFirstBlockingStep(3, checklist) !== null,
    4: !readOnly && getFirstBlockingStep(4, checklist) !== null,
  };

  const scrollToStep = () => {
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      stepAnchor.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  };

  const goTo = (target: StepId) => {
    if (target === step) return;

    // Maju hanya bila seluruh step sebelumnya lengkap; mundur selalu boleh.
    if (!readOnly && target > step) {
      const blocking = getFirstBlockingStep(target, checklist);
      if (blocking !== null) {
        setErrors((prev) => ({ ...prev, [blocking]: true }));
        toast.error(describeBlockTitle(blocking, checklist), {
          description: describeIncomplete(blocking, checklist),
        });
        if (blocking !== step) {
          setStep(blocking);
          scrollToStep();
        }
        return;
      }
    }
    setStep(target);
    scrollToStep();
  };

  /* ------------------------------ handlers ------------------------------ */

  const onHeaderChange = (patch: HeaderPatch) => update((c) => patchHeader(c, patch));
  const onTaskNameChange = (value: string) => update((c) => setTaskName(c, value));
  const onDocumentStatus = (docId: number, status: DocumentStatus) =>
    update((c) => setDocumentStatus(c, docId, status));
  const onDocumentNotes = (docId: number, notes: string) =>
    update((c) => setDocumentNotes(c, docId, notes));
  const onCriticalValue = (fieldId: number, source: SourceKey, value: string) =>
    update((c) => setCriticalValue(c, fieldId, source, value));
  const onAmountChange = (fieldId: number, source: SourceKey, patch: Partial<AmountValue>) =>
    update((c) => setAmountValue(c, fieldId, source, patch));
  const onPeriodChange = (fieldId: number, source: SourceKey, patch: Partial<PeriodValue>) =>
    update((c) => setPeriodValue(c, fieldId, source, patch));
  const onFeeChange = (fieldId: number, source: SourceKey, patch: Partial<FeeValue>) =>
    update((c) => setFeeValue(c, fieldId, source, patch));
  const onFeeAdd = (fieldId: number, name: string) =>
    update(
      (c) => {
        const result = addFeeComponent(c, fieldId, name);
        return result.ok ? result.checklist : c;
      },
      { immediate: true },
    );
  const onFeeRemove = (fieldId: number, componentId: string) =>
    update((c) => removeFeeComponent(c, fieldId, componentId), { immediate: true });
  const onSharedChange = (fieldId: number, value: string) =>
    update((c) => setSharedValue(c, fieldId, value));
  const onKontraConfig = (fieldId: number, counts: KontraCounts) =>
    update((c) => applyKontraConfig(c, fieldId, counts), { immediate: true });
  const onKontraValue = (
    fieldId: number,
    itemId: string,
    source: SourceKey,
    key: string,
    value: string | Partial<AmountValue>,
  ) => update((c) => setKontraValue(c, fieldId, itemId, source, key, value));
  const onAddDocument = (categoryKey: string, name: string) =>
    update(
      (c) => {
        const result = addCustomDocument(c, categoryKey, name);
        return result.ok ? result.checklist : c;
      },
      { immediate: true },
    );
  const onRemoveDocument = (docId: number) =>
    update((c) => removeCustomDocument(c, docId), { immediate: true });
  const onOpinion = (value: string) => update((c) => setOpiniAdk(c, value));

  const handleMarkDone = () => {
    if (!canMarkDone(checklist)) return;
    update((c) => markDone(c), { immediate: true });
    toast.success("Checklist ditandai Done", {
      description: "Pilih output untuk diserahkan kepada SOK.",
    });
  };

  /** Tombol tindakan pada syarat penyelesaian: bawa ADK ke tempat melengkapinya. */
  const handleGoToTarget = (target: RequirementTarget) => {
    if (target === "header") {
      setErrors((prev) => ({ ...prev, header: true }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors((prev) => ({ ...prev, [target]: true }));
    setStep(target);
    scrollToStep();
  };

  const handleReopen = () => {
    update((c) => reopenAsDraft(c), { immediate: true });
    setErrors({});
    toast.success("Checklist kembali berstatus Draft", {
      description: "Seluruh data tetap tersimpan. Pilih step untuk mengedit.",
    });
  };

  const handlePrint = () => {
    // Perbarui cap waktu dokumen, lalu beri nama berkas yang rapi pada dialog "Save as PDF".
    flushSync(() => setPrintedAt(new Date()));
    const previousTitle = document.title;
    document.title = buildFileBase(
      checklist.atasNama,
      checklist.completedAt ?? checklist.updatedAt,
    );
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
      },
      { once: true },
    );
    window.print();
  };

  /* -------------------------------- render ------------------------------- */

  const nextStep = STEPS.find((s) => s.id === step + 1);
  const incompleteHint =
    !readOnly && step < 4 && !completed[step as 1 | 2 | 3]
      ? describeIncomplete(step, checklist)
      : null;
  // Step 2 -> Opini ADK ditahan selama ada TIDAK SESUAI. Tombol tampil nonaktif tetapi tetap
  // dapat diklik agar alasannya dijelaskan (aria-disabled), sedangkan edit dan mundur tetap bebas.
  const mismatchBlocksNext = !readOnly && step === 2 && isMismatchBlocking(checklist);

  return (
    <>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-6 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROUTE_TASKS}>
            <ArrowLeft />
            {LABEL_TASK_MONITORING}
          </Link>
        </Button>

        <ChecklistHeader
          checklist={checklist}
          saveState={saveState}
          completion={completion}
          readOnly={readOnly}
          showErrors={Boolean(errors.header)}
          onHeaderChange={onHeaderChange}
          onTaskNameChange={onTaskNameChange}
        />

        {/* Task Done: pengingat + tombol buka kembali tetap terlihat di step 1-3 (step 4 punya area sendiri). */}
        {readOnly && step < 4 && <ReopenPanel onReopen={handleReopen} variant="banner" />}

        <div ref={stepAnchor} className="scroll-mt-20">
          <Stepper current={step} completed={completed} locked={locked} onSelect={goTo} />
        </div>

        <div key={step}>
          {step === 1 && (
            <DocumentVerification
              documents={checklist.documentVerification}
              readOnly={readOnly}
              showErrors={Boolean(errors[1])}
              onStatusChange={onDocumentStatus}
              onNotesChange={onDocumentNotes}
              onAddDocument={onAddDocument}
              onRemoveDocument={onRemoveDocument}
            />
          )}
          {step === 2 && (
            <CriticalFieldValidation
              fields={checklist.criticalFields}
              documents={checklist.documentVerification}
              readOnly={readOnly}
              showErrors={Boolean(errors[2])}
              onValueChange={onCriticalValue}
              onAmountChange={onAmountChange}
              onPeriodChange={onPeriodChange}
              onFeeChange={onFeeChange}
              onFeeAdd={onFeeAdd}
              onFeeRemove={onFeeRemove}
              onSharedChange={onSharedChange}
              onKontraConfig={onKontraConfig}
              onKontraValue={onKontraValue}
            />
          )}
          {step === 3 && (
            <AdkOpinion
              checklist={checklist}
              readOnly={readOnly}
              showErrors={Boolean(errors[3])}
              onChange={onOpinion}
            />
          )}
          {step === 4 && (
            <StepOutput
              checklist={checklist}
              onMarkDone={handleMarkDone}
              onGoToTarget={handleGoToTarget}
              onReopen={handleReopen}
              onPrint={handlePrint}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => goTo((step - 1) as StepId)} disabled={step === 1}>
            <ArrowLeft />
            Kembali
          </Button>

          {nextStep && (
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
              {incompleteHint && (
                <p
                  className={
                    mismatchBlocksNext
                      ? "max-w-xl text-sm font-medium text-danger"
                      : "text-sm text-muted-foreground"
                  }
                  aria-live="polite"
                >
                  {incompleteHint}
                </p>
              )}
              <Button
                onClick={() => goTo(nextStep.id)}
                aria-disabled={mismatchBlocksNext || undefined}
                className={mismatchBlocksNext ? "cursor-not-allowed opacity-60" : undefined}
              >
                Lanjut ke Step {nextStep.id}: {nextStep.title}
                <ArrowRight />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dokumen cetak: hanya terlihat saat print, hanya bila checklist sudah Done. */}
      {readOnly && (
        <div className="hidden print:block">
          <PrintLayout checklist={checklist} printedAt={printedAt} />
        </div>
      )}
    </>
  );
}

function WorkspaceSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6"
      aria-busy="true"
      aria-label="Memuat checklist"
    >
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <Card className="flex flex-col items-center p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileQuestion className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Checklist tidak ditemukan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Checklist ini tidak ada di perangkat ini. Data prototype tersimpan di browser, sehingga
          tidak terlihat dari browser atau perangkat lain.
        </p>
        <Button asChild className="mt-5">
          <Link href={ROUTE_TASKS}>Kembali ke {LABEL_TASK_MONITORING}</Link>
        </Button>
      </Card>
    </div>
  );
}
