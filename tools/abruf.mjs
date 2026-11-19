// Holt Spiele, Ergebnisse und Tabellen aller Mannschaften der US Heffingen von der FLBB
// (luxembourg.basketball) und legt sie als data/heffingen.json ab (gelesen von index.html),
// dazu data/mitteilungen.json (gelesen vom Cloudflare-Worker, siehe tools/cloudflare-worker.js).
//
// Quellen (ohne Anmeldung):
//  - Kalender je Mannschaft (ICS): Termine, Halle, Ergebnis in Klammern im Titel, Spielnummer in der UID.
//  - Seite „Calendrier et résultats“ des Wettbewerbs: Namen und Vereinscodes aller Mannschaften der Klasse
//    (damit holen wir die Kalender der Gegner und haben so alle Spiele der Klasse samt Ergebnis).
//  - Seite „Classement“: offizielle Tabelle. Passt sie nicht eindeutig zur Klasse, rechnet das Skript selbst.
//
// Aufruf: node tools/abruf.mjs   (Node 20+, keine Abhängigkeiten)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { TEAMS, VEREIN } from "./teams.mjs";
import { ereignisse } from "./mitteilungen.mjs";
import { luxZeit } from "./zeit.mjs";

export const BASIS = "https://www.luxembourg.basketball";
export const icsUrl = code => `${BASIS}/layout/themes/flbb/calendar/${code}.ics`;

// ---------- Zeit ----------
export { luxZeit };

// ---------- ICS ----------
const ICS_UNESC = s => s.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
export function icsLesen(text) {
  const zeilen = String(text).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const ev = [];
  let cur = null;
  for (const z of zeilen) {
    if (z === "BEGIN:VEVENT") { cur = {}; continue; }
    if (z === "END:VEVENT") { if (cur) ev.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = z.indexOf(":");
    if (i < 0) continue;
    const key = z.slice(0, i).split(";")[0].toUpperCase();
    cur[key.toLowerCase()] = ICS_UNESC(z.slice(i + 1));
    if (key === "DTSTART" && /Z$/.test(z)) cur.utc = true;
  }
  return ev;
}

// „US Heffingen-CFBB U18“ → ["US Heffingen", "CFBB U18"]. Namen können selbst „-“ enthalten,
// darum gewinnt die Trennstelle, an der beide (oder wenigstens eine) Seite ein bekannter Name ist.
const IST_WIR = /^US Heffingen( [A-F])?$/;
export function teamsTrennen(kopf, namen = new Set()) {
  const stellen = [];
  for (let i = 0; i < kopf.length; i++) if (kopf[i] === "-") stellen.push([kopf.slice(0, i).trim(), kopf.slice(i + 1).trim()]);
  if (!stellen.length) return [kopf.trim(), ""];
  const bekannt = n => namen.has(n) || IST_WIR.test(n);
  return stellen.find(([l, r]) => namen.has(l) && namen.has(r))
    || stellen.find(([l, r]) => bekannt(l) && bekannt(r))
    || stellen.find(([l, r]) => bekannt(l) || bekannt(r))
    || (kopf.includes(" - ") ? kopf.split(" - ").map(s => s.trim()).slice(0, 2) : null)
    || stellen[0];
}

export const istPokal = id => String(id)[1] === "0";   // FLBB: 1011, 1024, 2011, 3011 … sind Pokale, x1xx/x2xx … Meisterschaften

export function spielAusEreignis(e, namen) {
  const id = +((e.uid || "").match(/(\d{5,})@/)?.[1] || (e.description || "").match(/Game number:\s*(\d+)/i)?.[1] || 0);
  if (!id) return null;
  const [kopfRoh, ...rest] = String(e.summary || "").split("\n");
  const label = (rest.join(" ").match(/\[([^\]]+)\]/)?.[1] || "").trim();
  let kopf = kopfRoh.trim(), hs = null, as = null;
  const erg = kopf.match(/\(\s*(\d+)\s*-\s*(\d+)\s*\)\s*$/);
  if (erg) { hs = +erg[1]; as = +erg[2]; kopf = kopf.slice(0, erg.index).trim(); }
  const bem = kopf.match(/\(([^)]*)\)\s*$/)?.[1];
  if (bem) kopf = kopf.slice(0, kopf.lastIndexOf("(")).trim();
  const [h, a] = teamsTrennen(kopf, namen);
  const m = String(e.dtstart || "").match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  let d = `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}`;
  if (e.utc && m[4]) d = luxZeit(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
  const teile = String(e.location || "").split(",").map(s => s.trim()).filter(Boolean);
  const ort = (teile.at(-1) || "").replace(/^(L-)?\d{4}\s+/, "").trim();
  const [wettRoh, runde = ""] = label.replace(/^[MWX]-/, "").split(":");
  const s = {
    id, d, zeit: !/T00:0[01]$/.test(d), h, a, hs, as,
    ort, adr: teile.join(", "),
    nav: (e.description || "").match(/Navigation:\s*(https?:\/\/\S+)/)?.[1] || null,
    wett: (wettRoh || "").trim(), runde: runde.trim(), label, pokal: istPokal(id),
  };
  if (bem && !/^\s*$/.test(bem)) s.bem = bem;
  return s;
}

