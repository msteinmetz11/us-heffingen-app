// Probe: holt Beispielseiten von luxembourg.basketball, damit der Parser gegen echtes HTML gebaut werden kann.
import { mkdir, writeFile } from 'node:fs/promises';
const B = 'https://www.luxembourg.basketball';
const urls = {
  'ics-SHHEF.ics': B + '/layout/themes/flbb/calendar/SHHEF.ics',
  'ics-SHHEFB.ics': B + '/layout/themes/flbb/calendar/SHHEFB.ics',
  'classement-1201.html': B + '/c/classement/1201/nationale-2-hommes//',
  'competition-1201.html': B + '/c/calendrier-resultat/1201/nationale-2-hommes',
};
await mkdir('data/debug', { recursive: true });
for (const [f, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { 'User-Agent': 'US-Heffingen-App (club app)' } }); await writeFile('data/debug/' + f, `<!-- ${r.status} ${u} -->\n` + await r.text()); }
  catch (e) { await writeFile('data/debug/' + f + '.err', String(e)); }
}
