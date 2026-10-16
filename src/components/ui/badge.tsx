import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Warna = indikator fungsional:
 * success (hijau) = SESUAI, danger (merah) = TIDAK SESUAI,
 * warning (amber) = perlu perhatian, default/info (biru) = informasi.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        info: "border-primary/25 bg-primary-soft text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        muted: "border-border bg-muted text-muted-foreground",
        success: "border-success-border bg-success-soft text-success",
        danger: "border-danger-border bg-danger-soft text-danger",
        warning: "border-warning-border bg-warning-soft text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** <span> (phrasing content) agar sah dipakai di dalam <p>, <button>, dan judul accordion. */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
