import { Plus } from "lucide-react";

import { CreateChecklistDialog } from "@/components/dashboard/create-checklist-dialog";
import { Button } from "@/components/ui/button";
import { APP_FULL_NAME, LABEL_TASK_MONITORING } from "@/lib/checklist/config";

export function DashboardHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {APP_FULL_NAME}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
          {LABEL_TASK_MONITORING}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alat bantu verifikasi &amp; validasi Bank Garansi · pantau seluruh task checklist
        </p>
      </div>
      <CreateChecklistDialog>
        <Button size="lg">
          <Plus />
          Create Checklist
        </Button>
      </CreateChecklistDialog>
    </div>
  );
}
