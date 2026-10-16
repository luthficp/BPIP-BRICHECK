import { formatDate } from "@/lib/export/format";

type SignatureSectionProps = {
  adkName: string;
  /** Tanggal checklist diselesaikan (ISO); tampil pada kolom ADK. */
  adkDate?: string;
};

/**
 * Tanda tangan pada dokumen cetak.
 * ADK: nama & tanggal terisi dari sistem; tanda tangan basah di atas kertas.
 * SOK: seluruhnya dikosongkan untuk diisi tangan (tanpa electronic signature).
 */
export function SignatureSection({ adkName, adkDate }: SignatureSectionProps) {
  return (
    <section className="print-avoid-break grid grid-cols-2 gap-4" aria-label="Tanda tangan">
      <SignatureBox
        heading="Diperiksa Oleh"
        role="Administrasi Operasional Kredit (ADK)"
        name={adkName}
        date={adkDate ? formatDate(adkDate) : ""}
      />
      <SignatureBox
        heading="Diketahui Oleh"
        role="Supervisor Operasional Kredit (SOK)"
        name=""
        date=""
      />
    </section>
  );
}

function SignatureBox({
  heading,
  role,
  name,
  date,
}: {
  heading: string;
  role: string;
  name: string;
  date: string;
}) {
  return (
    <div className="border border-neutral-700">
      <div className="border-b border-neutral-700 bg-[#00529c] px-3 py-1.5 text-center text-white">
        <p className="text-[11px] font-bold uppercase tracking-wide">{heading}</p>
        <p className="text-[10px] font-semibold">{role}</p>
      </div>
      <dl className="space-y-1.5 px-3 py-2 text-[11px]">
        <Row label="Nama" value={name} />
        <Row label="Tanggal" value={date} />
        <div>
          <dt className="font-medium">Tanda tangan</dt>
          <dd className="h-[22mm]" aria-label={`Ruang tanda tangan ${role}`} />
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end gap-1">
      <dt className="w-16 shrink-0 font-medium">{label}</dt>
      <dd className="flex-1 border-b border-dotted border-neutral-500 pb-0.5">
        <span className="mr-1">:</span>
        {value || " "}
      </dd>
    </div>
  );
}
