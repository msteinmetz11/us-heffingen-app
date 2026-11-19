// Cloudflare-Worker der US-Heffingen-App (nach dem Vorbild der FC-Koeppchen-App). Einrichten: siehe README.
//
// Aufgaben:
//  1. Takt: stößt den GitHub-Workflow „daten.yml“ an (GitHubs eigener Zeitplan startet oft zu spät oder gar nicht).
//  2. Anonymer Zähler: die App meldet ?zaehle=1 beim Öffnen und ?angesehen=1 beim Umschalten. Gespeichert werden nur
//     Zahlen je Tag (keine Kennung, keine IP). Ansehen: <worker>?zahlen
//  3. Mitteilungen (Web-Push): Handys melden sich an (?push=anmelden), wählen Mannschaften und Arten (?push=wahl).
//     Jede Minute liest der Worker data/mitteilungen.json (schreibt tools/abruf.mjs) und schickt Fälliges, 7–23 Uhr.
//
// Bindings (Cloudflare → Worker → Settings):
//   DB            D1-Datenbank (Bindings → D1). Ohne sie: kein Zähler, keine Mitteilungen.
//   GITHUB_TOKEN  Secret: Fine-grained Token nur für dieses Repo, Recht „Actions: Read and write“. Ohne: kein Anstoß.
//   MAX_ABOS      (optional) Höchstzahl angemeldeter Handys, sonst 300.
// Trigger: Cron „* * * * *“ (jede Minute).

