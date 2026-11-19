// node --test test/abruf.test.mjs   — prüft Abruf und Mitteilungen mit nachgebauten FLBB-Daten (Format wie am 19.11.2026 gesehen).
import test from "node:test";
import assert from "node:assert/strict";
import { icsLesen, spielAusEreignis, teamsTrennen, klubLinks, icsCodeFuer, tabellenLesen, tabelleRechnen, mannschaftHolen, aktuellesLabel, icsUrl, BASIS } from "../tools/abruf.mjs";
import { ereignisse } from "../tools/mitteilungen.mjs";
import { luxMs, luxZeit } from "../tools/zeit.mjs";

const ev = (id, start, sum, loc = "Hall Sportif,op der Stenkel,  6752 Heffingen") =>
  `BEGIN:VEVENT\r\nSUMMARY:${sum}\r\nUID:2026_${id}@basketball.lu\r\nLOCATION:${loc}\r\nDESCRIPTION:Game number: ${id}\\nNavigation:https://goo.gl/maps/WaYB4JEQk6v\\nCLASS:PUBLIC\r\nDTSTART:${start}\r\nDTEND:${start}\r\nEND:VEVENT\r\n`;
const cal = (...e) => "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:FLBB / HEF (SH)\r\n" + e.join("") + "END:VCALENDAR\r\n";
const L = "\\n[M-Nationale 2:Tour qualificatif]";

const HEF = cal(
  ev(1201009, "20260919T200000", "Black Frogs Schieren-US Heffingen (37-113) " + L, "Hall Sportif,route de Stegen,  7465 Schieren"),
  ev(1201093, "20260923T203000", "US Heffingen-CFBB U18 (87-58) " + L),
  ev(1012002, "20260930T203000", "US Heffingen-Bascharage Hedgehogs (66-59) \\n[M-Loterie Nationale Clux:1/16 finales]"),
  ev(1201010, "20261120T203000", "US Heffingen-Black Frogs Schieren  " + L),
);
const FRO = cal(
  ev(1201009, "20260919T200000", "Black Frogs Schieren-US Heffingen (37-113) " + L),
  ev(1201050, "20261003T200000", "Black Frogs Schieren-CFBB U18 (60-70) " + L),
  ev(1201010, "20261120T203000", "US Heffingen-Black Frogs Schieren  " + L),
);
const U18 = cal(
  ev(1201093, "20260923T203000", "US Heffingen-CFBB U18 (87-58) " + L),
  ev(1201050, "20261003T200000", "Black Frogs Schieren-CFBB U18 (60-70) " + L),
);
const SEITE = `<div><img src="/layout/themes/flbb/images/Logos/HEF.jpg"><a href="https://www.luxembourg.basketball/club/HEF/us-heffingen">US Heffingen</a> 87
<a href="https://www.luxembourg.basketball/match/1201093/2026-09-23/us-heffingen/cfbb-u18/m-nationale-2tour-qualificatif"></a> 58
<a href="https://www.luxembourg.basketball/club/U18/cfbb-u18">CFBB U18</a>
<a href="https://www.luxembourg.basketball/club/FRO/black-frogs-schieren"><span>Black Frogs Schieren</span></a></div>`;
const TAB = `<table><tr><th></th><th>Equipe</th><th>M</th><th>G</th><th>P</th><th>NUL/FORF</th><th>OFF-DEF</th><th>P.EGAL/DIFF</th><th>P.EGAL 2/DIFF 2</th><th>PTS</th></tr>
<tr><td>1</td><td><img src=x> <a href="/club/HEF/us-heffingen">US Heffingen</a></td><td>2</td><td>2</td><td>0</td><td>0/0</td><td>200-95</td><td>0 /0</td><td>0/0</td><td>4</td></tr>
<tr><td>2</td><td>CFBB U18</td><td>2</td><td>1</td><td>1</td><td>0/0</td><td>128-147</td><td>0 /0</td><td>0/0</td><td>3</td></tr>
<tr><td>3</td><td>Black Frogs Schieren</td><td>2</td><td>0</td><td>2</td><td>0/0</td><td>97-183</td><td>0 /0</td><td>0/0</td><td>2</td></tr></table>`;

