// Mitteilungen: vergleicht den alten und neuen Stand von data/heffingen.json und schreibt Meldungen nach
// data/mitteilungen.json. Der Cloudflare-Worker liest die Datei und schickt jede Meldung genau einmal an die
// Handys, die diese Mannschaft und diese Art gewählt haben (nur 7–23 Uhr; was nachts fällig wird, wartet bis 7 Uhr,
// solange „bis“ nicht vorbei ist).
//
// Arten: heute (Spieltag, ab 9 Uhr), ergebnis (Endstand), uhrzeit (Termin/Halle geändert), neu (neues Spiel).
import { luxZeit, luxMs } from "./zeit.mjs";

export const ARTEN = ["heute", "ergebnis", "uhrzeit", "neu"];
const TAGE = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
export const kurzDatum = d => {
  const t = new Date(d.slice(0, 10) + "T12:00:00Z");
  return `${TAGE[t.getUTCDay()]} ${+d.slice(8, 10)}.${+d.slice(5, 7)}.`;
};
const zeitText = s => s.zeit ? s.d.slice(11, 16) : "Uhrzeit offen";
const paar = s => `${s.h} – ${s.a}`;

export function ereignisse(alt, neu, mittAlt, now = Date.now()) {
  const jetzt = luxZeit(now), heute = jetzt.slice(0, 10);
  const liste = new Map((mittAlt?.ereignisse || []).filter(e => Date.parse(e.bis) > now - 864e5).map(e => [e.id, e]));
  const dazu = e => { if (!liste.has(e.id)) liste.set(e.id, e); };
  for (const t of neu.teams) {
    const vorher = alt?.teams?.find(x => x.key === t.key);
    const altSpiele = new Map((vorher?.spiele || []).map(s => [s.id, s]));
    const platz = (k, n) => k?.tabelle?.find(z => z.n === n)?.pl;
    for (const s of t.spiele) {
      const a = altSpiele.get(s.id), beginn = luxMs(s.d);
      // Spieltag: am Tag selbst ab 9 Uhr (bzw. sofort, wenn das Spiel früher ist), bis zum Anpfiff.
      if (s.d.slice(0, 10) === heute && s.hs == null && beginn > now) {
        const ab = Math.min(luxMs(heute + "T09:00"), beginn - 2 * 3600e3);
        dazu({ id: `heute-${s.id}`, team: t.key, reiter: t.reiter, art: "heute", titel: `🏀 Heute Spieltag! ${t.reiter}`,
          text: `${zeitText(s)} · ${paar(s)}${s.ort ? " · 📍 " + s.ort : ""}`, ab: new Date(ab).toISOString(), bis: new Date(beginn).toISOString() });
      }
      if (!vorher) continue;   // erster Lauf: nichts melden, sonst kommt die ganze Saison auf einmal
      if (s.hs != null && (!a || a.hs == null) && beginn > now - 7 * 864e5) {
        const wir = s.h === t.n, sieg = wir ? s.hs > s.as : s.as > s.hs;
        const pl = platz(t.klasse, t.n), plAlt = platz(vorher.klasse, t.n);
        dazu({ id: `erg-${s.id}`, team: t.key, reiter: t.reiter, art: "ergebnis",
          titel: `${sieg ? "🎉" : "🏀"} ${t.reiter}: Endstand`,
          text: `${s.h} ${s.hs}:${s.as} ${s.a}${sieg ? " · Sieg!" : ""}${!s.pokal && pl ? ` · jetzt ${pl}. Platz${plAlt && plAlt !== pl ? ` (vorher ${plAlt}.)` : ""}` : ""}`,
          ab: new Date(now).toISOString(), bis: new Date(now + 12 * 3600e3).toISOString() });
      }
      if (s.hs == null && beginn > now) {
        if (!a) dazu({ id: `neu-${s.id}`, team: t.key, reiter: t.reiter, art: "neu", titel: `📅 ${t.reiter}: neues Spiel`,
          text: `${kurzDatum(s.d)} ${zeitText(s)} · ${paar(s)}${s.ort ? " · 📍 " + s.ort : ""}`,
          ab: new Date(now).toISOString(), bis: new Date(beginn).toISOString() });
        else if (a.d !== s.d || (a.ort && s.ort && a.ort !== s.ort)) {
          const was = a.d !== s.d ? `jetzt ${kurzDatum(s.d)} ${zeitText(s)} (vorher ${kurzDatum(a.d)} ${zeitText(a)})` : `jetzt in ${s.ort} (vorher ${a.ort})`;
          dazu({ id: `zeit-${s.id}-${s.d}-${s.ort}`, team: t.key, reiter: t.reiter, art: "uhrzeit", titel: `⏰ ${t.reiter}: Termin geändert`,
            text: `${paar(s)} · ${was}`, ab: new Date(now).toISOString(), bis: new Date(beginn).toISOString() });
        }
      }
    }
  }
  return { stand: new Date(now).toISOString(), ereignisse: [...liste.values()].sort((x, y) => x.ab.localeCompare(y.ab)) };
}
