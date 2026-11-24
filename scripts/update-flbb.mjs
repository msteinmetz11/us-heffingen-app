// Holt jede Nacht Spiele, Ergebnisse und Tabellen der US-Heffingen-Teams von luxembourg.basketball
// und schreibt sie nach data/flbb.json. Die App liest diese Datei beim Start.
// Schlaegt etwas fehl, bleibt die alte Datei stehen (die App nutzt dann weiter ihre eingebauten Daten).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const B = 'https://www.luxembourg.basketball';
const CODES = ['SHHEF','SHHEFB','SHHEFC','SDHEF','EHHEF','CDHEF','SCHEF','FSHEF','MIHEF','FIHEF','PHHEF','PDHEF'];
const LOCAL = process.env.LOCAL; // Testmodus: liest data/debug/<datei> statt aus dem Netz

async function get(url, localName) {
  if (LOCAL) { try { return await readFile('data/debug/' + localName, 'utf8'); } catch { return null; } }
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'US-Heffingen-App (club app; github.com/msteinmetz11/us-heffingen-app)' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch {}
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return null;
}

function unfold(t) { return t.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }
function icsVal(s) { return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\'); }

function parseIcs(text, clubNames) {
  const out = [];
  for (const blk of unfold(text).split('BEGIN:VEVENT').slice(1)) {
    const f = {};
    for (const line of blk.split('\n')) {
      const m = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/); if (m && !(m[1] in f)) f[m[1]] = m[2];
    }
    const no = ((f.UID || '').match(/_(\d+)@/) || [])[1] || ((f.DESCRIPTION || '').match(/Game number:\s*(\d+)/) || [])[1];
    const st = (f.DTSTART || '').match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d))?/);
    if (!no || !st) continue;
    const sum = icsVal(f.SUMMARY || '');
    const [line1, line2 = ''] = sum.split('\n');
    const comp = (line2.match(/\[([^\]]*)\]/) || [])[1] || '';
    let main = line1.trim(), hs = null, as = null;
    const sc = main.match(/\((\d+)\s*-\s*(\d+)\)\s*$/);
    if (sc) { hs = +sc[1]; as = +sc[2]; main = main.slice(0, sc.index).trim(); }
    // Teams trennen: am Bindestrich neben dem eigenen Vereinsnamen (Teamnamen koennen selbst Bindestriche haben)
    let home = null, away = null;
    for (const c of clubNames) {
      if (main.startsWith(c + '-')) { home = c; away = main.slice(c.length + 1); break; }
      if (main.endsWith('-' + c)) { away = c; home = main.slice(0, -c.length - 1); break; }
    }
    if (!home) { const i = main.indexOf('-'); if (i < 0) continue; home = main.slice(0, i); away = main.slice(i + 1); }
    const loc = icsVal(f.LOCATION || '').split(',').map(x => x.trim()).filter(Boolean);
    out.push({
      no, comp: no.slice(0, 4),
      date: `${st[1]}-${st[2]}-${st[3]}`, time: st[4] ? `${st[4]}:${st[5]}` : '',
      home: home.trim(), away: away.trim(), hs, as,
      round: comp.split(':').slice(1).join(':').trim(), league: comp.split(':')[0].replace(/^[MFX]-/, '').trim(),
      addr: loc.join(', '),
    });
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function strip(s) { return s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

function parseTable(html) {
  const groups = []; let cur = null;
  for (const part of html.split('classement-item').slice(1)) {
    const cells = [...part.split(/<div class="row/)[0].matchAll(/<div class="col-[^"]*">([\s\S]*?)<\/div>/g)].map(m => m[1]);
    const name = strip((part.match(/<a [^>]*\/club\/[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
    if (!name || cells.length < 6) continue;
    const t = cells.map(strip);
    const rank = parseInt(t[0], 10);
    const nums = t.slice(2);
    const od = (nums.find(x => /^\d+\s*-\s*\d+$/.test(x)) || '').split('-').map(x => parseInt(x, 10));
    const row = [name, +nums[0], +nums[1], +nums[2], od[0] || 0, od[1] || 0, +nums[nums.length - 1]];
    if (row.slice(1).some(x => !Number.isFinite(x))) continue;
    if (!cur || rank === 1 || rank <= cur.lastRank) { cur = { rows: [], lastRank: 0 }; groups.push(cur); }
    cur.rows.push(row); cur.lastRank = rank;
  }
  return groups.map(g => g.rows);
}

// Alle gespielten Spiele einer Liga (fuer selbst berechnete Tabellen und die Form der Gegner)
function parseComp(html) {
  const out = [];
  for (const part of html.split(/class="row match-item calendarmatch"/).slice(1)) {
    const a = (part.match(/data-cluba="([^"]*)"/) || [])[1], b = (part.match(/data-clubb="([^"]*)"/) || [])[1];
    const m = part.match(/\/match\/(\d+)\/(\d{4}-\d\d-\d\d)\//);
    const sc = [...part.split(/class="row match-item/)[0].matchAll(/match-score[^"]*"><div>\s*(\d+)\s*<\/div>/g)].map(x => +x[1]);
    if (!a || !b || !m || sc.length < 2) continue;
    out.push([m[2], strip(a), strip(b), sc[0], sc[1]]);
  }
  return out;
}

const result = { updated: new Date().toISOString(), teams: {}, tables: {}, leagues: {} };
let prev = null; try { prev = JSON.parse(await readFile('data/flbb.json', 'utf8')); } catch {}
const comps = new Set();

for (const code of CODES) {
  const txt = await get(`${B}/layout/themes/flbb/calendar/${code}.ics`, `ics-${code}.ics`);
  if (!txt || !txt.includes('BEGIN:VCALENDAR')) { if (prev && prev.teams[code]) result.teams[code] = prev.teams[code]; continue; }
  const suffix = code.slice(5); // B, C oder leer
  const clubNames = suffix ? ['US Heffingen ' + suffix] : ['US Heffingen'];
  const games = parseIcs(txt, clubNames.concat(['US Heffingen']));
  result.teams[code] = games;
  games.forEach(g => { if (!/coupe|clux|cup/i.test(g.league)) comps.add(g.comp); });
}

for (const c of comps) {
  const html = await get(`${B}/c/classement/${c}/x//`, `classement-${c}.html`);
  const groups = html ? parseTable(html) : [];
  const mine = groups.filter(g => g.some(r => /heffingen/i.test(r[0])));
  if (mine.length) result.tables[c] = mine;
  else if (prev && prev.tables && prev.tables[c]) result.tables[c] = prev.tables[c];
  const ch = await get(`${B}/c/calendrier-resultat/${c}/x`, `competition-${c}.html`);
  const lg = ch ? parseComp(ch) : [];
  if (lg.length) result.leagues[c] = lg;
  else if (prev && prev.leagues && prev.leagues[c]) result.leagues[c] = prev.leagues[c];
}

const n = Object.values(result.teams).reduce((a, g) => a + g.length, 0);
if (!n) { console.error('Keine Spiele gefunden, alte Datei bleibt.'); process.exit(0); }
// Nur speichern, wenn sich inhaltlich etwas geaendert hat (sonst entsteht jede Nacht ein leerer Commit)
const same = prev && JSON.stringify({ ...prev, updated: 0 }) === JSON.stringify({ ...result, updated: 0 });
if (same) { console.log('Keine Aenderungen.'); process.exit(0); }
await mkdir('data', { recursive: true });
await writeFile('data/flbb.json', JSON.stringify(result));
console.log(`OK: ${n} Spiele, ${Object.keys(result.tables).length} Tabellen`);
