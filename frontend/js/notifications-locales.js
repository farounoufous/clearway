// ============================================
// ClearWay Bénin - Notifications locales (cloche)
// Journal léger, stocké dans le navigateur, indépendant des vraies
// notifications push : fonctionne pour tout le monde, même sans avoir
// accepté les alertes push. Alimente le compteur affiché sur la cloche.
// ============================================

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
