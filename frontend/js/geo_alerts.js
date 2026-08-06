window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';
const ID_CONTENEUR_ALERTES = 'liste-alertes-proximite';

function afficherChargement(conteneur) {
  conteneur.innerHTML = '<p class="etat-vide">Recherche des voies bloquées autour de vous…</p>';
}

function afficherMessage(conteneur, message) {
  conteneur.innerHTML = `<p class="etat-vide">${message}</p>`;
}
function construireCarteAlerte(incident) {
  const distanceTexte = `à ${incident.distance_km.toFixed(1).replace('.', ',')} km`;
  const badgeIncertain = incident.confiance === 'incertain'
    ? '<span class="badge-incertain">Non confirmé</span>'
    : '';

  return `
    <a href="confirmation.html?id=${incident.id}" class="carte-voie ${incident.gravite_classe}" data-id="${incident.id}">
      <div class="nom-zone">
        ${incident.zone} 
        <span class="badge-nouveau" style="margin-left: 8px;">Proche (${distanceTexte})</span>
        ${badgeIncertain}
      </div>
      <div class="info">Obstacle : ${incident.type_obstacle}</div>
      ${incident.description ? `<div class="info" style="opacity: 0.8; font-style: italic; margin-top: 4px;">"${incident.description}"</div>` : ''}
    </a>
  `;
}

function afficherIncidents(conteneur, incidents) {
  if (!incidents || incidents.length === 0) {
    afficherMessage(conteneur, 'Aucune voie bloquée autour de vous dans un rayon de 5 km.');
    return;
  }

  conteneur.innerHTML = incidents.map(construireCarteAlerte).join('');
}


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
    afficherMessage(conteneur, "Impossible de charger les voies bloquées à proximité. Vérifie votre connexion et réessayez.");
  }
}

async function fetchNearbyIncidents() {
  const conteneur = document.getElementById(ID_CONTENEUR_ALERTES);

  if (!conteneur) return;

  if (!('geolocation' in navigator)) {
    afficherMessage(conteneur, "Votre navigateur ne permet pas la géolocalisation. Activez-la ou utilisez un navigateur récent.");
    return;
  }

  afficherChargement(conteneur);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      recupererIncidentsProches(latitude, longitude, conteneur);
    },

    (erreur) => {
      let message;
      switch (erreur.code) {
        case erreur.PERMISSION_DENIED:
          message = "Vous avez refusé le partage de votre position. Activez la géolocalisation pour voir les voies bloquées près de vous.";
          break;
        case erreur.POSITION_UNAVAILABLE:
          message = "Votre position n'a pas pu être déterminée pour le moment. Réessayez dans quelques instants.";
          break;
        case erreur.TIMEOUT:
          message = "La recherche de votre position a pris trop de temps. Réessayez.";
          break;
        default:
          message = "Une erreur est survenue lors de la récupération de votre position.";
      }
      console.error('Erreur géolocalisation :', erreur);
      afficherMessage(conteneur, message);
    },

    {
      enableHighAccuracy: true, 
      timeout: 10000,   
      maximumAge: 60000,  
    }
  );
}

document.addEventListener('DOMContentLoaded', fetchNearbyIncidents);