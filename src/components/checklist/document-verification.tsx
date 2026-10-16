"use client";

import * as React from "react";
import { Check, ChevronRight, Plus, Trash2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  documentHasData,
  findDuplicateDocument,
  groupDocuments,
  type DocumentGroup,
  type LabelledDocument,
} from "@/lib/checklist/documents";
import { PKS_NOTES_PLACEHOLDER } from "@/lib/checklist/config";
import {
  cleanPksNumber,
  isPksDocument,
  PKS_MISSING_NUMBER_TEXT,
} from "@/lib/checklist/pks";
import type { DocumentStatus, DocumentVerification as DocumentRow } from "@/lib/checklist/types";
import { cn } from "@/lib/utils";

type DocumentVerificationProps = {
  documents: DocumentRow[];
  readOnly: boolean;
  /** true setelah ADK mencoba lanjut tetapi masih ada dokumen tanpa status. */
  showErrors: boolean;
  onStatusChange: (id: number, status: DocumentStatus) => void;
  onNotesChange: (id: number, notes: string) => void;
  /** Menambah subkategori custom pada kategori utama (nama sudah divalidasi komponen). */
  onAddDocument: (categoryKey: string, name: string) => void;
  /** Menghapus subkategori custom. */
  onRemoveDocument: (id: number) => void;
};

/** Hanya petunjuk isian (placeholder); tidak pernah disimpan sebagai nilai Keterangan. */
const KETERANGAN_PLACEHOLDER = "Isi keterangan sesuai Jenis Dokumen";

/** Perjanjian Kerja Sama dipilih Ada tetapi Nomor PKS (Keterangan) masih kosong. */
function isPksNumberMissing(doc: Pick<DocumentRow, "categoryKey" | "documentName" | "custom" | "status" | "notes">): boolean {
  return isPksDocument(doc) && doc.status === "Ada" && cleanPksNumber(doc.notes) === "";
}

