import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateField } from "../validation/three-way-match";
import {
  countKontraByType,
  createKontraItem,
  describeKontraCounts,
  emptyKontraCounts,
  kontraItemHasData,
  kontraItemTitles,
  planKontraConfig,
  summarizeKontraChange,
  totalKontraCount,
} from "./kontra";
import { createEmptyChecklist } from "./factory";
import {
  applyKontraConfig,
  planKontraChange,
  setKontraValue,
} from "./mutations";
import { fullKontraDetail, makeKontraItem } from "./test-utils";
import type { KontraCriticalField } from "./types";

const kontraOf = (c: ReturnType<typeof createEmptyChecklist>) =>
  c.criticalFields.find((f) => f.key === "kontraGaransi") as KontraCriticalField;

describe("konfigurasi Kontra Garansi (jenis & jumlah item)", () => {
  it("beberapa jenis sekaligus dan beberapa item untuk jenis yang sama", () => {
    const plan = planKontraConfig([], { fixedAsset: 2, kendaraan: 1, cashCollateral: 0, asuransi: 1 });
    assert.deepEqual(
      plan.items.map((i) => i.type),
      ["fixedAsset", "fixedAsset", "kendaraan", "asuransi"],
    );
    assert.equal(plan.added, 4);
    assert.equal(plan.removed.length, 0);
    assert.equal(new Set(plan.items.map((i) => i.id)).size, 4, "id item unik");
    assert.deepEqual(
      [...kontraItemTitles(plan.items).values()],
      ["Fixed Asset #1", "Fixed Asset #2", "Kendaraan #1", "Asuransi (SP3) #1"],
    );
  });

  it("menambah jumlah mempertahankan item lama beserta datanya", () => {
    const filled = makeKontraItem("fixedAsset", {
      underlyingDocument: fullKontraDetail("fixedAsset"),
    });
    const plan = planKontraConfig([filled], { fixedAsset: 2, kendaraan: 1, cashCollateral: 0, asuransi: 0 });
    assert.equal(plan.items[0], filled, "objek item lama tidak berubah");
    assert.equal(plan.kept.length, 1);
    assert.equal(plan.added, 2);
    assert.equal(plan.removedWithData.length, 0);
    assert.equal(kontraItemHasData(plan.items[1]), false, "item baru kosong");
  });

  it("mengurangi jumlah melepas item TERAKHIR pada jenis itu dan melaporkan item yang berisi data", () => {
    const first = makeKontraItem("fixedAsset", { underlyingDocument: fullKontraDetail("fixedAsset") });
    const second = makeKontraItem("fixedAsset", { mak: { noShm: "SHM 2" } });
    const third = createKontraItem("fixedAsset");
    const plan = planKontraConfig([first, second, third], {
      ...emptyKontraCounts(),
      fixedAsset: 1,
    });
    assert.deepEqual(plan.items, [first]);
    assert.deepEqual(plan.removed.map((i) => i.id), [second.id, third.id]);
    assert.deepEqual(plan.removedWithData.map((i) => i.id), [second.id], "hanya item terisi butuh konfirmasi");
  });

  it("jenis lain tidak terpengaruh saat satu jenis diubah", () => {
    const fa = makeKontraItem("fixedAsset", { ptk: fullKontraDetail("fixedAsset") });
    const kv = makeKontraItem("kendaraan", { mak: fullKontraDetail("kendaraan") });
    const plan = planKontraConfig([fa, kv], { ...emptyKontraCounts(), fixedAsset: 1, kendaraan: 3 });
    assert.equal(plan.items[0], fa);
    assert.equal(plan.items[1], kv);
    assert.equal(plan.items.length, 4);
  });

  it("ringkasan jumlah dan total", () => {
    const counts = { fixedAsset: 2, kendaraan: 0, cashCollateral: 1, asuransi: 0 };
    assert.equal(totalKontraCount(counts), 3);
    assert.equal(describeKontraCounts(counts), "Fixed Asset × 2, Cash Collateral × 1");
    assert.equal(describeKontraCounts(emptyKontraCounts()), "");
    assert.deepEqual(
      countKontraByType([createKontraItem("asuransi"), createKontraItem("asuransi")]),
      { ...emptyKontraCounts(), asuransi: 2 },
    );
  });
});