const REPO = "msteinmetz11/us-heffingen-app";
const BRANCH = "claude/us-heffingen-app-github-ngwaiq";   // Standard-Branch des Repos (von dort läuft GitHub Pages)
const WORKFLOW = "daten.yml";
const APP = "https://msteinmetz11.github.io/us-heffingen-app/";
const MITT_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/mitteilungen.json`;
const ARTEN = ["heute", "ergebnis", "uhrzeit", "neu"];
const TEAM_OK = /^[a-z0-9-]{1,12}$/;
const REITER_OK = /^[A-Za-zÀ-ÿ0-9 ]{1,20}$/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" };
const antwort = (body, status = 200, typ = "application/json") => new Response(body, { status, headers: { ...CORS, "content-type": typ + "; charset=utf-8", "cache-control": "no-store" } });

// ---------- Zeit (Luxemburg) ----------
export function lux(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Luxembourg", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { tag: `${p.year}-${p.month}-${p.day}`, wt: p.weekday, h: +p.hour, m: +p.minute };
}

// ---------- 1. Abruf anstoßen ----------
// Jeden Tag 7:00, 12:00 und 23:30; Freitag bis Sonntag 14–23 Uhr alle 15 Minuten (da wird gespielt);
// Montag bis Donnerstag 22:30 (Abendspiele um 20:30 sind dann vorbei).
export function abrufFaellig(ms) {
  const { wt, h, m } = lux(ms);
  if (m % 15) return false;
  if ((h === 7 || h === 12) && m === 0) return true;
  if (h === 23 && m === 30) return true;
  if (wt === "Fri" || wt === "Sat" || wt === "Sun") return h >= 14 && h <= 23;
  return h === 22 && m === 30;
}
async function anstossen(env) {
  if (!env.GITHUB_TOKEN) return 0;
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github+json", "user-agent": "us-heffingen-app", "content-type": "application/json" },
    body: JSON.stringify({ ref: BRANCH }),
  });
  if (r.status !== 204) console.log("GitHub-Anstoß fehlgeschlagen:", r.status, await r.text());
  return r.status;
}

// ---------- 2. Zähler ----------
const TABELLEN = [
  "CREATE TABLE IF NOT EXISTS tage (tag TEXT PRIMARY KEY, oeffnungen INTEGER NOT NULL DEFAULT 0, handys INTEGER NOT NULL DEFAULT 0, erste INTEGER NOT NULL DEFAULT 0, app INTEGER NOT NULL DEFAULT 0, web INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS reiter (tag TEXT NOT NULL, reiter TEXT NOT NULL, offen INTEGER NOT NULL DEFAULT 0, angesehen INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tag, reiter))",
  "CREATE TABLE IF NOT EXISTS stunden (tag TEXT NOT NULL, h INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tag, h))",
  "CREATE TABLE IF NOT EXISTS abos (endpoint TEXT PRIMARY KEY, abo TEXT NOT NULL, wahl TEXT, seit TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS gemeldet (id TEXT PRIMARY KEY, zeit INTEGER NOT NULL, titel TEXT, an INTEGER NOT NULL DEFAULT 0, fertig INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS gesendet (id TEXT NOT NULL, endpoint TEXT NOT NULL, PRIMARY KEY (id, endpoint))",
  "CREATE TABLE IF NOT EXISTS push_schluessel (id INTEGER PRIMARY KEY, privat TEXT NOT NULL, oeffentlich TEXT NOT NULL)",
];
let BEREIT = false;
async function tabellen(db) { if (BEREIT) return; await db.batch(TABELLEN.map(s => db.prepare(s))); BEREIT = true; }

async function zaehlen(db, q, now) {
  const { tag, h } = lux(now), neu = q.get("neu") === "1", erst = q.get("erst") === "1", art = q.get("art");
  const reiter = REITER_OK.test(q.get("reiter") || "") ? q.get("reiter") : "?";
  await db.batch([
    db.prepare(`INSERT INTO tage (tag, oeffnungen, handys, erste, app, web) VALUES (?1, 1, ?2, ?3, ?4, ?5)
      ON CONFLICT(tag) DO UPDATE SET oeffnungen = oeffnungen + 1, handys = handys + ?2, erste = erste + ?3, app = app + ?4, web = web + ?5`)
      .bind(tag, neu ? 1 : 0, erst ? 1 : 0, neu && art === "app" ? 1 : 0, neu && art === "web" ? 1 : 0),
    db.prepare("INSERT INTO reiter (tag, reiter, offen) VALUES (?1, ?2, 1) ON CONFLICT(tag, reiter) DO UPDATE SET offen = offen + 1").bind(tag, reiter),
    db.prepare("INSERT INTO stunden (tag, h, n) VALUES (?1, ?2, 1) ON CONFLICT(tag, h) DO UPDATE SET n = n + 1").bind(tag, h),
  ]);
}
async function ansehen(db, q, now) {
  const reiter = q.get("reiter") || "";
  if (!REITER_OK.test(reiter)) return;
  await db.prepare("INSERT INTO reiter (tag, reiter, angesehen) VALUES (?1, ?2, 1) ON CONFLICT(tag, reiter) DO UPDATE SET angesehen = angesehen + 1").bind(lux(now).tag, reiter).run();
}
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function zahlenSeite(db, now) {
  const seit = lux(now - 30 * 864e5).tag;
  const tage = (await db.prepare("SELECT * FROM tage WHERE tag >= ?1 ORDER BY tag DESC").bind(seit).all()).results;
  const reiter = (await db.prepare("SELECT reiter, SUM(offen) o, SUM(angesehen) a FROM reiter WHERE tag >= ?1 GROUP BY reiter ORDER BY a + o DESC").bind(seit).all()).results;
  const std = (await db.prepare("SELECT h, SUM(n) n FROM stunden WHERE tag >= ?1 GROUP BY h ORDER BY h").bind(seit).all()).results;
  const abos = (await db.prepare("SELECT COUNT(*) n FROM abos").first())?.n || 0;
  const mitt = (await db.prepare("SELECT * FROM gemeldet ORDER BY zeit DESC LIMIT 25").all()).results;
  const max = Math.max(1, ...std.map(x => x.n));
  const zeile = (...z) => "<tr>" + z.map(x => `<td>${x}</td>`).join("") + "</tr>";
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>US Heffingen – Zahlen</title>
<style>body{font:15px system-ui;margin:16px;color:#161012}h1{color:#8F0311}table{border-collapse:collapse;margin:8px 0 22px}td,th{padding:4px 10px;border-bottom:1px solid #eee;text-align:right}td:first-child,th:first-child{text-align:left}.b{background:#8F0311;height:10px;display:inline-block}</style>
<h1>US Heffingen – Zahlen (30 Tage)</h1>
<p>Handys = verschiedene Geräte je Tag (Browser und Home-Bildschirm zählen getrennt). Neu = zum allerersten Mal geöffnet.</p>
<table><tr><th>Tag</th><th>Öffnungen</th><th>Handys</th><th>davon App</th><th>Neu</th></tr>${tage.map(t => zeile(t.tag, t.oeffnungen, t.handys, t.app, t.erste)).join("")}</table>
<h2>Reiter</h2><table><tr><th>Reiter</th><th>beim Öffnen</th><th>angesehen</th></tr>${reiter.map(r => zeile(esc(r.reiter), r.o, r.a)).join("")}</table>
<h2>Uhrzeit (Öffnungen)</h2><table>${std.map(s => zeile(s.h + " Uhr", s.n, `<span class="b" style="width:${Math.round(160 * s.n / max)}px"></span>`)).join("")}</table>
<h2>Mitteilungen</h2><p>Angemeldete Handys: <b>${abos}</b></p>
<table><tr><th>Mitteilung</th><th>an</th><th>Zeit</th></tr>${mitt.map(m => zeile(esc(m.titel || m.id), m.an + (m.fertig ? "" : " ⏳"), new Date(m.zeit).toLocaleString("de-DE", { timeZone: "Europe/Luxembourg" }))).join("")}</table>`;
  return antwort(html, 200, "text/html");
}

