"use client";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { TaskTable } from "@/components/dashboard/task-table";
import { useChecklists } from "@/lib/hooks/use-checklists";

/** Task Monitoring (Dashboard Monitor): daftar seluruh task checklist. Halaman awal aplikasi kini Home (`/`). */
export default function TaskMonitoringPage() {
  const { items, remove } = useChecklists();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <DashboardHeader />
      <DashboardStats items={items} />
      <TaskTable items={items} onDelete={remove} />
    </div>
  );
}
