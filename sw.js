// Service worker de l'appli mobile : l'appli s'ouvre sans réseau et sans attendre (fichiers en cache),
// et se met à jour toute seule quand une nouvelle version est publiée. Le relais (ntfy.sh) n'est jamais mis en cache.

const VERSION = 'mc-83d1aabe9645';
const FICHIERS = ["./","./ui/app.js","./ui/commun.js","./ui/icones.js","./ui/style.css","./ui/icone.png","./noyau/logique.js","./noyau/actions.js","./noyau/relais.js","./noyau/octets.js","./mobile/transport.js","./manifest.webmanifest","./icones/icone-180.png","./icones/icone-192.png","./icones/icone-512.png","./icones/icone-masquable-512.png","./index.html"];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(FICHIERS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((enCache) => enCache || fetch(e.request)));
});
