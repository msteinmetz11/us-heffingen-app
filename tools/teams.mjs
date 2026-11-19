// Mannschaften der BBC US Heffingen, in der Reihenfolge der Reiter in der App.
// ics = Kalender der FLBB unter https://www.luxembourg.basketball/layout/themes/flbb/calendar/<ics>.ics
// (stehen auf https://www.luxembourg.basketball/club/HEF/us-heffingen). Die ersten zwei Buchstaben sind die
// Kategorie (SH = Herren, SD = Damen, EH = U22 …), dann der Vereinscode HEF und B/C für die zweite/dritte Mannschaft.
// live = Link zum Livestream (nur die erste Herrenmannschaft wird gestreamt).
// Neue Mannschaft: einfach hier eintragen, sonst nichts.
export const VEREIN = { n: "US Heffingen", code: "HEF", app: "BBC US Heffingen" };

export const TEAMS = [
  { key: "men-a", reiter: "Men A", ics: "SHHEF", live: "https://www.youtube.com/@usheffingen1677/live" },
  { key: "women-a", reiter: "Women A", ics: "SDHEF" },
  { key: "men-b", reiter: "Men B", ics: "SHHEFB" },
  { key: "men-c", reiter: "Men C", ics: "SHHEFC" },
  { key: "u22", reiter: "U22", ics: "EHHEF" },
  { key: "u19w", reiter: "U19 W", ics: "CDHEF" },
  { key: "u16", reiter: "U16", ics: "SCHEF" },
  { key: "u16w", reiter: "U16 W", ics: "FSHEF" },
  { key: "u14", reiter: "U14", ics: "MIHEF" },
  { key: "u14w", reiter: "U14 W", ics: "FIHEF" },
  { key: "u12", reiter: "U12", ics: "PHHEF" },
  { key: "u12w", reiter: "U12 W", ics: "PDHEF" },
];
