"use client";

import { TriangleAlert } from "lucide-react";

import { SokOpinionNotice } from "@/components/checklist/sok-opinion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BankGuaranteeChecklist } from "@/lib/checklist/types";
import { isFilled, summarizeValidation } from "@/lib/validation/three-way-match";

type AdkOpinionProps = {
  checklist: BankGuaranteeChecklist;
  readOnly: boolean;
  /** true setelah ADK mencoba lanjut tetapi opini masih kosong. */
  showErrors: boolean;
  onChange: (value: string) => void;
};

export function AdkOpinion({ checklist, readOnly, showErrors, onChange }: AdkOpinionProps) {
  const validation = summarizeValidation(checklist.criticalFields);
  const docsAda = checklist.documentVerification.filter((d) => d.status === "Ada").length;
  const docsTidakAda = checklist.documentVerification.filter((d) => d.status === "Tidak Ada");
  const invalid = showErrors && !isFilled(checklist.opiniAdk);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">3. Opini ADK</CardTitle>
        <CardDescription>
          Opini merupakan judgement ADK dan tidak diisi otomatis oleh sistem.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-2">
            <Label htmlFor="opini-adk">
              Opini ADK
              <span className="ml-0.5 text-danger" aria-hidden="true">
                *
              </span>
            </Label>
            <Textarea
              id="opini-adk"
              value={checklist.opiniAdk}
              onChange={(e) => onChange(e.target.value)}
              readOnly={readOnly}
              disabled={readOnly}
              rows={10}
              className="min-h-[14rem] leading-relaxed"
              placeholder="Tuliskan hasil pemeriksaan, temuan, dan kesimpulan atas pengajuan Bank Garansi."
              aria-required="true"
              aria-invalid={invalid ? true : undefined}
              aria-describedby="opini-adk-help"
            />
            <p
              id="opini-adk-help"
              className={
                invalid ? "text-xs font-medium text-danger" : "text-xs text-muted-foreground"
              }
            >
              {invalid
                ? "Opini ADK wajib diisi sebelum melanjutkan."
                : "Dapat memuat hasil verifikasi dokumen, hasil validasi critical field, penjelasan atas ketidaksesuaian, hal yang perlu diperhatikan, dan kesimpulan ADK."}
            </p>
          </div>

          <aside
            aria-label="Ringkasan pemeriksaan"
            className="h-fit space-y-3 rounded-md border bg-muted/30 p-4 text-sm"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ringkasan pemeriksaan
            </h4>
            <div>
              <p className="font-medium">Dokumen</p>
              <p className="text-muted-foreground">
                {docsAda} ada, {docsTidakAda.length} tidak ada
              </p>
              {docsTidakAda.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-warning">
                  {docsTidakAda.map((d) => (
                    <li key={d.id}>{d.documentName}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-medium">Critical Field</p>
              <p className="text-muted-foreground">
                {validation.match} sesuai, {validation.mismatch} tidak sesuai
                {validation.incomplete > 0 ? `, ${validation.incomplete} belum lengkap` : ""}
              </p>
              {validation.mismatchLabels.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs font-medium text-danger">
                  {validation.mismatchLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        {validation.mismatch > 0 && (
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              Terdapat {validation.mismatch} critical field yang tidak sesuai. Ketidaksesuaian tidak
              memblokir penyelesaian checklist, tetapi mohon jelaskan temuan dan tindak lanjutnya
              pada Opini ADK.
            </AlertDescription>
          </Alert>
        )}

        <SokOpinionNotice />
      </CardContent>
    </Card>
  );
}
