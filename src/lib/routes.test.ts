import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { checklistRoute, ROUTE_FAQ, ROUTE_HOME, ROUTE_TASKS } from "./routes";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(srcRoot, path), "utf8");

describe("Home sebagai halaman awal", () => {
  it("rute utama: Home di '/', Task Monitoring di '/tasks', FAQ di '/faq'", () => {
    assert.equal(ROUTE_HOME, "/");
    assert.equal(ROUTE_TASKS, "/tasks");
    assert.equal(ROUTE_FAQ, "/faq");
    assert.equal(checklistRoute("abc"), "/checklist/abc");
  });

  it("halaman '/' menampilkan Home, sedangkan daftar task pindah ke '/tasks'", () => {
    assert.match(read("app/page.tsx"), /HomeView/);
    assert.doesNotMatch(read("app/page.tsx"), /TaskTable|useChecklists/);
    assert.ok(existsSync(join(srcRoot, "app/tasks/page.tsx")));
    assert.match(read("app/tasks/page.tsx"), /TaskTable/);
  });

  it("Home memakai dialog Create Checklist yang sama (tanpa alur ganda) dan menautkan fitur yang ada", () => {
    const home = read("components/home/home-view.tsx");
    assert.match(home, /CreateChecklistDialog/);
    assert.match(home, /ROUTE_TASKS/);
    // Tidak ada pembuatan checklist atau penyimpanan sendiri di Home.
    assert.doesNotMatch(home, /createEmptyChecklist|checklistRepository/);
  });

  it("Home: satu tombol utama 'Mulai Verifikasi' + satu aksi sekunder, tanpa data dummy atau tautan ganda", () => {
    const home = read("components/home/home-view.tsx");
    assert.match(home, /HOME_PRIMARY_CTA = "Mulai Verifikasi"/);
    assert.equal((home.match(/data-home-cta="primary"/g) ?? []).length, 1);
    assert.equal((home.match(/data-home-cta="secondary"/g) ?? []).length, 1);
    // Tautan FAQ sudah ada di header; Home tidak menduplikasinya.
    assert.doesNotMatch(home, /ROUTE_FAQ/);
    // Tidak boleh ada statistik/jumlah task atau pembacaan data task di Home.
    assert.doesNotMatch(home, /useChecklists|checklistRepository|\.length\s*}\s*task/i);
  });

  it("header menautkan Home, Task Monitoring, FAQ; tombol kembali di checklist menuju Task Monitoring", () => {
    const header = read("components/app-header.tsx");
    for (const route of ["ROUTE_HOME", "ROUTE_TASKS", "ROUTE_FAQ"]) assert.match(header, new RegExp(route));
    const workspace = read("components/checklist/checklist-workspace.tsx");
    assert.doesNotMatch(workspace, /<Link href="\/">/);
    assert.match(workspace, /<Link href=\{ROUTE_TASKS\}>/);
  });
});
