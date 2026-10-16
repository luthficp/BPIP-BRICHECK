"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Accordion ringan dan aksesibel (tanpa dependensi tambahan).
 * Pola WAI-ARIA: judul <h3> berisi <button aria-expanded aria-controls>, panel
 * berupa region yang diberi label oleh tombolnya. Enter/Spasi membuka-menutup
 * (bawaan <button>). Saat tertutup, judul dan status tetap terlihat.
 */

const TONE_BORDER = {
  neutral: "border-l-border",
  info: "border-l-primary",
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
} as const;

export type AccordionItemProps = {
  title: string;
  /** Status ringkas (mis. Badge) yang selalu terlihat di baris judul. */
  status?: React.ReactNode;
  /** Ikon/penanda di sisi kiri judul. */
  leading?: React.ReactNode;
  tone?: keyof typeof TONE_BORDER;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function AccordionItem({
  title,
  status,
  leading,
  tone = "neutral",
  defaultOpen = false,
  className,
  children,
}: AccordionItemProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const uid = React.useId();
  const triggerId = `${uid}-trigger`;
  const panelId = `${uid}-panel`;

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-l-4 bg-card", TONE_BORDER[tone], className)}
      data-state={open ? "open" : "closed"}
    >
      <h3 className="m-0">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
        >
          {leading}
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold sm:text-base">{title}</span>
            {status}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open}
        className="border-t px-3 py-3 sm:px-4"
      >
        {children}
      </div>
    </div>
  );
}
