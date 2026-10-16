"use client";

import * as React from "react";
import { BookOpen, ChevronDown, CircleHelp, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP_FULL_NAME } from "@/lib/checklist/config";
import { FAQ_SECTIONS, type FaqItem, type FaqSection } from "@/lib/faq/content";
import { cn } from "@/lib/utils";

/**
 * Halaman FAQ: Tentang BRICHECK, panduan langkah demi langkah, tanya jawab, glosarium.
 * Accordion memakai elemen <details> bawaan browser (aksesibel lewat keyboard,
 * tanpa dependensi tambahan) dengan kontrol "Buka semua / Tutup semua".
 */
export function FaqView() {
  const [openIds, setOpenIds] = React.useState<ReadonlySet<string>>(() => new Set());

  const allIds = React.useMemo(
    () => FAQ_SECTIONS.flatMap((section) => section.items.map((item) => `${section.id}:${item.id}`)),
    [],
  );
  const allOpen = openIds.size === allIds.length;

  const setItemOpen = React.useCallback((key: string, open: boolean) => {
    setOpenIds((prev) => {
      if (prev.has(key) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <CircleHelp className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide">FAQ</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Pertanyaan &amp; Panduan {APP_FULL_NAME}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Penjelasan singkat tentang fungsi BRICHECK, langkah penggunaannya, dan istilah yang
          dipakai.
        </p>
      </header>

      <div
        role="note"
        className="flex gap-3 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm sm:p-4"
      >
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <strong className="font-semibold">BRICHECK adalah alat bantu verifikasi, bukan sistem
          approval.</strong>{" "}
          Review dan opini SOK tetap dilakukan secara manual pada dokumen hasil cetak atau ekspor.
        </p>
      </div>

      <nav aria-label="Bagian FAQ" className="flex flex-wrap items-center gap-2">
        {FAQ_SECTIONS.map((section) => (
          <Button key={section.id} asChild variant="outline" size="sm">
            <a href={`#${section.id}`}>{section.title}</a>
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="sm:ml-auto"
          onClick={() => setOpenIds(allOpen ? new Set() : new Set(allIds))}
        >
          {allOpen ? "Tutup semua" : "Buka semua"}
        </Button>
      </nav>

      <div className="space-y-8">
        {FAQ_SECTIONS.map((section) => (
          <FaqSectionView
            key={section.id}
            section={section}
            openIds={openIds}
            onToggle={setItemOpen}
          />
        ))}
      </div>
    </div>
  );
}

function FaqSectionView({
  section,
  openIds,
  onToggle,
}: {
  section: FaqSection;
  openIds: ReadonlySet<string>;
  onToggle: (key: string, open: boolean) => void;
}) {
  const headingId = `${section.id}-heading`;
  return (
    <section id={section.id} aria-labelledby={headingId} className="scroll-mt-20 space-y-3">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id={headingId} className="text-lg font-semibold">
            {section.title}
          </h2>
          <p className="text-sm text-muted-foreground">{section.description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {section.items.map((item, index) => {
          const key = `${section.id}:${item.id}`;
          return (
            <FaqEntry
              key={key}
              item={item}
              index={index + 1}
              numbered={section.kind === "steps"}
              open={openIds.has(key)}
              onToggle={(open) => onToggle(key, open)}
            />
          );
        })}
      </div>
    </section>
  );
}

function FaqEntry({
  item,
  index,
  numbered,
  open,
  onToggle,
}: {
  item: FaqItem;
  index: number;
  numbered: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <details
        className="group"
        open={open}
        onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          {numbered && (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
              aria-hidden="true"
            >
              {index}
            </span>
          )}
          <span className="min-w-0 flex-1">
            {numbered && <span className="sr-only">Langkah {index}: </span>}
            {item.question}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-2 border-t px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          {item.answer.map((paragraph) => (
            <p key={paragraph} className="text-foreground/90">
              {paragraph}
            </p>
          ))}
          {item.points && (
            <ul className="list-disc space-y-1 pl-5 text-foreground/90">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </Card>
  );
}
