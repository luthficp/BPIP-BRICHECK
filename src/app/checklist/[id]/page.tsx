import { Suspense } from "react";

import { ChecklistRoute } from "@/components/checklist/checklist-route";

/**
 * Server component tipis. useParams() ada di client component dan harus
 * berada di dalam <Suspense> agar rute dinamis ini bisa di-prerender (Next 16).
 */
export default function ChecklistPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground sm:px-6">
          Memuat checklist…
        </div>
      }
    >
      <ChecklistRoute />
    </Suspense>
  );
}
