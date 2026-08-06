const VERSION_CACHE = 'clearway-v4';
const CACHE_SHELL = `${VERSION_CACHE}-shell`;
const CACHE_DONNEES = `${VERSION_CACHE}-donnees`;

const FICHIERS_SHELL = [
  'index.html',
  'voies.html',
  'signalement.html',
  'confirmation.html',
  'mes-signalements.html',
  'recemment-degage.html',
  'carte.html',
  'itineraire.html',
  'css/style.css',
  'js/app.js',
  'js/voies.js',
  'js/signalement.js',
  'js/confirmation.js',
  'js/mes-signalements.js',
  'js/recemment-degage.js',
  'js/carte.js',
  'js/itineraire.js',
  'js/geo_alerts.js',
  'js/menu.js',
  'js/theme.js',
  'js/modal.js',
  'js/notifications.js',
  'js/notifications-locales.js',
  'js/sw-register.js',
  'manifest.json',
  'logo.svg',
  'logo-header.svg',
  'favicon.ico',
  'icone-192.png',
  'icone-512.png',
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(FICHIERS_SHELL))
      .catch((erreur) => console.error('Erreur mise en cache initiale :', erreur))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms
          .filter((nom) => !nom.startsWith(VERSION_CACHE))
          .map((nom) => caches.delete(nom))
      )
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  if (requete.url.startsWith('chrome-extension://')) return;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);

  if (url.pathname.includes('/api/') || url.hostname.includes('railway.app')) {
    evenement.respondWith(
      fetch(requete)
        .then((reponse) => {
          if (!reponse || reponse.status !== 200 || reponse.type === 'opaque') {
            return reponse;
          }
          const copie = reponse.clone();
          caches.open(CACHE_DONNEES).then((cache) => {
            if (requete.url.startsWith('http')) {
              cache.put(requete, copie);
            }
          });
          return reponse;
        })
        .catch(async () => {
          const reponseCache = await caches.match(requete);
          if (reponseCache) return reponseCache;
          
          return new Response(
            JSON.stringify({ erreur: 'Tu es hors ligne et aucune donnée locale n\'est disponible pour le moment.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  if (requete.mode === 'navigate' || requete.destination === 'document') {
    evenement.respondWith(
      fetch(requete)
        .then((reponse) => {
          if (reponse && reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE_SHELL).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => caches.match(requete).then((r) => r || caches.match('index.html')))
    );
    return;
  }
  evenement.respondWith(
    caches.match(requete).then((reponseCache) => {
      const miseAJour = fetch(requete)
        .then((reponse) => {
          if (reponse && reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE_SHELL).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => null);

      return reponseCache || miseAJour || caches.match('index.html');
    })
  );
});

self.addEventListener('push', (evenement) => {
  let donnees = { titre: 'ClearWay Bénin', message: 'Nouvelle alerte sur une voie.' };

  if (evenement.data) {
    try {
      donnees = evenement.data.json();
    } catch (e) {
      donnees.message = evenement.data.text();
    }
  }

  const options = {
    body: donnees.message,
    icon: 'icone-192.png',
    badge: 'icone-192.png',
    vibrate: [200, 100, 200],
    tag: 'clearway-alerte',
  };

  evenement.waitUntil(
    (async () => {
      await self.registration.showNotification(donnees.titre, options);

      const clientsOuverts = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsOuverts.forEach((client) => {
        client.postMessage({
          type: 'clearway-notification-push',
          titre: donnees.titre,
          message: donnees.message,
        });
      });
    })()
  );
});

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  evenement.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('index.html');
      }
    })
  );
});