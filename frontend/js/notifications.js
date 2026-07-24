// ============================================
// ClearWay Bénin - Cloche : panneau de notifications + notifications push
// ============================================

window.API_BASE = window.API_BASE || '../backend/api';
const VAPID_CLE_PUBLIQUE = 'BNR9zjMkuQjAYjtDMbCes8M5_VH0Dx9qRCUlkYLc7KfbKiwWzc2Re_Avs4bfJDjjc-qk8KgQFViVIhyjeq8vFtY';

const btnCloche = document.getElementById('btn-cloche');
const pointActif = document.getElementById('point-actif-cloche');
const panneauNotifications = document.getElementById('panneau-notifications');
const listeNotificationsEl = document.getElementById('liste-notifications');
const btnFermerPanneau = document.getElementById('btn-fermer-panneau');
const btnTogglePush = document.getElementById('btn-toggle-push');

const overlay = document.getElementById('modal-notif-overlay');
const modalTitre = document.getElementById('modal-notif-titre');
const modalTexte = document.getElementById('modal-notif-texte');

// Convertit la clé VAPID (base64url) en Uint8Array, format attendu par pushManager.subscribe
function urlBase64VersUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

// ============================================
// Panneau de notifications (clic sur la cloche)
// ============================================

function formaterDateRelative(dateIso) {
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(dateIso).getTime()) / 60000));
  if (diffMinutes < 1) return "à l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;
  const diffHeures = Math.floor(diffMinutes / 60);
  if (diffHeures < 24) return `il y a ${diffHeures}h`;
  return `il y a ${Math.floor(diffHeures / 24)}j`;
}

function rendreListeNotifications() {
  const notifications = listerNotificationsLocales();

  if (notifications.length === 0) {
    listeNotificationsEl.innerHTML = '<p class="etat-vide">Aucune notification pour le moment.</p>';
    return;
  }

  listeNotificationsEl.innerHTML = notifications.map(n => `
    <div class="notification-item ${n.lue ? '' : 'non-lue'}">
      <div class="notification-titre">${n.titre}</div>
      <div class="notification-message">${n.message}</div>
      <div class="notification-date">${formaterDateRelative(n.date)}</div>
    </div>
  `).join('');
}

function ouvrirPanneauNotifications() {
  rendreListeNotifications();
  panneauNotifications.hidden = false;
  marquerNotificationsCommeLues();
  mettreAJourBadgeCloche();
}

function fermerPanneauNotifications() {
  panneauNotifications.hidden = true;
}

btnCloche.addEventListener('click', (evenement) => {
  evenement.stopPropagation();
  if (panneauNotifications.hidden) {
    ouvrirPanneauNotifications();
  } else {
    fermerPanneauNotifications();
  }
});

btnFermerPanneau.addEventListener('click', fermerPanneauNotifications);

// Ferme le panneau si on clique en dehors
document.addEventListener('click', (evenement) => {
  if (!panneauNotifications.hidden && !panneauNotifications.contains(evenement.target) && evenement.target !== btnCloche) {
    fermerPanneauNotifications();
  }
});

// ============================================
// Notifications push (activation/désactivation réelle du navigateur)
// ============================================

function fermerModal() {
  overlay.hidden = true;
}

function ouvrirModal({ titre, texte, libelleActionPrincipale, actionPrincipale, libelleActionSecondaire, actionSecondaire }) {
  modalTitre.textContent = titre;
  modalTexte.textContent = texte;

  const ancienBtnPrincipal = document.getElementById('modal-notif-action-principale');
  const ancienBtnSecondaire = document.getElementById('modal-notif-action-secondaire');

  ancienBtnPrincipal.textContent = libelleActionPrincipale;
  ancienBtnSecondaire.textContent = libelleActionSecondaire;

  const nouveauBtnPrincipal = ancienBtnPrincipal.cloneNode(true);
  ancienBtnPrincipal.replaceWith(nouveauBtnPrincipal);
  const nouveauBtnSecondaire = ancienBtnSecondaire.cloneNode(true);
  ancienBtnSecondaire.replaceWith(nouveauBtnSecondaire);

  nouveauBtnPrincipal.addEventListener('click', () => { fermerModal(); actionPrincipale(); });
  nouveauBtnSecondaire.addEventListener('click', () => { fermerModal(); if (actionSecondaire) actionSecondaire(); });

  overlay.hidden = false;
}

const ICONE_CLOCHE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
const ICONE_CLOCHE_OFF = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

function mettreAJourClocheVisuel(estActif) {
  btnCloche.classList.toggle('actif', estActif);
  pointActif.hidden = !estActif;
  btnTogglePush.innerHTML = estActif
    ? `<span class="icone-inline">${ICONE_CLOCHE_OFF}</span>Désactiver les alertes push`
    : `<span class="icone-inline">${ICONE_CLOCHE}</span>Activer les alertes push sur cet appareil`;
}

async function obtenirAbonnementActuel() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

async function actualiserEtatCloche() {
  const abonnement = await obtenirAbonnementActuel();
  mettreAJourClocheVisuel(!!abonnement);
  return abonnement;
}

async function activerNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert("Ton navigateur ne supporte pas les notifications push.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      mettreAJourClocheVisuel(false);
      return;
    }

    const registration = await navigator.serviceWorker.register('sw.js');
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64VersUint8Array(VAPID_CLE_PUBLIQUE),
    });

    await fetch(`${window.API_BASE}/push-subscribe.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    mettreAJourClocheVisuel(true);

  } catch (erreur) {
    console.error('Erreur activation notifications :', erreur);
    alert("Impossible d'activer les notifications pour le moment.");
    mettreAJourClocheVisuel(false);
  }
}

async function desactiverNotifications() {
  try {
    const abonnement = await obtenirAbonnementActuel();
    if (abonnement) {
      await fetch(`${window.API_BASE}/push-subscribe.php`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: abonnement.endpoint }),
      });
      await abonnement.unsubscribe();
    }
    mettreAJourClocheVisuel(false);
  } catch (erreur) {
    console.error('Erreur désactivation notifications :', erreur);
    mettreAJourClocheVisuel(false);
  }
}

btnTogglePush.addEventListener('click', async (evenement) => {
  evenement.stopPropagation();
  const abonnement = await obtenirAbonnementActuel();

  if (abonnement) {
    ouvrirModal({
      titre: 'Désactiver les alertes ?',
      texte: 'Tu ne recevras plus de notification quand une voie est signalée bloquée.',
      libelleActionPrincipale: 'Désactiver',
      actionPrincipale: desactiverNotifications,
      libelleActionSecondaire: 'Annuler',
      actionSecondaire: null,
    });
  } else {
    ouvrirModal({
      titre: 'Recevoir les alertes ?',
      texte: "Sois prévenu dès qu'une voie est bloquée près de chez toi — même sans ouvrir l'app.",
      libelleActionPrincipale: 'Activer les notifications',
      actionPrincipale: activerNotifications,
      libelleActionSecondaire: 'Plus tard',
      actionSecondaire: null,
    });
  }
});

document.addEventListener('DOMContentLoaded', actualiserEtatCloche);
