"use client";

import * as React from "react";
import { Eye, Printer } from "lucide-react";

import { PrintLayout } from "@/components/export/print-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";

type PreviewDialogProps = {
  checklist: BankGuaranteeChecklist;
  onPrint: () => void;
};

/** Pratinjau dokumen cetak (komponen yang sama dengan hasil print). */
export function PreviewDialog({ checklist, onPrint }: PreviewDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Eye />
          Pratinjau
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl bg-muted p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Pratinjau Dokumen</DialogTitle>
          <DialogDescription>
            Tampilan sama dengan hasil cetak. Area Opini SOK dan tanda tangan dikosongkan untuk
            diisi tangan.
          </DialogDescription>
        </DialogHeader>
        <PreviewBody checklist={checklist} />
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setOpen(false);
              // Tunggu dialog tertutup agar tidak ikut tercetak.
              setTimeout(onPrint, 150);
            }}
          >
            <Printer />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ checklist }: { checklist: BankGuaranteeChecklist }) {
  const printedAt = React.useMemo(() => new Date(), []);
  return (
    <div className="overflow-auto rounded-md border bg-neutral-300 p-3 dark:bg-neutral-800">
      <div className="mx-auto w-[210mm] max-w-none bg-white p-[12mm] text-black shadow-lg">
        <PrintLayout checklist={checklist} printedAt={printedAt} />
      </div>
    </div>
  );
}
