const CLE_NOTIFICATIONS_LOCALES = 'clearway_notifications_locales';
const CLE_DERNIER_ID_VU = 'clearway_dernier_id_vu'; // remplace l'ancien CLE_IDS_CONNUS (ensemble d'IDs, peu fiable)
const MAX_NOTIFICATIONS = 30;

function listerNotificationsLocales() {
  try {
    return JSON.parse(localStorage.getItem(CLE_NOTIFICATIONS_LOCALES)) || [];
  } catch {
    return [];
  }
}

function ajouterNotificationLocale({ titre, message }) {
  try {
    const liste = listerNotificationsLocales();
    liste.unshift({
      id: Date.now() + Math.random(),
      titre,
      message,
      date: new Date().toISOString(),
      lue: false,
    });
    localStorage.setItem(CLE_NOTIFICATIONS_LOCALES, JSON.stringify(liste.slice(0, MAX_NOTIFICATIONS)));
  } catch (erreur) {
    console.error('Erreur écriture notification locale :', erreur);
  }
}

function compterNotificationsNonLues() {
  return listerNotificationsLocales().filter(n => !n.lue).length;
}

function marquerNotificationsCommeLues() {
  try {
    const liste = listerNotificationsLocales().map(n => ({ ...n, lue: true }));
    localStorage.setItem(CLE_NOTIFICATIONS_LOCALES, JSON.stringify(liste));
  } catch (erreur) {
    console.error('Erreur écriture notification locale :', erreur);
  }
}

// ---- Détecte les nouveaux signalements en comparant à l'ID le plus élevé déjà vu ----
//
// Avant : on comparait l'ensemble des 3 derniers IDs vus à l'ensemble des 3
// derniers IDs actuels (accueil.php ne renvoie que les 3 derniers
// signalements). Problème : dès que plus de 3 signalements arrivaient entre
// deux vérifications, ou que l'ordre changeait un peu vite, la comparaison
// d'ensembles perdait le fil et ne détectait plus rien de façon fiable.
//
// Maintenant : on retient uniquement le plus grand ID déjà vu. Tout
// signalement avec un ID supérieur est forcément nouveau, peu importe
// combien il y en a eu entre deux vérifications — beaucoup plus robuste
// qu'une comparaison d'ensembles sur une fenêtre limitée à 3 éléments.
function detecterNouveauxSignalements(signalements) {
  if (!signalements || signalements.length === 0) return;

  const dernierIdVuBrut = localStorage.getItem(CLE_DERNIER_ID_VU);
  const dernierIdVu = dernierIdVuBrut !== null ? parseInt(dernierIdVuBrut, 10) : null;

  const idMaxActuel = Math.max(...signalements.map(s => s.id));

  // Première visite jamais faite sur cet appareil : on mémorise juste la
  // référence de départ, sans notifier pour des signalements déjà existants
  if (dernierIdVu === null || Number.isNaN(dernierIdVu)) {
    localStorage.setItem(CLE_DERNIER_ID_VU, String(idMaxActuel));
    return;
  }

  const nouveaux = signalements.filter(s => s.id > dernierIdVu);

  nouveaux.forEach(s => {
    ajouterNotificationLocale({
      titre: 'Nouveau signalement',
      message: `${s.zone} — ${s.type_obstacle.toLowerCase()} ${s.gravite_label.toLowerCase()}`,
    });
  });

  if (idMaxActuel > dernierIdVu) {
    localStorage.setItem(CLE_DERNIER_ID_VU, String(idMaxActuel));
  }

  if (nouveaux.length > 0) {
    mettreAJourBadgeCloche();
  }
}

// ---- Met à jour le badge numérique sur la cloche, si elle est présente sur cette page ----
function mettreAJourBadgeCloche() {
  const badge = document.getElementById('badge-notifications-cloche');
  if (!badge) return;
  const nb = compterNotificationsNonLues();
  if (nb > 0) {
    badge.textContent = nb > 9 ? '9+' : String(nb);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

document.addEventListener('DOMContentLoaded', mettreAJourBadgeCloche);

// ---- Relais depuis le service worker : quand une notification push arrive
// pendant que l'app est ouverte (onglet actif ou en arrière-plan), sw.js nous
// prévient via postMessage. On l'ajoute alors à la liste locale, sinon elle
// s'affichait sur l'appareil mais la cloche n'en savait jamais rien. ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (evenement) => {
    if (!evenement.data || evenement.data.type !== 'clearway-notification-push') return;

    ajouterNotificationLocale({
      titre: evenement.data.titre || 'Nouvelle alerte',
      message: evenement.data.message || '',
    });

    mettreAJourBadgeCloche();

    // Si le panneau de notifications est déjà ouvert, on le rafraîchit tout
    // de suite (ces fonctions sont définies dans notifications.js, chargé
    // après ce fichier, mais ce code ne s'exécute qu'au moment du message).
    if (typeof panneauNotifications !== 'undefined' && !panneauNotifications.hidden
      && typeof rendreListeNotifications === 'function') {
      rendreListeNotifications();
    }
  });
}