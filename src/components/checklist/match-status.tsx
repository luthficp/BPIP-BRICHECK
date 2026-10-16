import { CheckCircle2, CircleDashed, Info, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LABEL_SHARED_INFO } from "@/lib/checklist/config";
import type { MatchState } from "@/lib/checklist/types";
import { cn } from "@/lib/utils";

const CONFIG = {
  SESUAI: {
    variant: "success",
    label: "SESUAI",
    Icon: CheckCircle2,
    aria: "Hasil Validasi: sesuai",
  },
  "TIDAK SESUAI": {
    variant: "danger",
    label: "TIDAK SESUAI",
    Icon: XCircle,
    aria: "Hasil Validasi: tidak sesuai",
  },
  "BELUM LENGKAP": {
    variant: "muted",
    label: "Belum lengkap",
    Icon: CircleDashed,
    aria: "Hasil Validasi: belum lengkap, masih ada sumber yang kosong",
  },
  BERSAMA: {
    variant: "info",
    label: LABEL_SHARED_INFO,
    Icon: Info,
    aria: "Informasi bersama: berlaku untuk seluruh sumber dan tidak dibandingkan",
  },
} as const;

/**
 * Hasil Validasi. Warna TIDAK pernah menjadi satu-satunya penanda:
 * selalu ada ikon + teks (✓ SESUAI / ✕ TIDAK SESUAI).
 */
export function MatchStatusBadge({
  state,
  className,
}: {
  state: MatchState;
  className?: string;
}) {
  const { variant, label, Icon, aria } = CONFIG[state];
  return (
    <Badge
      variant={variant}
      aria-label={aria}
      className={cn(
        "px-2.5 py-1 text-xs",
        state === "TIDAK SESUAI" && "ring-1 ring-danger/30",
        className,
      )}
    >
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
