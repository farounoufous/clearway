// ============================================
// ClearWay Bénin - Service Worker
// 1) Reçoit les notifications push même quand l'app n'est pas ouverte
// 2) Met en cache l'app + les dernières données connues, pour que l'appli
//    reste utilisable (même en lecture seule) en cas de coupure réseau
// ============================================

const VERSION_CACHE = 'clearway-v3';
const CACHE_SHELL = `${VERSION_CACHE}-shell`;
const CACHE_DONNEES = `${VERSION_CACHE}-donnees`;

// Chemins relatifs à ce fichier (frontend/sw.js) -> s'adaptent automatiquement
// au dossier réel de déploiement (InfinityFree, localhost, sous-dossier, etc.)
const FICHIERS_SHELL = [
  'index.html',
  'voies.html',
  'signalement.html',
  'confirmation.html',
  'mes-signalements.html',
  'recemment-degage.html',
  'css/style.css',
  'js/app.js',
  'js/voies.js',
  'js/signalement.js',
  'js/confirmation.js',
  'js/mes-signalements.js',
  'js/recemment-degage.js',
  'js/menu.js',
  'js/notifications.js',
  'js/notifications-locales.js',
  'manifest.json',
  'logo.svg',
  'logo-header.svg',
  'favicon.ico',
  'icone-192.png',
  'icone-512.png',
];

// ---- Installation : met en cache le "squelette" de l'app ----
self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(FICHIERS_SHELL))
      .catch((erreur) => console.error('Erreur mise en cache initiale :', erreur))
  );
  self.skipWaiting();
});

// ---- Activation : nettoie les anciennes versions de cache ----
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

// ---- Interception des requêtes ----
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  // On ne touche jamais aux requêtes d'écriture (POST/DELETE) : un signalement
  // ou une confirmation doit toujours partir sur le vrai réseau, jamais depuis un cache
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);

  // Appels à l'API backend (données) : réseau en priorité, cache en secours si hors ligne
  if (url.pathname.includes('/backend/api/')) {
    evenement.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE_DONNEES).then((cache) => cache.put(requete, copie));
          return reponse;
        })
        .catch(async () => {
          const reponseCache = await caches.match(requete);
          if (reponseCache) return reponseCache;
          // Aucune donnée en cache (première visite hors ligne) : réponse de secours
          // cohérente avec le format JSON attendu par le frontend
          return new Response(
            JSON.stringify({ erreur: 'Tu es hors ligne et aucune donnée locale n\'est disponible pour le moment.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Fichiers de l'app (HTML/CSS/JS/images) : cache en priorité (rapide),
  // avec mise à jour silencieuse en arrière-plan pour la prochaine visite
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

      // Sert le cache immédiatement s'il existe, sinon attend le réseau,
      // et en dernier recours retombe sur la page d'accueil déjà en cache
      return reponseCache || miseAJour || caches.match('index.html');
    })
  );
});

// ---- Notifications push ----
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
    tag: 'clearway-alerte',   // remplace la notif précédente au lieu d'empiler
  };

  evenement.waitUntil(
    self.registration.showNotification(donnees.titre, options)
  );
});

// Au clic sur la notification : ouvre (ou remet au premier plan) l'app
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
