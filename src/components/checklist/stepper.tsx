"use client";

import { Check, Lock } from "lucide-react";

import { STEPS, type StepId } from "@/lib/checklist/config";
import { cn } from "@/lib/utils";

type StepperProps = {
  current: StepId;
  completed: Record<StepId, boolean>;
  /** Step yang belum boleh dimasuki (prasyarat belum lengkap). */
  locked: Record<StepId, boolean>;
  onSelect: (step: StepId) => void;
};

/**
 * Stepper berurutan: Document Verification -> Critical Field Validation
 * -> Opini ADK -> Output. Step yang terkunci tetap bisa diklik; pengguna
 * diarahkan ke step prasyarat yang belum lengkap (lihat workspace).
 */
export function Stepper({ current, completed, locked, onSelect }: StepperProps) {
  return (
    <nav aria-label="Langkah checklist">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((step) => {
          const isCurrent = step.id === current;
          const isDone = completed[step.id];
          const isLocked = locked[step.id] && !isCurrent;

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "group flex w-full flex-col items-start gap-2 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3 sm:p-3",
                  isCurrent
                    ? "border-primary bg-primary-soft"
                    : "bg-card hover:bg-accent/60",
                  isLocked && "opacity-70",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    !isCurrent && isDone && "border-success-border bg-success-soft text-success",
                    !isCurrent && !isDone && "border-input bg-muted text-muted-foreground",
                  )}
                >
                  {isDone && !isCurrent ? (
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                  ) : isLocked ? (
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    step.id
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold leading-snug sm:text-sm">
                    {step.title}
                  </span>
                  <span className="hidden text-xs text-muted-foreground lg:block">
                    {step.hint}
                  </span>
                  <span className="sr-only">
                    {isDone ? "Selesai" : isLocked ? "Terkunci, lengkapi langkah sebelumnya" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
