// Zeit-Hilfen: alle Zeiten der App sind Luxemburger Ortszeit „YYYY-MM-DDTHH:MM“ (ohne Zone).
const ZONE = "Europe/Luxembourg";
export function luxZeit(ms) {
  const t = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return `${t.year}-${t.month}-${t.day}T${t.hour}:${t.minute}`;
}
// Ortszeit → Millisekunden (Winter +1, Sommer +2; die Variante, die zurückgerechnet stimmt).
export function luxMs(lokal) {
  for (const off of ["+01:00", "+02:00"]) { const ms = Date.parse(lokal + ":00" + off); if (luxZeit(ms) === lokal.slice(0, 16)) return ms; }
  return Date.parse(lokal + ":00+01:00");
}
