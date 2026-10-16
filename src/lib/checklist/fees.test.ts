import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateField } from "../validation/three-way-match";
import { DEFAULT_FEE_COMPONENTS } from "./config";
import { createEmptyChecklist } from "./factory";
import {
  MAX_CUSTOM_FEE_COMPONENTS,
  MAX_FEE_NAME_LENGTH,
  cleanFeeName,
  feeComponentHasData,
  getFeeComponents,
  validateFeeName,
} from "./fees";
import { addFeeComponent, removeFeeComponent, setFeeValue } from "./mutations";
import { makeDefaultFees } from "./test-utils";
import type { BankGuaranteeChecklist, FeesCriticalField } from "./types";

const biayaOf = (c: BankGuaranteeChecklist): FeesCriticalField => {
  const field = c.criticalFields.find((f) => f.key === "biaya");
  assert.ok(field && field.key === "biaya");
  return field;
};

const SOURCES = ["underlyingDocument", "ptk", "mak"] as const;

describe("Biaya: komponen awal", () => {
  it("hanya Provisi dan Administrasi (tanpa Notaris / Lainnya), identik di tiga sumber", () => {
    const biaya = biayaOf(createEmptyChecklist("Andi"));
    assert.deepEqual(
      getFeeComponents(biaya).map((c) => [c.id, c.label, c.custom]),
      [
        ["provisi", "Provisi", false],
        ["administrasi", "Administrasi", false],
      ],
    );
    assert.deepEqual(DEFAULT_FEE_COMPONENTS.map((c) => c.label), ["Provisi", "Administrasi"]);
    for (const source of SOURCES) {
      assert.deepEqual(biaya[source], { provisi: "", administrasi: "" });
    }
  });

  it("dua komponen terisi lengkap dan sama => SESUAI; berbeda => TIDAK SESUAI; kosong => BELUM LENGKAP", () => {
    const same: [string, string] = ["500000", "250000"];
    assert.equal(evaluateField(makeDefaultFees(same, same, same)).state, "SESUAI");
    assert.equal(
      evaluateField(makeDefaultFees(same, ["600000", "250000"], same)).state,
      "TIDAK SESUAI",
    );
    assert.equal(evaluateField(makeDefaultFees(same, same, ["500000", ""])).state, "BELUM LENGKAP");
  });
});

describe("Biaya: tambah field (+) dibuat serentak di tiga sumber", () => {
  const empty = createEmptyChecklist("Andi");
  const biaya = biayaOf(empty);

  it("nama bebas ditambahkan ke daftar bersama dan nilai kosong di Underlying Acuan, Memorandum, dan Putusan", () => {
    const result = addFeeComponent(empty, biaya.id, "  Asuransi   Kredit ");
    assert.ok(result.ok);
    const next = biayaOf(result.checklist);
    assert.deepEqual(getFeeComponents(next).map((c) => c.label), ["Provisi", "Administrasi", "Asuransi Kredit"]);
    const added = getFeeComponents(next).at(-1)!;
    assert.equal(added.custom, true);
    assert.equal(added.id, result.componentId);
    for (const source of SOURCES) {
      assert.equal(next[source][added.id], "");
      // Urutan kunci nilai = urutan komponen yang sama pada ketiga sumber.
      assert.deepEqual(Object.keys(next[source]), getFeeComponents(next).map((c) => c.id));
    }
  });

  it("field tambahan ikut dibandingkan: berbeda => TIDAK SESUAI dengan alasan menyebut nama field; kosong => BELUM LENGKAP", () => {
    const result = addFeeComponent(empty, biaya.id, "Asuransi Kredit");
    assert.ok(result.ok);
    const id = result.componentId;
    let c = result.checklist;
    const fill = (source: (typeof SOURCES)[number], provisi: string, administrasi: string, extra: string) => {
      c = setFeeValue(c, biaya.id, source, { provisi, administrasi, [id]: extra });
    };
    fill("underlyingDocument", "500000", "250000", "100000");
    fill("ptk", "500000", "250000", "100000");
    fill("mak", "500000", "250000", "");
    assert.equal(evaluateField(biayaOf(c)).state, "BELUM LENGKAP");

    fill("mak", "500000", "250000", "120000");
    const evaluation = evaluateField(biayaOf(c));
    assert.equal(evaluation.state, "TIDAK SESUAI");
    assert.deepEqual(evaluation.reasons, [
      "Asuransi Kredit: Memorandum Analisa Bank Garansi berbeda dengan Underlying Document",
    ]);
    assert.deepEqual(
      evaluation.components.map((component) => [component.label, component.state]),
      [
        ["Provisi", "SESUAI"],
        ["Administrasi", "SESUAI"],
        ["Asuransi Kredit", "TIDAK SESUAI"],
      ],
    );

    fill("mak", "500000", "250000", "100000");
    assert.equal(evaluateField(biayaOf(c)).state, "SESUAI");
  });

  it("nama kosong, kembar (tanpa peduli kapitalisasi/spasi), terlalu panjang, dan melebihi batas ditolak", () => {
    const components = getFeeComponents(biaya);
    assert.match(validateFeeName("", components) ?? "", /wajib diisi/);
    assert.match(validateFeeName("   ", components) ?? "", /wajib diisi/);
    assert.match(validateFeeName("provisi", components) ?? "", /sudah ada/);
    assert.match(validateFeeName("  ADMINISTRASI ", components) ?? "", /sudah ada/);
    assert.match(validateFeeName("x".repeat(MAX_FEE_NAME_LENGTH + 1), components) ?? "", /maksimal/);
    assert.equal(validateFeeName("x".repeat(MAX_FEE_NAME_LENGTH), components), null);

    for (const name of ["", "provisi", "Administrasi "]) {
      const result = addFeeComponent(empty, biaya.id, name);
      assert.equal(result.ok, false);
    }
    // Nama yang sama dengan komponen tambahan yang ada juga ditolak.
    const once = addFeeComponent(empty, biaya.id, "Notaris");
    assert.ok(once.ok);
    assert.equal(addFeeComponent(once.checklist, biaya.id, " notaris").ok, false);

    let c = empty;
    for (let index = 0; index < MAX_CUSTOM_FEE_COMPONENTS; index += 1) {
      const result = addFeeComponent(c, biaya.id, `Biaya ${index}`);
      assert.ok(result.ok, `ke-${index}`);
      c = result.checklist;
    }
    const over = addFeeComponent(c, biaya.id, "Biaya terlalu banyak");
    assert.equal(over.ok, false);
    assert.equal(biayaOf(c).components.length, 2 + MAX_CUSTOM_FEE_COMPONENTS);
  });

  it("cleanFeeName merapikan spasi", () => {
    assert.equal(cleanFeeName("  Biaya   Survey  "), "Biaya Survey");
  });
});

