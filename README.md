# US Heffingen – die App

Spiele, Ergebnisse und Tabellen aller Mannschaften der BBC US Heffingen. Aufgebaut wie die App des
FC Koeppchen (fckoeppchen.github.io): Reiter je Mannschaft, „Unsere Woche“, Spieltag-Kasten mit Countdown,
Kalender-Abo, Mitteilungen aufs Handy, anonyme Statistik. Sprachen: Deutsch, Französisch, Englisch.

## Dateien

| Datei | Wozu |
|---|---|
| `index.html` | die ganze App (eine Datei, kein Build) |
| `data/heffingen.json` | Spiele, Tabellen, Klassen – schreibt der Abruf, nicht von Hand ändern |
| `data/mitteilungen.json` | Meldungen für die Handys – schreibt der Abruf |
| `tools/teams.mjs` | **Liste der Mannschaften** (neue Mannschaft: hier eine Zeile dazu) |
| `tools/abruf.mjs` | holt alles von der FLBB (`node tools/abruf.mjs`) |
| `tools/mitteilungen.mjs` | vergleicht alt/neu und schreibt die Meldungen |
| `tools/cloudflare-worker.js` | Worker: Takt, Statistik, Mitteilungen |
| `.github/workflows/daten.yml` | GitHub Action, die den Abruf laufen lässt und speichert |
| `sw.js` | Service Worker, nur für Mitteilungen |
| `test/` | Tests (`node --test test/`) |

## Woher die Daten kommen

Alles von luxembourg.basketball, ohne Anmeldung:
- **Kalender je Mannschaft** (`…/layout/themes/flbb/calendar/SHHEF.ics` usw.): Termine, Halle, Ergebnis.
- **Seite „Calendrier et résultats“** des Wettbewerbs: Namen und Codes der Gegner – damit holt der Abruf auch deren
  Kalender und kennt so alle Spiele der Klasse.
- **Seite „Classement“**: offizielle Tabelle. Passt sie nicht eindeutig, rechnet die App selbst (Sieg 2, Niederlage 1 Punkt)
  und sagt das unter der Tabelle.

## Einrichten

### 1. GitHub (Pflicht)
1. Unter **Settings → Actions → General → Workflow permissions** „Read and write permissions“ wählen.
2. Unter **Actions** den Workflow „Daten“ einmal von Hand starten („Run workflow“). Danach läuft er von selbst
   (täglich ~7, 12, 23 Uhr, Fr–So nachmittags stündlich).

### 2. Cloudflare-Worker (für Mitteilungen, Statistik und den 15-Minuten-Takt am Wochenende)
1. Auf dash.cloudflare.com (kostenlos) **Workers & Pages → Create → Worker**, Name z. B. `us-heffingen`.
2. Inhalt von `tools/cloudflare-worker.js` hineinkopieren, **Deploy**.
3. **Storage & Databases → D1 → Create**, Name `us-heffingen`. Im Worker unter **Settings → Bindings → D1** verbinden,
   Variablenname **`DB`**.
4. Auf GitHub ein **Fine-grained Token** anlegen (Settings → Developer settings → Fine-grained tokens), nur für dieses Repo,
   Recht **Actions: Read and write**. Im Worker unter **Settings → Variables and Secrets** als Secret **`GITHUB_TOKEN`** speichern.
5. Im Worker unter **Settings → Triggers → Cron Triggers** `* * * * *` (jede Minute) eintragen.
6. Die Adresse des Workers (z. B. `https://us-heffingen.<name>.workers.dev/`) in `index.html` bei `WORKER_URL` eintragen.
   Dann erscheint oben rechts das Zahnrad ⚙️ für die Mitteilungen.

Statistik ansehen: `<worker-adresse>?zahlen`

## Gut zu wissen
- Mitteilungen am iPhone gehen nur, wenn die App auf dem Home-Bildschirm liegt (Apple-Regel).
- Einen Live-Spielstand wie bei FuPa im Fußball gibt es für Basketball nicht als offene Quelle. Am Spieltag zeigt die App
  den YouTube-Livestream (Men A) und einen Link zum Live-Bereich der FLBB; der Endstand kommt, sobald die FLBB ihn einträgt.
- Logos der Gegner kommen von der FLBB-Seite; fehlt eins, stehen die Anfangsbuchstaben da.
- Das Vereinslogo gehört der US Heffingen.
