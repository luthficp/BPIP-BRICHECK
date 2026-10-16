"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LABEL_ADK_NAME } from "@/lib/checklist/config";
import { createEmptyChecklist } from "@/lib/checklist/factory";
import { checklistRepository, getLastAdkName, setLastAdkName } from "@/lib/storage";

type CreateChecklistDialogProps = {
  /** Elemen pemicu (Button). Dirender sebagai DialogTrigger asChild. */
  children: React.ReactNode;
};

/**
 * Popup "Nama Lengkap ADK :" - satu-satunya langkah sebelum masuk ke form checklist.
 * Nama Lengkap ADK menjadi Risk Owner pada Task Monitoring.
 */
export function CreateChecklistDialog({ children }: CreateChecklistDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [adkName, setAdkName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Prefill nama ADK terakhir supaya tidak mengetik ulang.
      setAdkName(getLastAdkName());
      setError(null);
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = adkName.trim();
    if (!name) {
      setError(`${LABEL_ADK_NAME} wajib diisi.`);
      return;
    }
    setSubmitting(true);
    try {
      const checklist = createEmptyChecklist(name);
      await checklistRepository.save(checklist);
      setLastAdkName(name);
      toast.success("Checklist dibuat", { description: `Risk Owner: ${name}` });
      setOpen(false);
      router.push(`/checklist/${checklist.id}`);
    } catch {
      setSubmitting(false);
      toast.error("Checklist gagal dibuat", {
        description: "Penyimpanan browser tidak tersedia. Periksa pengaturan browser Anda.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create Checklist</DialogTitle>
            <DialogDescription>
              Checklist verifikasi &amp; validasi Bank Garansi baru.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="adk-name">
              {LABEL_ADK_NAME} <span aria-hidden="true">:</span>
              <span className="ml-1 text-danger" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="adk-name"
              autoFocus
              autoComplete="name"
              placeholder="Nama lengkap sesuai identitas ADK"
              value={adkName}
              onChange={(e) => {
                setAdkName(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby="adk-name-help"
              disabled={submitting}
            />
            <p
              id="adk-name-help"
              className={error ? "text-xs font-medium text-danger" : "text-xs text-muted-foreground"}
            >
              {error ?? "Nama ini tercatat sebagai Risk Owner checklist."}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Continue
              <ArrowRight />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