describe("Biaya: hapus field tambahan dari ketiga sumber sekaligus", () => {
  function withExtra() {
    const empty = createEmptyChecklist("Andi");
    const biaya = biayaOf(empty);
    const result = addFeeComponent(empty, biaya.id, "Notaris");
    assert.ok(result.ok);
    let c = result.checklist;
    for (const source of SOURCES) {
      c = setFeeValue(c, biaya.id, source, { provisi: "1", administrasi: "2", [result.componentId]: "3" });
    }
    return { c, biayaId: biaya.id, extraId: result.componentId };
  }

  it("menghapus nama, nilai, dan referensi dari semua sumber (tanpa nilai yatim)", () => {
    const { c, biayaId, extraId } = withExtra();
    assert.equal(feeComponentHasData(biayaOf(c), extraId), true);
    const next = biayaOf(removeFeeComponent(c, biayaId, extraId));
    assert.deepEqual(getFeeComponents(next).map((x) => x.label), ["Provisi", "Administrasi"]);
    for (const source of SOURCES) {
      assert.deepEqual(Object.keys(next[source]).sort(), ["administrasi", "provisi"]);
      assert.equal(next[source].provisi, "1");
      assert.equal(next[source].administrasi, "2");
    }
    const evaluation = evaluateField(next);
    assert.deepEqual(evaluation.components.map((x) => x.id), ["provisi", "administrasi"]);
    assert.equal(evaluation.state, "SESUAI", "tidak ada status yatim dari field yang sudah dihapus");
  });

  it("Provisi dan Administrasi tidak dapat dihapus; id tak dikenal tidak mengubah apa pun", () => {
    const { c, biayaId } = withExtra();
    for (const id of ["provisi", "administrasi", "tidak-ada"]) {
      assert.deepEqual(removeFeeComponent(c, biayaId, id), c);
    }
  });

  it("field kosong dapat dihapus tanpa konfirmasi (feeComponentHasData false)", () => {
    const empty = createEmptyChecklist("Andi");
    const biaya = biayaOf(empty);
    const added = addFeeComponent(empty, biaya.id, "Lainnya");
    assert.ok(added.ok);
    assert.equal(feeComponentHasData(biayaOf(added.checklist), added.componentId), false);
    const next = removeFeeComponent(added.checklist, biaya.id, added.componentId);
    assert.deepEqual(biayaOf(next).components, biaya.components);
  });

  it("hapus lalu tambah lagi dengan nama sama: dimulai kosong (tidak menghidupkan nilai lama)", () => {
    const { c, biayaId, extraId } = withExtra();
    const removed = removeFeeComponent(c, biayaId, extraId);
    const again = addFeeComponent(removed, biayaId, "Notaris");
    assert.ok(again.ok);
    for (const source of SOURCES) assert.equal(biayaOf(again.checklist)[source][again.componentId], "");
  });
});