// ---------- 3. Web-Push (RFC 8291 aes128gcm, RFC 8292 VAPID) — übernommen aus der FC-Koeppchen-App ----------
const PUSH_DIENST = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//;
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const verbinden = (...t) => { const r = new Uint8Array(t.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of t) { r.set(x, o); o += x.length; } return r; };
async function hmac(k, d) { return new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), d)); }
let SCHLUESSEL = null;
const KOEPFE = new Map();
export async function vapid(db) {
  if (SCHLUESSEL) return SCHLUESSEL;
  const lesen = () => db.prepare("SELECT privat, oeffentlich FROM push_schluessel WHERE id = 1").first();
  let z = await lesen();
  if (!z) {
    const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    await db.prepare("INSERT OR IGNORE INTO push_schluessel (id, privat, oeffentlich) VALUES (1, ?1, ?2)")
      .bind(JSON.stringify(await crypto.subtle.exportKey("jwk", k.privateKey)), b64u(await crypto.subtle.exportKey("raw", k.publicKey))).run();
    z = await lesen();
  }
  return (SCHLUESSEL = z);
}
async function vapidKopf(z, endpoint, jetzt) {
  const her = new URL(endpoint).origin, alt = KOEPFE.get(her);
  if (alt && alt.bis > jetzt) return alt.kopf;
  const te = new TextEncoder(), teil = o => b64u(te.encode(JSON.stringify(o)));
  const ohne = teil({ typ: "JWT", alg: "ES256" }) + "." + teil({ aud: her, exp: Math.floor(jetzt / 1000) + 12 * 3600, sub: APP });
  const k = await crypto.subtle.importKey("jwk", JSON.parse(z.privat), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const kopf = `vapid t=${ohne}.${b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, te.encode(ohne)))}, k=${z.oeffentlich}`;
  KOEPFE.set(her, { kopf, bis: jetzt + 6 * 3600e3 });
  return kopf;
}
export async function verschluesseln(abo, text) {
  const te = new TextEncoder(), eins = new Uint8Array([1]);
  const uaPub = unb64u(abo.keys.p256dh), auth = unb64u(abo.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const ua = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const geheim = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, as.privateKey, 256));
  const ikm = await hmac(await hmac(auth, geheim), verbinden(te.encode("WebPush: info\0"), uaPub, asPub, eins));
  const salz = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salz, ikm);
  const cek = (await hmac(prk, verbinden(te.encode("Content-Encoding: aes128gcm\0"), eins))).slice(0, 16);
  const nonce = (await hmac(prk, verbinden(te.encode("Content-Encoding: nonce\0"), eins))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const inhalt = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, verbinden(te.encode(text), new Uint8Array([2]))));
  const kopf = new Uint8Array(21);
  kopf.set(salz); new DataView(kopf.buffer).setUint32(16, 4096); kopf[20] = 65;
  return verbinden(kopf, asPub, inhalt);
}
// Dringlichkeit „high“: mit „normal“ verwirft iOS Mitteilungen von Web-Apps im Stromsparschlaf (Erfahrung FC Koeppchen).
export async function pushSenden(db, abo, nachricht, ttl = 6 * 3600) {
  const z = await vapid(db);
  return fetch(abo.endpoint, {
    method: "POST",
    headers: { authorization: await vapidKopf(z, abo.endpoint, Date.now()), "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: String(ttl), urgency: "high" },
    body: await verschluesseln(abo, JSON.stringify(nachricht)),
  });
}
const aboOk = a => a && typeof a.endpoint === "string" && a.endpoint.length < 1000 && PUSH_DIENST.test(a.endpoint)
  && typeof a.keys?.p256dh === "string" && a.keys.p256dh.length < 200 && typeof a.keys?.auth === "string" && a.keys.auth.length < 100;
const zuletztGetestet = new Map();

async function pushAnfrage(req, db, was, env) {
  if (was === "schluessel") return antwort(JSON.stringify({ schluessel: (await vapid(db)).oeffentlich }));
  if (req.method !== "POST") return antwort('{"fehler":"post"}', 405);
  let x; try { x = JSON.parse(await req.text()); } catch (e) { return antwort('{"fehler":"json"}', 400); }
  if (was === "anmelden") {
    if (!aboOk(x)) return antwort('{"fehler":"abo"}', 400);
    const schon = await db.prepare("SELECT 1 FROM abos WHERE endpoint = ?1").bind(x.endpoint).first();
    const max = Number(env.MAX_ABOS) > 0 ? Number(env.MAX_ABOS) : 300;
    if (!schon && ((await db.prepare("SELECT COUNT(*) n FROM abos").first())?.n || 0) >= max) return antwort('{"fehler":"voll"}', 409);
    const abo = { endpoint: x.endpoint, keys: { p256dh: x.keys.p256dh, auth: x.keys.auth } };
    await db.prepare("INSERT INTO abos (endpoint, abo, seit) VALUES (?1, ?2, ?3) ON CONFLICT(endpoint) DO UPDATE SET abo = ?2").bind(abo.endpoint, JSON.stringify(abo), new Date().toISOString()).run();
    return antwort('{"ok":true}');
  }
  const z = typeof x.endpoint === "string" ? await db.prepare("SELECT abo FROM abos WHERE endpoint = ?1").bind(x.endpoint).first() : null;
  if (was === "abmelden") { if (z) await db.prepare("DELETE FROM abos WHERE endpoint = ?1").bind(x.endpoint).run(); return antwort('{"ok":true}'); }
  if (!z) return antwort('{"fehler":"nicht angemeldet"}', 404);
  if (was === "wahl") {
    const je = {};
    for (const [t, a] of Object.entries(x.je && typeof x.je === "object" ? x.je : {}).slice(0, 30))
      if (TEAM_OK.test(t) && Array.isArray(a)) je[t] = a.filter(k => ARTEN.includes(k));
    await db.prepare("UPDATE abos SET wahl = ?2 WHERE endpoint = ?1").bind(x.endpoint, JSON.stringify({ je })).run();
    return antwort('{"ok":true}');
  }
  if (was === "test") {
    if (Date.now() - (zuletztGetestet.get(x.endpoint) || 0) < 20e3) return antwort('{"fehler":"zu schnell"}', 429);
    zuletztGetestet.set(x.endpoint, Date.now());
    const r = await pushSenden(db, JSON.parse(z.abo), { titel: "Test-Mitteilung ✓", text: "So sehen Mitteilungen der US-Heffingen-App aus. 🏀", url: "./" });
    if (r.status === 404 || r.status === 410) await db.prepare("DELETE FROM abos WHERE endpoint = ?1").bind(x.endpoint).run();
    return antwort(JSON.stringify({ ok: r.status < 300, status: r.status }), r.status < 300 ? 200 : 502);
  }
  return antwort('{"fehler":"push"}', 400);
}

// Jede Minute: fällige Meldungen lesen und verschicken, höchstens PAKET Pushes je Minute
// (Cloudflare erlaubt im Gratis-Tarif 50 Abrufe je Aufruf). Was nicht fertig wird, geht in der nächsten Minute weiter.
export const PAKET = 40;
export const passt = (wahl, e) => { try { return (JSON.parse(wahl || "{}").je?.[e.team] || []).includes(e.art); } catch (x) { return false; } };
async function mitteilungenSenden(db, now) {
  const { h } = lux(now);
  if (h < 7 || h >= 23) return;
  const r = await fetch(MITT_URL + "?t=" + Math.floor(now / 6e4), { cf: { cacheTtl: 0 } });
  if (!r.ok) return;
  const faellig = ((await r.json()).ereignisse || []).filter(e => Date.parse(e.ab) <= now && Date.parse(e.bis) > now && ARTEN.includes(e.art));
  if (!faellig.length) return;
  const fertig = new Set((await db.prepare("SELECT id FROM gemeldet WHERE fertig = 1 AND zeit > ?1").bind(now - 8 * 864e5).all()).results.map(x => x.id));
  const offen = faellig.filter(e => !fertig.has(e.id));
  if (!offen.length) return;
  const abos = (await db.prepare("SELECT endpoint, abo, wahl FROM abos").all()).results;
  let budget = PAKET;
  for (const e of offen) {
    await db.prepare("INSERT OR IGNORE INTO gemeldet (id, zeit, titel) VALUES (?1, ?2, ?3)").bind(e.id, now, e.titel + " – " + e.text).run();
    const schon = new Set((await db.prepare("SELECT endpoint FROM gesendet WHERE id = ?1").bind(e.id).all()).results.map(x => x.endpoint));
    const ziel = abos.filter(a => passt(a.wahl, e) && !schon.has(a.endpoint));
    let an = 0;
    for (const a of ziel) {
      if (budget-- <= 0) break;
      try {
        const res = await pushSenden(db, JSON.parse(a.abo), { titel: e.titel, text: e.text, tag: e.id, url: APP + "?r=" + encodeURIComponent(e.team) }, Math.max(60, Math.floor((Date.parse(e.bis) - now) / 1000)));
        if (res.status === 404 || res.status === 410) await db.prepare("DELETE FROM abos WHERE endpoint = ?1").bind(a.endpoint).run();
        else if (res.status < 300) an++;
      } catch (x) { console.log("Push-Fehler", x.message); }
      await db.prepare("INSERT OR IGNORE INTO gesendet (id, endpoint) VALUES (?1, ?2)").bind(e.id, a.endpoint).run();
    }
    const fertigJetzt = budget >= 0;
    await db.prepare("UPDATE gemeldet SET an = an + ?2, fertig = ?3 WHERE id = ?1").bind(e.id, an, fertigJetzt ? 1 : 0).run();
    if (!fertigJetzt) break;
  }
  // Aufräumen: Empfänger-Listen älter als 8 Tage
  if (lux(now).m === 0) await db.prepare("DELETE FROM gesendet WHERE id IN (SELECT id FROM gemeldet WHERE zeit < ?1)").bind(now - 8 * 864e5).run();
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const q = new URL(req.url).searchParams, now = Date.now(), db = env.DB;
    if (!db) return q.has("zahlen") ? antwort("Keine D1-Datenbank verbunden (Binding „DB“).", 200, "text/plain") : new Response(null, { status: 204, headers: CORS });
    await tabellen(db);
    if (q.has("zaehle")) { await zaehlen(db, q, now); return new Response(null, { status: 204, headers: CORS }); }
    if (q.has("angesehen")) { await ansehen(db, q, now); return new Response(null, { status: 204, headers: CORS }); }
    if (q.has("zahlen")) return zahlenSeite(db, now);
    if (q.has("push")) return pushAnfrage(req, db, q.get("push"), env);
    return antwort('{"app":"US Heffingen"}');
  },
  async scheduled(ev, env, ctx) {
    const now = ev.scheduledTime || Date.now();
    if (abrufFaellig(now)) ctx.waitUntil(anstossen(env));
    if (env.DB) { await tabellen(env.DB); await mitteilungenSenden(env.DB, now); }
  },
};
