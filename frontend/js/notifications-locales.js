const CLE_NOTIFICATIONS_LOCALES = 'clearway_notifications_locales';
const CLE_IDS_CONNUS = 'clearway_ids_connus';
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

// ---- Détecte les nouveaux signalements en comparant avec les IDs déjà vus lors du dernier appel ----
function detecterNouveauxSignalements(signalements) {
  let idsConnus = [];
  try {
    idsConnus = JSON.parse(localStorage.getItem(CLE_IDS_CONNUS)) || [];
  } catch {
    idsConnus = [];
  }

  const idsActuels = signalements.map(s => s.id);
  const nouveaux = signalements.filter(s => idsConnus.length > 0 && !idsConnus.includes(s.id));

  nouveaux.forEach(s => {
    ajouterNotificationLocale({
      titre: 'Nouveau signalement',
      message: `${s.zone} — ${s.type_obstacle.toLowerCase()} ${s.gravite_label.toLowerCase()}`,
    });
  });

  localStorage.setItem(CLE_IDS_CONNUS, JSON.stringify(idsActuels.slice(0, 50)));

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