test("ICS lesen", () => {
  const e = icsLesen(HEF);
  assert.equal(e.length, 4);
  const s = spielAusEreignis(e[1], new Set(["US Heffingen"]));
  assert.deepEqual([s.id, s.d, s.h, s.a, s.hs, s.as, s.ort, s.wett, s.runde, s.pokal, s.zeit], [1201093, "2026-09-23T20:30", "US Heffingen", "CFBB U18", 87, 58, "Heffingen", "Nationale 2", "Tour qualificatif", false, true]);
  assert.equal(s.nav, "https://goo.gl/maps/WaYB4JEQk6v");
  assert.equal(s.adr, "Hall Sportif, op der Stenkel, 6752 Heffingen");
  const k = spielAusEreignis(e[3], new Set());
  assert.deepEqual([k.h, k.a, k.hs], ["US Heffingen", "Black Frogs Schieren", null]);
  assert.equal(spielAusEreignis(e[2], new Set()).pokal, true);
});
test("Namen mit Bindestrich", () => {
  assert.deepEqual(teamsTrennen("Basket-Club Foo-US Heffingen B", new Set()), ["Basket-Club Foo", "US Heffingen B"]);
  assert.deepEqual(teamsTrennen("A-B-C", new Set(["A-B", "C"])), ["A-B", "C"]);
});
test("Vereinslinks und Kalendercode", () => {
  const l = klubLinks(SEITE);
  assert.equal(l.get("Black Frogs Schieren").code, "FRO");
  assert.equal(icsCodeFuer("CFBB U18", l, "SH"), "SHU18");
  assert.equal(icsCodeFuer("US Heffingen B", klubLinks('<a href="/club/HEF/us-heffingen-b">US Heffingen B</a>'), "SH"), "SHHEFB");
  assert.equal(icsCodeFuer("Black Frogs Schieren B", l, "SH"), "SHFROB");
});
test("offizielle Tabelle", () => {
  const t = tabellenLesen(TAB)[0];
  assert.deepEqual(t[0], { pl: 1, n: "US Heffingen", sp: 2, s: 2, nl: 0, pf: 200, pa: 95, pkt: 4 });
  assert.equal(t.length, 3);
});
test("Tabelle rechnen", () => {
  const t = tabelleRechnen([{ h: "A", a: "B", hs: 80, as: 70 }, { h: "B", a: "C", hs: 60, as: 50 }, { h: "C", a: "A", hs: 90, as: 40 }, { h: "A", a: "C", hs: null, as: null }]);
  assert.ok(t.every(z => z.sp === 2 && z.pkt === 3));
});
test("ganze Mannschaft mit Klasse", async () => {
  const daten = { [icsUrl("SHHEF")]: HEF, [icsUrl("SHFRO")]: FRO, [icsUrl("SHU18")]: U18,
    [`${BASIS}/c/calendrier-resultat/1201/x`]: SEITE, [`${BASIS}/c/classement/1201/x`]: TAB };
  const laden = async u => { if (!(u in daten)) throw new Error("404 " + u); return daten[u]; };
  const m = await mannschaftHolen({ key: "men-a", reiter: "Men A", ics: "SHHEF" }, "2026-11-19T08:00", { ics: new Map(), seiten: new Map() }, laden);
  assert.equal(m.n, "US Heffingen");
  assert.equal(m.spiele.length, 4);
  assert.equal(m.klasse.n, "Nationale 2");
  assert.equal(m.klasse.spiele.length, 4);
  assert.equal(m.klasse.quelle, "FLBB");
  assert.equal(m.klasse.unvollstaendig, false);
  const ohneTab = await mannschaftHolen({ key: "men-a", reiter: "Men A", ics: "SHHEF" }, "2026-11-19T08:00", { ics: new Map(), seiten: new Map() }, async u => { if (u.includes("classement")) throw new Error("x"); return laden(u); });
  assert.equal(ohneTab.klasse.quelle, "berechnet");
  assert.deepEqual(ohneTab.klasse.tabelle.map(z => z.n), ["US Heffingen", "CFBB U18", "Black Frogs Schieren"]);
});
test("Mitteilungen", () => {
  const sp = (o) => ({ id: 1, d: "2026-11-20T20:30", zeit: true, h: "US Heffingen", a: "Black Frogs Schieren", hs: null, as: null, ort: "Heffingen", pokal: false, ...o });
  const alt = { teams: [{ key: "men-a", reiter: "Men A", n: "US Heffingen", spiele: [sp(), sp({ id: 2, d: "2026-11-28T20:00" }), sp({ id: 4, d: "2026-11-19T20:30" })] }] };
  const neu = { teams: [{ key: "men-a", reiter: "Men A", n: "US Heffingen", spiele: [sp({ hs: 90, as: 60, d: "2026-11-18T20:30" }), sp({ id: 2, d: "2026-11-28T19:00" }), sp({ id: 3, d: "2026-12-05T20:00" }), sp({ id: 4, d: "2026-11-19T20:30" })],
    klasse: { tabelle: [{ n: "US Heffingen", pl: 4 }] } }] };
  const now = luxMs("2026-11-19T08:00");
  const m = ereignisse(alt, neu, { ereignisse: [] }, now);
  const arten = m.ereignisse.map(e => e.art).sort();
  assert.deepEqual(arten, ["ergebnis", "heute", "neu", "uhrzeit"]);
  assert.match(m.ereignisse.find(e => e.art === "ergebnis").text, /90:60 .* Sieg! · jetzt 4\. Platz/);
  assert.equal(luxZeit(Date.parse(m.ereignisse.find(e => e.art === "heute").ab)), "2026-11-19T09:00");
  // zweiter Lauf: nichts doppelt
  assert.equal(ereignisse(neu, neu, m, now + 60e3).ereignisse.length, 4);
  // erster Lauf überhaupt: nur Spieltag
  assert.deepEqual(ereignisse(null, neu, null, now).ereignisse.map(e => e.art), ["heute"]);
});
