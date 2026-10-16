"use client";

import { useParams } from "next/navigation";

import { ChecklistWorkspace } from "@/components/checklist/checklist-workspace";

/** Membaca :id dari URL (useParams) lalu merender workspace. */
export function ChecklistRoute() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ChecklistWorkspace id={id} />;
}