// ---------- Seiten der Wettbewerbe ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", eacute: "é", egrave: "è", euml: "ë", uuml: "ü", ouml: "ö", auml: "ä", ccedil: "ç" };
export const textAus = h => String(h).replace(/<[^>]*>/g, " ")
  .replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (x, n) => n[0] === "#" ? String.fromCodePoint(n[1].toLowerCase() === "x" ? parseInt(n.slice(2), 16) : +n.slice(1)) : (ENT[n.toLowerCase()] ?? x))
  .replace(/\s+/g, " ").trim();

// Name → { code, slug } aus allen Links auf Vereinsseiten (/club/HEF/us-heffingen-b).
export function klubLinks(html) {
  const m = new Map();
  for (const x of String(html).matchAll(/<a\b[^>]*href="[^"]*\/club\/([A-Z0-9]+)\/([a-z0-9-]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const n = textAus(x[3]);
    if (n && !m.has(n)) m.set(n, { code: x[1].toUpperCase(), slug: x[2].toLowerCase() });
  }
  return m;
}

// Kalender-Datei einer Mannschaft: Kategorie (2 Buchstaben) + Vereinscode + B/C/D für weitere Mannschaften.
export function icsCodeFuer(name, links, kat) {
  const l = links.get(name);
  if (l) return kat + l.code + ((l.slug.match(/-([b-f])$/)?.[1] || "").toUpperCase());
  const ohne = name.replace(/ ([B-F])$/, "");
  const l2 = links.get(ohne);
  if (l2) return kat + l2.code + (name.match(/ ([B-F])$/)?.[1] || "");
  return null;
}

// Offizielle Tabellen von /c/classement/…: Equipe, M, G, P, NUL/FORF, OFF-DEF, …, PTS.
export function tabellenLesen(html) {
  const tabellen = [];
  for (const t of String(html).matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const zeilen = [];
    for (const tr of t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const zellen = [...tr[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => textAus(c[1]));
      const od = zellen.findIndex(c => /^\d+\s*-\s*\d+$/.test(c));
      const ni = zellen.findIndex(c => /[A-Za-zÀ-ÿ]{2}/.test(c));
      if (od < 0 || ni < 0 || od < ni + 3) continue;
      const zahl = i => +(zellen[i] || "").replace(/\D/g, "") || 0;
      const [pf, pa] = zellen[od].split("-").map(x => +x.trim());
      const pktI = zellen.length - 1;
      zeilen.push({ pl: zeilen.length + 1, n: zellen[ni], sp: zahl(ni + 1), s: zahl(ni + 2), nl: zahl(ni + 3), pf, pa, pkt: zahl(pktI) });
    }
    if (zeilen.length >= 2) tabellen.push(zeilen);
  }
  return tabellen;
}

// ---------- Tabelle selbst rechnen (Sieg 2, Niederlage 1 Punkt, wie FLBB) ----------
export function tabelleRechnen(spiele) {
  const t = new Map();
  const zeile = n => t.get(n) || (t.set(n, { n, sp: 0, s: 0, nl: 0, pf: 0, pa: 0, pkt: 0 }), t.get(n));
  for (const s of spiele) { zeile(s.h); zeile(s.a); }
  const gespielt = spiele.filter(s => s.hs != null && s.as != null && s.hs !== s.as);
  for (const s of gespielt) {
    const h = zeile(s.h), a = zeile(s.a), hw = s.hs > s.as;
    h.sp++; a.sp++; h.pf += s.hs; h.pa += s.as; a.pf += s.as; a.pa += s.hs;
    if (hw) { h.s++; a.nl++; } else { a.s++; h.nl++; }
  }
  for (const z of t.values()) z.pkt = 2 * z.s + z.nl;
  // Gleichstand: direkter Vergleich (Siege untereinander), dann Korbdifferenz, dann erzielte Punkte.
  const direkt = (x, y) => gespielt.filter(s => (s.h === x && s.a === y) || (s.h === y && s.a === x))
    .reduce((n, s) => n + ((s.hs > s.as ? s.h : s.a) === x ? 1 : -1), 0);
  const l = [...t.values()].sort((x, y) => y.pkt - x.pkt || direkt(y.n, x.n) || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || x.n.localeCompare(y.n));
  l.forEach((z, i) => (z.pl = i + 1));
  return l;
}

// Die Klasse, die gerade zählt: die des nächsten Meisterschaftsspiels, sonst die des letzten.
export function aktuellesLabel(spiele, jetzt) {
  const liga = spiele.filter(s => !s.pokal && s.label).sort((x, y) => x.d.localeCompare(y.d));
  return (liga.find(s => s.d >= jetzt.slice(0, 10) && s.hs == null) || liga.at(-1))?.label || null;
}

// ---------- Abruf ----------
async function holen(url, versuche = 3) {
  let fehler;
  for (let i = 0; i < versuche; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "US-Heffingen-App (github.com/msteinmetz11/us-heffingen-app)" }, signal: AbortSignal.timeout(25e3) });
      if (r.status === 404) throw Object.assign(new Error("404 " + url), { endgueltig: true });
      if (!r.ok) throw new Error(r.status + " " + url);
      return await r.text();
    } catch (e) { fehler = e; if (e.endgueltig) break; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw fehler;
}

