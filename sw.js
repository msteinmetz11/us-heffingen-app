// Service Worker der App — nur für Mitteilungen. Bewusst kein „fetch“: er lädt und speichert keine Seiten.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// iOS verlangt zu jeder Push-Nachricht eine sichtbare Mitteilung, sonst entzieht es die Erlaubnis.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { text: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titel || "US Heffingen", {
    body: d.text || "", tag: d.tag || undefined, icon: "icon-192.png", badge: "icon-192.png", data: { url: d.url || "./" },
  }));
});

// Tippen auf die Mitteilung öffnet die App beim richtigen Reiter.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const ziel = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => {
    const offen = l.find(c => c.url.startsWith(self.registration.scope));
    return offen ? offen.navigate(ziel).then(c => (c || offen).focus()) : self.clients.openWindow(ziel);
  }));
});