describe("ringkasan perubahan Kontra Garansi (konfirmasi Ubah Pilihan)", () => {
  it("menyebut jenis, jumlah, dan judul item yang akan dihapus - juga item yang masih kosong", () => {
    const first = makeKontraItem("fixedAsset", { ptk: fullKontraDetail("fixedAsset") });
    const second = createKontraItem("fixedAsset");
    const kv = createKontraItem("kendaraan");
    const summary = summarizeKontraChange([first, second, kv], {
      ...emptyKontraCounts(),
      fixedAsset: 1,
      kendaraan: 0,
      asuransi: 2,
    });
    assert.equal(summary.removedTotal, 2);
    assert.deepEqual(
      summary.removed.map((g) => [g.label, g.count, g.titles, g.withData]),
      [
        ["Fixed Asset", 1, ["Fixed Asset #2"], 0],
        ["Kendaraan", 1, ["Kendaraan #1"], 0],
      ],
    );
    assert.deepEqual(summary.added.map((g) => [g.label, g.count]), [["Asuransi (SP3)", 2]]);
  });

  it("tidak ada yang dihapus bila jumlah naik atau tetap", () => {
    const fa = makeKontraItem("fixedAsset", { mak: fullKontraDetail("fixedAsset") });
    const same = summarizeKontraChange([fa], { ...emptyKontraCounts(), fixedAsset: 1 });
    assert.equal(same.removedTotal, 0);
    assert.deepEqual(same.added, []);
    const more = summarizeKontraChange([fa], { ...emptyKontraCounts(), fixedAsset: 3 });
    assert.equal(more.removedTotal, 0);
    assert.deepEqual(more.added.map((g) => g.count), [2]);
  });

  it("item yang berisi data dihitung pada withData", () => {
    const filled = makeKontraItem("cashCollateral", { underlyingDocument: fullKontraDetail("cashCollateral") });
    const summary = summarizeKontraChange([filled], emptyKontraCounts());
    assert.equal(summary.removed[0].withData, 1);
    assert.equal(summary.removed[0].label, "Cash Collateral");
  });
});

describe("mutasi Kontra Garansi pada checklist", () => {
  const base = createEmptyChecklist("Andi");
  const fieldId = kontraOf(base).id;

  it("applyKontraConfig membuat item kosong; setKontraValue mengisi per item, sumber, dan field", () => {
    let c = applyKontraConfig(base, fieldId, { fixedAsset: 1, kendaraan: 1, cashCollateral: 0, asuransi: 0 });
    const [fa, kv] = kontraOf(c).items;
    assert.equal(kontraOf(c).items.length, 2);
    c = setKontraValue(c, fieldId, fa.id, "ptk", "noShm", "SHM 123");
    c = setKontraValue(c, fieldId, fa.id, "ptk", "nilaiNpw", { amount: "750000000" });
    c = setKontraValue(c, fieldId, kv.id, "mak", "noBpkb", "BPKB 9");
    const items = kontraOf(c).items;
    assert.equal(items[0].values.ptk.noShm, "SHM 123");
    assert.deepEqual(items[0].values.ptk.nilaiNpw, { currency: "IDR", amount: "750000000" });
    assert.equal(items[1].values.mak.noBpkb, "BPKB 9");
    assert.equal(items[0].values.mak.noShm, "", "sumber lain tidak ikut berubah");
  });

  it("mengubah konfigurasi tidak mereset isian item yang tidak berubah", () => {
    let c = applyKontraConfig(base, fieldId, { fixedAsset: 1, kendaraan: 0, cashCollateral: 0, asuransi: 0 });
    const fa = kontraOf(c).items[0];
    c = setKontraValue(c, fieldId, fa.id, "underlyingDocument", "noShm", "SHM 777");
    c = applyKontraConfig(c, fieldId, { fixedAsset: 2, kendaraan: 1, cashCollateral: 1, asuransi: 1 });
    const items = kontraOf(c).items;
    assert.equal(items.length, 5);
    assert.equal(items[0].id, fa.id);
    assert.equal(items[0].values.underlyingDocument.noShm, "SHM 777");
  });

  it("planKontraChange memberi tahu bila pengurangan menghapus item berisi (butuh konfirmasi)", () => {
    let c = applyKontraConfig(base, fieldId, { fixedAsset: 2, kendaraan: 0, cashCollateral: 0, asuransi: 0 });
    const second = kontraOf(c).items[1];
    c = setKontraValue(c, fieldId, second.id, "ptk", "atasNama", "PT A");
    const plan = planKontraChange(c, fieldId, { ...emptyKontraCounts(), fixedAsset: 1 });
    assert.ok(plan);
    assert.deepEqual(plan.removedWithData.map((i) => i.id), [second.id]);
    // Hanya merencanakan: data checklist tetap utuh sampai applyKontraConfig dipanggil.
    assert.equal(kontraOf(c).items.length, 2);
  });

  it("nilai nominal Kontra dibandingkan sebagai angka walau format berbeda", () => {
    let c = applyKontraConfig(base, fieldId, { fixedAsset: 0, kendaraan: 1, cashCollateral: 0, asuransi: 0 });
    const kv = kontraOf(c).items[0];
    const detail = fullKontraDetail("kendaraan");
    for (const source of ["underlyingDocument", "mak", "ptk"] as const) {
      for (const [key, value] of Object.entries(detail)) {
        if (key === "nilaiKendaraan") continue;
        c = setKontraValue(c, fieldId, kv.id, source, key, value);
      }
    }
    c = setKontraValue(c, fieldId, kv.id, "underlyingDocument", "nilaiKendaraan", { amount: "500000000" });
    c = setKontraValue(c, fieldId, kv.id, "mak", "nilaiKendaraan", { amount: "500000000.00" });
    c = setKontraValue(c, fieldId, kv.id, "ptk", "nilaiKendaraan", { amount: "500000000" });
    assert.equal(evaluateField(kontraOf(c)).state, "SESUAI");
    c = setKontraValue(c, fieldId, kv.id, "ptk", "nilaiKendaraan", { amount: "400000000" });
    assert.equal(evaluateField(kontraOf(c)).state, "TIDAK SESUAI");
  });
});
