// node --test test/worker.test.mjs — Worker mit nachgebauter D1-Datenbank (node:sqlite)
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker, { passt, abrufFaellig } from "../tools/cloudflare-worker.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: sql => stmt(sql), batch: async l => { const r = []; for (const s of l) r.push(await s.run()); return r; } };
}
const env = { DB: d1(), ADMIN_CODE: "Hiefenech-2026" };
const rufe = async (q, body) => {
  const r = await worker.fetch(new Request("https://w.example/?" + q, body ? { method: "POST", body: JSON.stringify(body) } : {}), env);
  return { status: r.status, j: r.status === 204 ? null : JSON.parse(await r.text()) };
};

test("Trainer-Bereich: Chef, Trainer, Termine, News", async () => {
  assert.equal((await rufe("coach=einloesen", { code: "falsch" })).status, 403);
  const chef = (await rufe("coach=einloesen", { code: "hiefenech 2026" })).j;
  assert.equal(chef.rolle, "verwalter");
  const neu = (await rufe("coach=person", { k: chef.k, p: { name: "Tom", rolle: "trainer", teams: ["u14"] } })).j;
  assert.match(neu.code, /^[A-Z2-9]{8}$/);
  const tom = (await rufe("coach=einloesen", { code: neu.code.toLowerCase() })).j;
  assert.deepEqual([tom.name, tom.teams], ["Tom", ["u14"]]);
  assert.equal((await rufe("coach=einloesen", { code: neu.code })).status, 403, "Code nur einmal");
  const t = { team: "u14", art: "Turnier", datum: "2099-01-10", zeit: "10:00", ort: "Heffingen", gegner: "Hallenturnier" };
  assert.equal((await rufe("coach=termin", { k: tom.k, t: { ...t, team: "men-a" } })).status, 403, "fremde Mannschaft");
  const id = (await rufe("coach=termin", { k: tom.k, t, reiter: "U14" })).j.id;
  assert.ok(id);
  assert.equal((await rufe("coach=termin", { k: tom.k, t: { ...t, datum: "2020-01-01" } })).status, 400);
  assert.equal((await rufe("coach=news", { k: tom.k, n: { titel: "Für alle" } })).status, 403, "Vereins-News nur Verwalter");
  assert.equal((await rufe("coach=news", { k: tom.k, n: { titel: "U14: Trikots", team: "u14" } })).status, 200);
  assert.equal((await rufe("coach=news", { k: chef.k, n: { titel: "Weihnachtsfeier", text: "Am 19.12. in der Halle", link: "https://www.facebook.com/USHeffingen" } })).status, 200);
  const liste = (await rufe("coach=liste")).j;
  assert.equal(liste.termine.length, 1);
  assert.equal(liste.termine[0].von, undefined, "kein Trainer im öffentlichen Teil");
  assert.deepEqual(liste.news.map(n => n.titel).sort(), ["U14: Trikots", "Weihnachtsfeier"]);
  // absagen
  assert.equal((await rufe("coach=termin", { k: tom.k, t: { ...t, id, abgesagt: true } })).status, 200);
  assert.equal((await rufe("coach=liste")).j.termine[0].abgesagt, 1);
  // Personen, sperren
  assert.equal((await rufe("coach=personen", { k: tom.k })).status, 403);
  const pers = (await rufe("coach=personen", { k: chef.k })).j.personen;
  assert.equal(pers.find(p => p.name === "Tom").geraete, 1);
  await rufe("coach=sperren", { k: chef.k, id: pers.find(p => p.name === "Tom").id });
  assert.equal((await rufe("coach=ich", { k: tom.k })).status, 401);
});

test("Zähler und Zahlen-Seite", async () => {
  assert.equal((await rufe("zaehle=1&neu=1&erst=1&art=app&reiter=Men%20A")).status, 204);
  assert.equal((await rufe("angesehen=1&reiter=U14")).status, 204);
  const r = await worker.fetch(new Request("https://w.example/?zahlen"), env);
  const html = await r.text();
  assert.match(html, /Men A/);
  assert.match(html, /U14/);
});

test("Push-Wahl", () => {
  assert.equal(passt('{"je":{"u14":["trainer","news"]}}', { team: "u14", art: "trainer" }), true);
  assert.equal(passt('{"je":{"u14":["news"]}}', { team: "verein", art: "news" }), true);
  assert.equal(passt('{"je":{"u14":["heute"]}}', { team: "verein", art: "news" }), false);
  assert.equal(abrufFaellig(Date.parse("2026-11-21T16:45:00+01:00")), true);
});