export async function mannschaftHolen(team, jetzt, cache, laden = holen) {
  const kat = team.ics.slice(0, 2), zusatz = team.ics.slice(2 + VEREIN.code.length);
  const eigen = VEREIN.n + (zusatz ? " " + zusatz : "");
  const ics = cache.ics.get(team.ics) ?? (cache.ics.set(team.ics, laden(icsUrl(team.ics))), cache.ics.get(team.ics));
  const ev = icsLesen(await ics);
  let namen = new Set([eigen]);
  let spiele = ev.map(e => spielAusEreignis(e, namen)).filter(Boolean);
  const label = aktuellesLabel(spiele, jetzt);
  let klasse = null;
  if (label) {
    const compId = String(spiele.find(s => s.label === label).id).slice(0, 4);
    const seite = (k, url) => cache.seiten.get(k) ?? (cache.seiten.set(k, laden(url).catch(() => "")), cache.seiten.get(k));
    const links = klubLinks(await seite("cal" + compId, `${BASIS}/c/calendrier-resultat/${compId}/x`));
    namen = new Set([eigen, ...links.keys()]);
    spiele = ev.map(e => spielAusEreignis(e, namen)).filter(Boolean);
    const alle = new Map(spiele.filter(s => s.label === label).map(s => [s.id, s]));
    const gegner = [...new Set([...alle.values()].flatMap(s => [s.h, s.a]))].filter(n => n && n !== eigen);
    let fehlend = 0;
    for (const g of gegner) {
      const code = icsCodeFuer(g, links, kat);
      if (!code) { fehlend++; continue; }
      try {
        const p = cache.ics.get(code) ?? (cache.ics.set(code, laden(icsUrl(code))), cache.ics.get(code));
        for (const s of icsLesen(await p).map(e => spielAusEreignis(e, namen)).filter(Boolean))
          if (s.label === label && !alle.has(s.id)) alle.set(s.id, s);
      } catch (e) { fehlend++; console.log(`  Kalender ${code} (${g}) fehlt: ${e.message}`); }
    }
    const kSpiele = [...alle.values()].sort((x, y) => x.d.localeCompare(y.d) || x.id - y.id).map(({ label, pokal, nav, ...s }) => s);
    const gerechnet = tabelleRechnen(kSpiele);
    let tabelle = gerechnet, quelle = "berechnet";
    const offiziell = tabellenLesen(await seite("tab" + compId, `${BASIS}/c/classement/${compId}/x`));
    const passt = offiziell.find(t => t.length === gerechnet.length && gerechnet.every(z => t.some(o => o.n === z.n)));
    if (passt) { tabelle = passt; quelle = "FLBB"; }
    const [w, r] = label.replace(/^[MWX]-/, "").split(":");
    // Vereinscode je Mannschaft → Logo der FLBB (/layout/themes/flbb/images/Logos/<code>.jpg)
    const logos = Object.fromEntries(gerechnet.map(z => [z.n, (links.get(z.n) || links.get(z.n.replace(/ [B-F]$/, "")))?.code]).filter(x => x[1]));
    klasse = { n: w.trim(), runde: (r || "").trim(), compId: +compId, tabelle, quelle, unvollstaendig: fehlend > 0, logos, spiele: kSpiele };
  }
  return { key: team.key, reiter: team.reiter, ics: team.ics, n: eigen, live: team.live || null, spiele, klasse };
}