export function DocumentVerification({
  documents,
  readOnly,
  showErrors,
  onStatusChange,
  onNotesChange,
  onAddDocument,
  onRemoveDocument,
}: DocumentVerificationProps) {
  const groups = React.useMemo(() => groupDocuments(documents), [documents]);
  const answered = documents.filter((d) => d.status !== null).length;
  const missing = documents.length - answered;
  const notAvailable = documents.filter((d) => d.status === "Tidak Ada").length;

  // Kategori dengan subitem tampil sebagai accordion yang AWALNYA TERTUTUP. State ini lokal pada
  // tahap, sehingga setiap kali Document Verification dibuka ulang semua kategori kembali tertutup.
  // Membuka/menutup hanya mengubah tampilan; data dokumen tidak disentuh.
  const [openKeys, setOpenKeys] = React.useState<ReadonlySet<string>>(() => new Set());
  const setOpen = React.useCallback((key: string, open: boolean) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const allOpen = groups.length > 0 && groups.every((group) => openKeys.has(group.key));
  const toggleAll = () => setOpenKeys(allOpen ? new Set() : new Set(groups.map((group) => group.key)));

  // Kategori yang sedang menambah dokumen (satu form pada satu waktu).
  const [adding, setAdding] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = React.useState<DocumentRow | null>(null);

  const openAdd = (key: string) => {
    setOpen(key, true); // form tambah berada di dalam daftar kategori, jadi kategori ikut terbuka
    setAdding(key);
    setDraft("");
    setError(null);
  };
  const cancelAdd = () => {
    setAdding(null);
    setDraft("");
    setError(null);
  };
  const submitAdd = (key: string) => {
    const name = draft.trim().replace(/\s+/g, " ");
    if (!name) {
      setError("Nama dokumen wajib diisi.");
      return;
    }
    if (findDuplicateDocument(documents, key, name)) {
      setError(`"${name}" sudah ada pada kategori ini. Gunakan nama lain atau periksa daftar di atas.`);
      return;
    }
    onAddDocument(key, name);
    cancelAdd();
  };

  const requestRemoval = (doc: DocumentRow) => {
    if (documentHasData(doc)) setPendingRemoval(doc);
    else onRemoveDocument(doc.id);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">1. Document Verification</CardTitle>
          <CardDescription>
            Periksa kelengkapan dokumen pengajuan per kategori. Pilih satu status untuk setiap
            dokumen. Klik baris kategori untuk membuka daftar dokumennya, dan gunakan tombol{" "}
            <strong className="font-semibold text-foreground">+</strong> untuk menambah dokumen.
            Bila Perjanjian Kerja Sama (Identitas Beneficiary) dipilih Ada, Nomor PKS wajib diisi
            pada Keterangan.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex flex-wrap items-center gap-2" aria-live="polite">
            <Badge variant={missing === 0 ? "info" : "muted"}>
              {answered} dari {documents.length} diperiksa
            </Badge>
            {notAvailable > 0 && (
              <Badge variant="warning">
                <TriangleAlert aria-hidden="true" />
                {notAvailable} dokumen tidak ada
              </Badge>
            )}
          </span>
          {groups.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
              {allOpen ? "Tutup semua kategori" : "Buka semua kategori"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14">No</TableHead>
                <TableHead>Jenis Dokumen</TableHead>
                <TableHead className="w-16 text-center">Ada</TableHead>
                <TableHead className="w-24 text-center">Tidak Ada</TableHead>
                <TableHead className="min-w-[14rem]">Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <CategoryRows
                  key={group.key}
                  group={group}
                  readOnly={readOnly}
                  showErrors={showErrors}
                  expanded={openKeys.has(group.key)}
                  onToggle={() => setOpen(group.key, !openKeys.has(group.key))}
                  isAdding={adding === group.key}
                  draft={draft}
                  error={error}
                  onDraftChange={(value) => {
                    setDraft(value);
                    setError(null);
                  }}
                  onOpenAdd={() => openAdd(group.key)}
                  onCancelAdd={cancelAdd}
                  onSubmitAdd={() => submitAdd(group.key)}
                  onStatusChange={onStatusChange}
                  onNotesChange={onNotesChange}
                  onRequestRemoval={requestRemoval}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={pendingRemoval !== null} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus dokumen ini?</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingRemoval?.documentName}&rdquo; sudah memiliki status atau keterangan.
              Bila dihapus, isian tersebut ikut hilang. Dokumen bawaan tidak terpengaruh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingRemoval) onRemoveDocument(pendingRemoval.id);
                setPendingRemoval(null);
              }}
            >
              <Trash2 />
              Ya, hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Satu kategori utama: judul + dokumen + form tambah                   */
/* ------------------------------------------------------------------ */

type CategoryRowsProps = {
  group: DocumentGroup;
  readOnly: boolean;
  showErrors: boolean;
  expanded: boolean;
  onToggle: () => void;
  isAdding: boolean;
  draft: string;
  error: string | null;
  onDraftChange: (value: string) => void;
  onOpenAdd: () => void;
  onCancelAdd: () => void;
  onSubmitAdd: () => void;
  onStatusChange: (id: number, status: DocumentStatus) => void;
  onNotesChange: (id: number, notes: string) => void;
  onRequestRemoval: (doc: DocumentRow) => void;
};

function CategoryRows({
  group,
  readOnly,
  showErrors,
  expanded,
  onToggle,
  isAdding,
  draft,
  error,
  onDraftChange,
  onOpenAdd,
  onCancelAdd,
  onSubmitAdd,
  onStatusChange,
  onNotesChange,
  onRequestRemoval,
}: CategoryRowsProps) {
  const checked = group.documents.filter((d) => d.status !== null).length;
  const unanswered = group.documents.length - checked;
  const pksMissing = group.documents.some(isPksNumberMissing);
  const inputId = `add-doc-${group.key}`;

  /* Setiap kategori adalah accordion: baris judul (dengan tombol "+") + subpoin. */
  const panelId = `doc-category-${group.key}`;
  const firstRowId = group.documents.length > 0 ? `${panelId}-rows` : undefined;

  return (
    <>
      <TableRow
        id={panelId}
        className="cursor-pointer bg-primary-soft hover:bg-primary-soft/80"
        onClick={onToggle}
      >
        <TableCell className="tabular-nums font-semibold text-primary">{group.no}</TableCell>
        <TableCell colSpan={4}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={expanded ? (firstRowId ?? (isAdding ? `${panelId}-add` : undefined)) : undefined}
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-card text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform duration-150 motion-reduce:transition-none",
                    expanded && "rotate-90",
                  )}
                  strokeWidth={2.5}
                />
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{group.title}</span>
                {group.documents.length > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {checked} dari {group.documents.length} diperiksa
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Belum ada dokumen</span>
                )}
                {showErrors && unanswered > 0 && (
                  <Badge variant="danger">
                    <TriangleAlert aria-hidden="true" />
                    {unanswered} belum diberi status
                  </Badge>
                )}
                {pksMissing && (
                  <Badge variant="danger" data-pks-warning="category">
                    <TriangleAlert aria-hidden="true" />
                    {PKS_MISSING_NUMBER_TEXT}
                  </Badge>
                )}
              </span>
              <span className="sr-only">{expanded ? ", tutup daftar dokumen" : ", buka daftar dokumen"}</span>
            </button>
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2.5"
                onClick={(event) => {
                  event.stopPropagation(); // "+" tidak membuka/menutup accordion sendiri
                  onOpenAdd();
                }}
                aria-label={`Tambah dokumen pada ${group.title}`}
                aria-expanded={isAdding}
              >
                <Plus aria-hidden="true" />+
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {expanded && group.documents.length === 0 && !isAdding && (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={4} className="text-sm text-muted-foreground">
            Belum ada dokumen pada kategori ini.
            {!readOnly && " Gunakan tombol + untuk menambahkan."}
          </TableCell>
        </TableRow>
      )}

      {expanded &&
        group.documents.map((doc, index) => (
          <DocumentRowView
            key={doc.id}
            id={index === 0 ? firstRowId : undefined}
            doc={doc}
            categoryTitle={group.title}
            no={doc.label}
            readOnly={readOnly}
            showErrors={showErrors}
            onStatusChange={onStatusChange}
            onNotesChange={onNotesChange}
            onRequestRemoval={onRequestRemoval}
          />
        ))}

      {expanded && isAdding && (
        <TableRow id={`${panelId}-add`} className="bg-primary-soft/40 hover:bg-primary-soft/40">
          <TableCell />
          <TableCell colSpan={4}>
            <form
              className="space-y-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitAdd();
              }}
            >
              <label htmlFor={inputId} className="text-sm font-medium">
                Nama dokumen pada {group.title}
              </label>
              <div className="flex flex-wrap items-start gap-2">
                <Input
                  id={inputId}
                  value={draft}
                  autoFocus
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") onCancelAdd();
                  }}
                  placeholder="Mis. Surat keterangan domisili"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${inputId}-error` : undefined}
                  className="min-w-[14rem] max-w-md flex-1"
                />
                <Button type="submit" size="sm" className="h-9">
                  <Plus />
                  Tambah
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={onCancelAdd}>
                  Batal
                </Button>
              </div>
              {error && (
                <p id={`${inputId}-error`} className="flex items-center gap-1 text-xs font-medium text-danger">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
            </form>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Satu baris dokumen (subpoin kategori)                                */
/* ------------------------------------------------------------------ */

function DocumentRowView({
  id,
  doc,
  categoryTitle,
  no,
  readOnly,
  showErrors,
  onStatusChange,
  onNotesChange,
  onRequestRemoval,
}: {
  id?: string;
  doc: LabelledDocument;
  /** Kategori induk subpoin; membedakan label aksesibilitas bila nama dokumen sama di kategori lain. */
  categoryTitle: string;
  no: number | string;
  readOnly: boolean;
  showErrors: boolean;
  onStatusChange: (id: number, status: DocumentStatus) => void;
  onNotesChange: (id: number, notes: string) => void;
  onRequestRemoval: (doc: DocumentRow) => void;
}) {
  const unanswered = doc.status === null;
  const flagged = showErrors && unanswered;
  const groupName = `doc-status-${doc.id}`;
  const isPks = isPksDocument(doc);
  const pksMissing = isPksNumberMissing(doc);
  // Nama dokumen yang sama dapat muncul di beberapa kategori (mis. Underlying Transaction):
  // subitem memakai nama kategori sebagai pembeda pada label aksesibilitas.
  const accessibleName = `${doc.documentName} (${categoryTitle})`;

  return (
    <TableRow
      id={id}
      className={cn(
        "align-top",
        doc.status === "Tidak Ada" && "bg-warning-soft/70",
        (flagged || pksMissing) && "bg-danger-soft/70",
      )}
    >
      <TableCell className="tabular-nums text-muted-foreground">{no}</TableCell>
      <TableCell className="font-medium">
        <span id={`doc-label-${doc.id}`}>{doc.documentName}</span>
        {doc.custom && (
          <Badge variant="muted" className="ml-2 align-middle">
            Ditambahkan
          </Badge>
        )}
        {flagged && (
          <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-danger">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Pilih Ada atau Tidak Ada
          </span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <StatusChoice
          name={groupName}
          checked={doc.status === "Ada"}
          tone="ok"
          label={`${accessibleName}: Ada`}
          disabled={readOnly}
          onSelect={() => onStatusChange(doc.id, "Ada")}
        />
      </TableCell>
      <TableCell className="text-center">
        <StatusChoice
          name={groupName}
          checked={doc.status === "Tidak Ada"}
          tone="warn"
          label={`${accessibleName}: Tidak Ada`}
          disabled={readOnly}
          onSelect={() => onStatusChange(doc.id, "Tidak Ada")}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <Input
              value={doc.notes}
              onChange={(e) => onNotesChange(doc.id, e.target.value)}
              placeholder={
                isPks
                  ? PKS_NOTES_PLACEHOLDER
                  : doc.status === "Tidak Ada"
                    ? "Jelaskan kondisi (mis. Tidak tersedia)"
                    : KETERANGAN_PLACEHOLDER
              }
              aria-label={`Keterangan ${accessibleName}`}
              aria-invalid={pksMissing ? true : undefined}
              aria-describedby={pksMissing ? `pks-warning-${doc.id}` : undefined}
              data-pks-number={isPks ? "" : undefined}
              readOnly={readOnly}
              disabled={readOnly}
            />
            {pksMissing && (
              <p
                id={`pks-warning-${doc.id}`}
                data-pks-warning="row"
                className="mt-1 flex items-center gap-1 text-xs font-medium text-danger"
              >
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Nomor PKS wajib diisi bila Perjanjian Kerja Sama Ada.
              </p>
            )}
            {doc.status === "Tidak Ada" && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Dokumen belum tersedia
              </p>
            )}
          </div>
          {doc.custom && !readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-danger"
              onClick={() => onRequestRemoval(doc)}
              aria-label={`Hapus dokumen ${accessibleName}`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Pilihan bergaya radio dengan tanda ✓. Memakai <input type="radio"> asli
 * (name sama per baris) sehingga hanya satu status terpilih, dan panah
 * keyboard berpindah di antara Ada / Tidak Ada.
 */
function StatusChoice({
  name,
  checked,
  tone,
  label,
  disabled,
  onSelect,
}: {
  name: string;
  checked: boolean;
  tone: "ok" | "warn";
  label: string;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md border border-input bg-card text-transparent transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          !disabled && !checked && "hover:border-primary/60",
          checked &&
            (tone === "ok"
              ? "border-success bg-success-soft text-success"
              : "border-warning bg-warning-soft text-warning"),
          disabled && "opacity-80",
        )}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    </label>
  );
}
