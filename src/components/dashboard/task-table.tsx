"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  ExternalLink,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { CreateChecklistDialog } from "@/components/dashboard/create-checklist-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BankGuaranteeChecklist, ChecklistStatus } from "@/lib/checklist/types";
import { formatTimestamp } from "@/lib/export/format";
import { isFullyMatched, summarizeValidation } from "@/lib/validation/three-way-match";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | ChecklistStatus;
type SortDirection = "newest" | "oldest";

type TaskTableProps = {
  /** null = masih memuat. */
  items: BankGuaranteeChecklist[] | null;
  onDelete: (id: string) => Promise<void>;
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "Draft", label: "Draft" },
  { value: "Done", label: "Done" },
];

export function TaskTable({ items, onDelete }: TaskTableProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<SortDirection>("newest");
  const [pendingDelete, setPendingDelete] = React.useState<BankGuaranteeChecklist | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Nomor urut stabil berdasarkan urutan pembuatan (tidak berubah saat filter/sort).
  const sequence = React.useMemo(() => {
    const map = new Map<string, number>();
    [...(items ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((item, index) => map.set(item.id, index + 1));
    return map;
  }, [items]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (items ?? []).filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!q) return true;
      return [item.taskName, item.adkName, item.atasNama, item.cif]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    filtered.sort((a, b) =>
      sort === "newest"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.updatedAt.localeCompare(b.updatedAt),
    );
    return filtered;
  }, [items, query, filter, sort]);

  const open = (id: string) => router.push(`/checklist/${id}`);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      toast.success("Draft dihapus", { description: pendingDelete.taskName });
      setPendingDelete(null);
    } catch {
      toast.error("Draft gagal dihapus");
    } finally {
      setDeleting(false);
    }
  };

  const hasItems = (items?.length ?? 0) > 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <h2 className="text-base font-semibold">Daftar Task</h2>

        {hasItems && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari task, ADK, atas nama, CIF"
                aria-label="Cari checklist"
                className="pl-8"
              />
            </div>
            <div
              role="group"
              aria-label="Filter status"
              className="inline-flex rounded-md border bg-muted/50 p-0.5"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter === f.value
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {items === null ? (
        <LoadingRows />
      ) : !hasItems ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium">Tidak ada checklist yang cocok.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ubah kata kunci pencarian atau filter status.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Reset filter
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14">No</TableHead>
              <TableHead>Nama Task</TableHead>
              <TableHead>Risk Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Validasi</TableHead>
              <TableHead
                aria-sort={sort === "newest" ? "descending" : "ascending"}
                className="min-w-[10.5rem]"
              >
                <button
                  type="button"
                  onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
                  className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase tracking-wide hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-table-header-foreground"
                  aria-label={`Urutkan timestamp, saat ini ${
                    sort === "newest" ? "terbaru dulu" : "terlama dulu"
                  }`}
                >
                  Timestamp
                  {sort === "newest" ? (
                    <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Aksi</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                number={sequence.get(item.id) ?? 0}
                onOpen={() => open(item.id)}
                onDelete={() => setPendingDelete(item)}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus draft ini?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{pendingDelete?.taskName}</span>{" "}
              akan dihapus permanen dari perangkat ini. Hanya checklist berstatus Draft yang
              dapat dihapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              <Trash2 />
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TaskRow({
  item,
  number,
  onOpen,
  onDelete,
}: {
  item: BankGuaranteeChecklist;
  number: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const validation = summarizeValidation(item.criticalFields);

  return (
    // Klik di mana saja pada baris membuka task (kemudahan mouse); untuk keyboard
    // dan screen reader, nama task adalah tautan sungguhan.
    <TableRow onClick={onOpen} className="cursor-pointer hover:bg-accent/50">
      <TableCell className="tabular-nums text-muted-foreground">
        {String(number).padStart(2, "0")}
      </TableCell>
      <TableCell className="max-w-[18rem]">
        <Link
          href={`/checklist/${item.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate rounded-sm font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.taskName}
        </Link>
        {(item.atasNama || item.cif) && (
          <div className="truncate text-xs text-muted-foreground">
            {[item.atasNama, item.cif && `CIF ${item.cif}`].filter(Boolean).join(" · ")}
          </div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">{item.adkName}</TableCell>
      <TableCell>
        {item.status === "Done" ? (
          <Badge variant="info">
            <CheckCircle2 aria-hidden="true" />
            Done
          </Badge>
        ) : (
          <Badge variant="muted">
            <PencilLine aria-hidden="true" />
            Draft
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {validation.mismatch > 0 ? (
          <Badge variant="danger" aria-label={`${validation.mismatch} critical field tidak sesuai`}>
            <XCircle aria-hidden="true" />
            {validation.mismatch} tidak sesuai
          </Badge>
        ) : isFullyMatched(validation) ? (
          <Badge variant="success" aria-label="Seluruh critical field sesuai">
            <CheckCircle2 aria-hidden="true" />
            Sesuai
          </Badge>
        ) : (
          <Badge variant="muted" aria-label="Validasi belum lengkap">
            <CircleDashed aria-hidden="true" />
            Belum lengkap
          </Badge>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        <div className="font-medium tabular-nums">
          {formatTimestamp(item.updatedAt, { short: true })}
        </div>
        <div className="text-muted-foreground tabular-nums">
          Dibuat {formatTimestamp(item.createdAt, { short: true })}
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {/* modal={false}: dialog hapus dibuka dari menu ini tanpa mengunci pointer-events. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Aksi untuk ${item.taskName}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>
              <ExternalLink /> Buka
            </DropdownMenuItem>
            {item.status === "Draft" && (
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-danger focus:bg-danger-soft focus:text-danger"
              >
                <Trash2 /> Hapus draft
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary"
        aria-hidden="true"
      >
        <ClipboardCheck className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold">Belum ada checklist Bank Garansi.</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Buat checklist baru untuk memulai proses verifikasi.
      </p>
      <CreateChecklistDialog>
        <Button className="mt-5">
          <Plus />
          Create Checklist
        </Button>
      </CreateChecklistDialog>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Memuat checklist">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
