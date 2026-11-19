# US Heffingen – die App

Spiele, Ergebnisse und Tabellen aller Mannschaften der BBC US Heffingen. Aufgebaut wie die App des
FC Koeppchen (fckoeppchen.github.io). Sprachen: Deutsch, Französisch, Englisch (Trainer-Bereich nur Deutsch).

- **Leiste unten:** 🗓️ Woche · 🏀 Spiele · 📊 Liga · 👕 Team · ☰ Mehr; oben die Mannschaft wählen.
- **Woche:** alle Spiele und Trainer-Termine des Vereins, frische News oben.
- **Spiele:** Spieltag-Kasten mit Countdown und Form beider Teams, letztes Spiel (mit Serie), nächste Spiele, Ergebnisse,
  Kalender-Abo. Tippen auf ein Ergebnis öffnet den **Spielbericht** (Viertel, Punkte je Spieler).
- **Liga:** Tabelle mit **Formkurve** (letzte 5 Spiele), alle Spiele der Klasse.
- **Team:** Saison in Zahlen (Bilanz, zu Hause/auswärts, Punkte im Schnitt, Serie, Form), Spieler-Statistik aus den Spielberichten.
- **Mehr:** Vereins-News, Mitteilungen, **Trainer & Vorstand**, Instagram/Facebook/YouTube, App teilen, Sprache.

## Dateien

| Datei | Wozu |
|---|---|
| `index.html` | die ganze App (eine Datei, kein Build) |
| `data/heffingen.json` | Spiele, Tabellen, Klassen – schreibt der Abruf, nicht von Hand ändern |
| `data/berichte.json` | Spielberichte (Viertel, Spieler) – schreibt der Abruf |
| `logos/` | Vereinslogos + `index.json` – fehlende lädt der Abruf |
| `data/mitteilungen.json` | Meldungen für die Handys – schreibt der Abruf |
| `tools/teams.mjs` | **Liste der Mannschaften** (neue Mannschaft: hier eine Zeile dazu) |
| `tools/abruf.mjs` | holt alles von der FLBB (`node tools/abruf.mjs`) |
| `tools/berichte.mjs` | liest die Spielseiten der FLBB (Spielberichte) |
| `tools/mitteilungen.mjs` | vergleicht alt/neu und schreibt die Meldungen |
| `tools/cloudflare-worker.js` | Worker: Takt, Statistik, Mitteilungen |
| `.github/workflows/daten.yml` | GitHub Action, die den Abruf laufen lässt und speichert |
| `sw.js` | Service Worker, nur für Mitteilungen |
| `test/` | Tests (`node --test test/abruf.test.mjs test/worker.test.mjs`) |

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
5. Ebenfalls als Secret **`ADMIN_CODE`**: ein selbst gewählter Code (mind. 8 Zeichen) für den Chef im Trainer-Bereich.
   Damit meldest du dich in der App unter **Mehr → Trainer & Vorstand** an und legst Trainer und Verwalter an
   (jeder bekommt einen eigenen Einmal-Code, 14 Tage gültig).
6. Im Worker unter **Settings → Triggers → Cron Triggers** `* * * * *` (jede Minute) eintragen.
7. Die Adresse des Workers (z. B. `https://us-heffingen.<name>.workers.dev/`) in `index.html` bei `WORKER_URL` eintragen.
   Dann gehen unter „Mehr“ News, Mitteilungen und der Trainer-Bereich.

Statistik ansehen: `<worker-adresse>?zahlen`

## Trainer-Bereich
- **Verwalter** (Chef + wen er dazu macht): alle Mannschaften, News für den ganzen Verein, Trainer anlegen, neue Codes, sperren.
- **Trainer:** Termine (Freundschaftsspiel, Turnier, Training abgesagt, Zusatztraining, Sonstiges) und News nur für ihre Mannschaften.
- Termine erscheinen sofort in Spiele und Woche; nach 10 Minuten geht eine Mitteilung raus (bei Tippfehlern nur eine).
- Namen der Trainer sind nie öffentlich. Alles, was eingetragen wird, ist öffentlich sichtbar – keine Kindernamen, keine Telefonnummern.

## Gut zu wissen
- Mitteilungen am iPhone gehen nur, wenn die App auf dem Home-Bildschirm liegt (Apple-Regel).
- Einen Live-Spielstand wie bei FuPa im Fußball gibt es für Basketball nicht als offene Quelle. Am Spieltag zeigt die App
  den YouTube-Livestream (Men A) und einen Link zum Live-Bereich der FLBB; der Endstand kommt, sobald die FLBB ihn einträgt.
- Logos der Gegner kommen von der FLBB-Seite; fehlt eins, stehen die Anfangsbuchstaben da.
- Das Vereinslogo gehört der US Heffingen.
