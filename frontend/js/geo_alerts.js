// ============================================
// ClearWay Bénin - Alertes par rayon de 5 km
//
// Récupère la position GPS actuelle de l'utilisateur via l'API native du
// navigateur, puis interroge le backend (get_nearby_incidents.php) pour
// afficher les voies bloquées confirmées à moins de 5 km.
//
// Ce script est autonome : il ne fait rien s'il ne trouve pas son
// conteneur HTML (#liste-alertes-proximite) sur la page, ce qui permet de
// l'inclure partout sans risque de casser une page qui ne l'utilise pas.
// ============================================

window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';

// Id de l'élément HTML dans lequel les alertes seront injectées
const ID_CONTENEUR_ALERTES = 'liste-alertes-proximite';

// ---- Petits utilitaires d'affichage (état de chargement / erreur / vide) ----

function afficherChargement(conteneur) {
  conteneur.innerHTML = '<p class="etat-vide">Recherche des voies bloquées autour de vous…</p>';
}

function afficherMessage(conteneur, message) {
  conteneur.innerHTML = `<p class="etat-vide">${message}</p>`;
}

// ---- Construit une carte d'alerte pour un incident reçu de l'API ----

function construireCarteAlerte(incident) {
  const distanceTexte = `à ${incident.distance_km.toFixed(1).replace('.', ',')} km`;

  return `
    <div class="alerte-proximite ${incident.gravite_classe}" data-id="${incident.id}">
      <div class="alerte-proximite-tete">
        <span class="pastille-gravite ${incident.gravite_classe}"></span>
        <span class="alerte-proximite-type">${incident.type_obstacle}</span>
        <span class="alerte-proximite-distance">${distanceTexte}</span>
      </div>
      <div class="alerte-proximite-zone">${incident.zone}</div>
      ${incident.description ? `<div class="alerte-proximite-description">${incident.description}</div>` : ''}
    </div>
  `;
}

// ---- Affiche la liste complète des incidents reçus dans le conteneur ----

function afficherIncidents(conteneur, incidents) {
  if (!incidents || incidents.length === 0) {
    afficherMessage(conteneur, 'Aucune voie bloquée autour de vous dans un rayon de 5 km.');
    return;
  }

  conteneur.innerHTML = incidents.map(construireCarteAlerte).join('');
}

// ---- Appelle l'API PHP avec les coordonnées de l'utilisateur ----

async function recupererIncidentsProches(latitude, longitude, conteneur) {
  try {
    const url = `${window.API_BASE}/get_nearby_incidents.php?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`;
    const reponse = await fetch(url);

    if (!reponse.ok) {
      throw new Error(`Réponse serveur invalide (code ${reponse.status})`);
    }

    const donnees = await reponse.json();

    if (!donnees.succes) {
      throw new Error(donnees.erreur || 'Erreur inconnue renvoyée par le serveur.');
    }

    afficherIncidents(conteneur, donnees.incidents);

  } catch (erreur) {
    console.error('Erreur récupération des voies bloquées à proximité :', erreur);
    afficherMessage(conteneur, "Impossible de charger les voies bloquées à proximité. Vérifie ta connexion et réessaie.");
  }
}

// ---- Fonction principale : géolocalise l'utilisateur puis lance la recherche ----

async function fetchNearbyIncidents() {
  const conteneur = document.getElementById(ID_CONTENEUR_ALERTES);

  // Si la page ne contient pas le conteneur d'alertes, on ne fait rien
  if (!conteneur) return;

  // Le navigateur ne supporte pas du tout la géolocalisation
  if (!('geolocation' in navigator)) {
    afficherMessage(conteneur, "Ton navigateur ne permet pas la géolocalisation. Active-la ou utilise un navigateur récent.");
    return;
  }

  afficherChargement(conteneur);

  navigator.geolocation.getCurrentPosition(
    // ---- Succès : l'utilisateur a accepté le partage de sa position ----
    (position) => {
      const { latitude, longitude } = position.coords;
      recupererIncidentsProches(latitude, longitude, conteneur);
    },

    // ---- Échec : refus, timeout, ou position indisponible ----
    (erreur) => {
      let message;
      switch (erreur.code) {
        case erreur.PERMISSION_DENIED:
          message = "Tu as refusé le partage de ta position. Active la géolocalisation dans les réglages de ton navigateur pour voir les voies bloquées près de toi.";
          break;
        case erreur.POSITION_UNAVAILABLE:
          message = "Ta position n'a pas pu être déterminée pour le moment. Réessaie dans quelques instants.";
          break;
        case erreur.TIMEOUT:
          message = "La recherche de ta position a pris trop de temps. Réessaie.";
          break;
        default:
          message = "Une erreur est survenue lors de la récupération de ta position.";
      }
      console.error('Erreur géolocalisation :', erreur);
      afficherMessage(conteneur, message);
    },

    // ---- Options de la géolocalisation ----
    {
      enableHighAccuracy: true, // Priorité à la précision (GPS plutôt que triangulation réseau)
      timeout: 10000,           // 10 secondes avant d'abandonner
      maximumAge: 60000,        // Une position vieille de moins d'1 min peut être réutilisée
    }
  );
}

// Lance automatiquement la recherche dès que la page (et son conteneur) est prête
document.addEventListener('DOMContentLoaded', fetchNearbyIncidents);