async function main() {
  const jetzt = luxZeit(Date.now());
  let alt = null;
  try { alt = JSON.parse(await readFile("data/heffingen.json", "utf8")); } catch (e) {}
  const cache = { ics: new Map(), seiten: new Map() };
  const teams = [];
  for (const t of TEAMS) {
    try {
      const neu = await mannschaftHolen(t, jetzt, cache);
      const vorher = alt?.teams?.find(x => x.key === t.key);
      // Leerer Kalender, vorher aber Spiele: lieber den alten Stand behalten (Störung bei der FLBB).
      if (!neu.spiele.length && vorher?.spiele?.length) { console.log(`${t.reiter}: Kalender leer, alter Stand bleibt`); teams.push(vorher); continue; }
      if (!neu.klasse && vorher?.klasse) neu.klasse = vorher.klasse;
      console.log(`${t.reiter}: ${neu.spiele.length} Spiele, Klasse ${neu.klasse ? neu.klasse.n + " " + neu.klasse.runde + " (" + neu.klasse.spiele.length + " Spiele, Tabelle " + neu.klasse.quelle + ")" : "–"}`);
      teams.push(neu);
    } catch (e) {
      console.log(`${t.reiter}: Fehler ${e.message} — alter Stand bleibt`);
      const vorher = alt?.teams?.find(x => x.key === t.key);
      teams.push(vorher || { key: t.key, reiter: t.reiter, ics: t.ics, n: VEREIN.n, live: t.live || null, spiele: [], klasse: null });
    }
  }
  const daten = { stand: new Date().toISOString(), saison: saisonVon(jetzt), verein: VEREIN, teams };
  // Nur schreiben, wenn sich außer dem Zeitstempel etwas geändert hat (sonst ein Commit je Lauf).
  const ohneStand = d => JSON.stringify({ ...d, stand: null });
  await mkdir("data", { recursive: true });
  if (!alt || ohneStand(alt) !== ohneStand(daten)) {
    await writeFile("data/heffingen.json", JSON.stringify(daten));
    console.log("data/heffingen.json geschrieben");
  } else console.log("keine Änderung");
  let mittAlt = { ereignisse: [] };
  try { mittAlt = JSON.parse(await readFile("data/mitteilungen.json", "utf8")); } catch (e) {}
  const mitt = ereignisse(alt, daten, mittAlt, Date.now());
  if (JSON.stringify(mitt.ereignisse) !== JSON.stringify(mittAlt.ereignisse)) {
    await writeFile("data/mitteilungen.json", JSON.stringify(mitt, null, 1));
    console.log(`data/mitteilungen.json: ${mitt.ereignisse.length} Meldungen`);
  }
}

export const saisonVon = jetzt => { const j = +jetzt.slice(0, 4), m = +jetzt.slice(5, 7); return m >= 7 ? `${j}-${j + 1}` : `${j - 1}-${j}`; };

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
