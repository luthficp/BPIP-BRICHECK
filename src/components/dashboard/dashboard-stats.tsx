import { CheckCircle2, ClipboardList, PencilLine } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";

type DashboardStatsProps = {
  items: BankGuaranteeChecklist[] | null;
};

export function DashboardStats({ items }: DashboardStatsProps) {
  const total = items?.length ?? 0;
  const draft = items?.filter((i) => i.status === "Draft").length ?? 0;
  const done = items?.filter((i) => i.status === "Done").length ?? 0;

  const stats = [
    { label: "Total Task", value: total, Icon: ClipboardList },
    { label: "Draft", value: draft, Icon: PencilLine },
    { label: "Done", value: done, Icon: CheckCircle2 },
  ];

  return (
    <dl className="grid grid-cols-3 gap-3 sm:gap-4">
      {stats.map(({ label, value, Icon }) => (
        <Card key={label} className="flex items-center gap-3 p-4 sm:p-5">
          <span
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary sm:flex"
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <dt className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
              {label}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums leading-tight">
              {items === null ? <Skeleton className="mt-1 h-7 w-10" /> : value}
            </dd>
          </div>
        </Card>
      ))}
    </dl>
  );
}
