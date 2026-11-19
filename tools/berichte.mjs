// Spielberichte von den Spielseiten der FLBB (luxembourg.basketball/match/<id>/<datum>/<heim>/<gast>/<wettbewerb>):
// Viertel-Ergebnisse und je Mannschaft eine Tabelle „Joueur | Points (Tot.) | Tirs réussis (1P 2P 3P) | Fautes“.
// Ergebnis: data/berichte.json = { "<spiel-id>": { q: [[heim, gast], …], h: [spieler], a: [spieler], fiba } }
// spieler = { nr, n, s (Starter), pts, p1, p2, p3, f }
import { textAus } from "./abruf.mjs";

// Spiel-id → Pfad der Spielseite, aus allen Links einer Wettbewerbsseite
export function spielPfade(html) {
  const m = new Map();
  for (const x of String(html).matchAll(/\/match\/(\d+)\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+/g)) if (!m.has(+x[1])) m.set(+x[1], x[0]);
  return m;
}

const zahl = c => { const m = String(c ?? "").match(/^\s*(\d+)/); return m ? +m[1] : null; };

function zeilen(tabelle) {
  return [...tabelle.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(tr => [...tr[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => textAus(c[1])));
}

// Eine Spielerzeile: „4 *“ | „KEMEVUAKO Pedrito“ | 8 | 0 | 4 | 0 | „2 (P2+P)“ (Tot, 1P, 2P, 3P, Fouls).
// Welche Zahl was ist, prüft die Rechnung Tot = 1P + 2·2P + 3·3P.
export function spielerZeile(z) {
  let i = 0;
  const nrM = (z[0] || "").match(/^(\d{1,3})\s*(\*)?$/);
  if (!nrM) return null;
  let starter = !!nrM[2];
  i = 1;
  if (z[i] === "*") { starter = true; i++; }
  const n = z[i];
  if (!n || !/[A-Za-zÀ-ÿ]{2}/.test(n)) return null;
  const nums = z.slice(i + 1).map(zahl);
  for (let k = 0; k + 3 < nums.length; k++) {
    const [t, a, b, c] = nums.slice(k, k + 4);
    if ([t, a, b, c].every(x => x != null) && t === a + 2 * b + 3 * c)
      return { nr: +nrM[1], n, s: starter ? 1 : 0, pts: t, p1: a, p2: b, p3: c, f: nums[k + 4] ?? null };
  }
  return nums[0] != null ? { nr: +nrM[1], n, s: starter ? 1 : 0, pts: nums[0], p1: null, p2: null, p3: null, f: null } : null;
}

export function berichtLesen(html, spiel) {
  const tabellen = [...String(html).matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(t => t[0]);
  const teams = [];
  let q = [];
  for (const t of tabellen) {
    const z = zeilen(t), kopf = z.slice(0, 2).flat().join(" ");
    // Viertel: | 21 | Quart 1 | 8 |
    const vz = z.filter(r => r.length === 3 && /^(Quart|Q|Prol|OT)/i.test(r[1]) && zahl(r[0]) != null && zahl(r[2]) != null);
    if (vz.length >= 4 && !q.length) q = vz.map(r => [zahl(r[0]), zahl(r[2])]);
    if (!/3P/.test(kopf) || /Rebond/i.test(kopf)) continue;
    const sp = z.map(spielerZeile).filter(Boolean);
    if (sp.length) teams.push(sp);
  }
  // Ersatz für die Viertel, falls sie nicht in einer Tabelle stehen: „21 Quart 1 8“
  if (!q.length) {
    const txt = textAus(html);
    const v = [...txt.matchAll(/(\d{1,3})\s*\|?\s*Quart\s*([1-4])\s*\|?\s*(\d{1,3})/g)];
    const nachQ = {};
    for (const x of v) if (!nachQ[x[2]]) nachQ[x[2]] = [+x[1], +x[3]];
    if (Object.keys(nachQ).length === 4) q = [1, 2, 3, 4].map(i => nachQ[i]);
  }
  const summe = l => l.reduce((n, p) => n + (p.pts || 0), 0);
  if (q.length && spiel.hs != null) {
    const sh = q.reduce((n, x) => n + x[0], 0), sa = q.reduce((n, x) => n + x[1], 0);
    if (sh === spiel.as && sa === spiel.hs && sh !== sa) q = q.map(([a, b]) => [b, a]);
    else if (sh !== spiel.hs || sa !== spiel.as) {
      // Verlängerung: nach vier Vierteln Gleichstand, der Rest kam in der Verlängerung
      if (q.length === 4 && sh === sa && sh < spiel.hs && sa < spiel.as) q.push([spiel.hs - sh, spiel.as - sa]);
      else q = [];
    }
  }
  let h = teams[0] || [], a = teams[1] || [];
  if (spiel.hs != null && teams.length >= 2 && summe(h) === spiel.as && summe(a) === spiel.hs && spiel.hs !== spiel.as) [h, a] = [a, h];
  const fiba = String(html).match(/fibalivestats\.dcd\.shared\.geniussports\.com\/u\/[A-Z]+\/(\d+)/)?.[1] || null;
  if (!q.length && !h.length && !a.length) return fiba ? { fiba, leer: true } : null;
  return { q, h, a, fiba };
}
