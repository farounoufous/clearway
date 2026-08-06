const CLE_NOTIFICATIONS_LOCALES = 'clearway_notifications_locales';
const CLE_DERNIER_ID_VU = 'clearway_dernier_id_vu';
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

function detecterNouveauxSignalements(signalements) {
  if (!signalements || signalements.length === 0) return;

  const dernierIdVuBrut = localStorage.getItem(CLE_DERNIER_ID_VU);
  const dernierIdVu = dernierIdVuBrut !== null ? parseInt(dernierIdVuBrut, 10) : null;

  const idMaxActuel = Math.max(...signalements.map(s => s.id));

  // Première visite jamais faite sur cet appareil : on mémorise
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (evenement) => {
    if (!evenement.data || evenement.data.type !== 'clearway-notification-push') return;

    ajouterNotificationLocale({
      titre: evenement.data.titre || 'Nouvelle alerte',
      message: evenement.data.message || '',
    });

    mettreAJourBadgeCloche();

    if (typeof panneauNotifications !== 'undefined' && !panneauNotifications.hidden
      && typeof rendreListeNotifications === 'function') {
      rendreListeNotifications();
    }
  });
}