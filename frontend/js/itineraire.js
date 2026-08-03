window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';

const CENTRE_COTONOU = [6.3654, 2.4183];
const ZOOM_DEFAUT = 13;

// ---- État du formulaire : les deux points choisis par l'utilisateur ----
let pointDepart = null;   // { lat, lng }
let pointArrivee = null;  // { lat, lng }
let marqueurDepart = null;
let marqueurArrivee = null;
let ligneTrajet = null;
let marqueursResultats = [];

// ---- Initialisation de la carte ----
const carte = L.map('carte-itineraire', {
  zoomControl: true,
  attributionControl: true,
}).setView(CENTRE_COTONOU, ZOOM_DEFAUT);

carte.zoomControl.setPosition('topleft');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(carte);

function creerIconePoint(couleur) {
  return L.divIcon({
    className: `marqueur-pin marqueur-pin-${couleur}`,
    html: `
      <svg viewBox="0 0 24 32" width="30" height="30" aria-hidden="true">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="currentColor"></path>
        <circle cx="12" cy="12" r="4.5" fill="#fff"></circle>
      </svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  });
}

const ICONE_DEPART = creerIconePoint('bleu');
const ICONE_ARRIVEE = creerIconePoint('rouge');

// ---- Éléments du formulaire ----
const texteDepart = document.getElementById('texte-depart');
const texteArrivee = document.getElementById('texte-arrivee');
const aideEl = document.getElementById('itineraire-aide');
const btnMaPosition = document.getElementById('btn-ma-position');
const btnEffacer = document.getElementById('btn-effacer');
const btnVerifier = document.getElementById('btn-verifier');
const resultatsEl = document.getElementById('itineraire-resultats');

function formaterCoordonnees(point) {
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

function mettreAJourAffichageChamps() {
  if (pointDepart) {
    texteDepart.textContent = formaterCoordonnees(pointDepart);
    texteDepart.classList.add('rempli');
  } else {
    texteDepart.textContent = 'Choisis ton point de départ';
    texteDepart.classList.remove('rempli');
  }

  if (pointArrivee) {
    texteArrivee.textContent = formaterCoordonnees(pointArrivee);
    texteArrivee.classList.add('rempli');
  } else {
    texteArrivee.textContent = 'Choisis ta destination';
    texteArrivee.classList.remove('rempli');
  }

  btnEffacer.hidden = !pointDepart && !pointArrivee;
  btnVerifier.disabled = !(pointDepart && pointArrivee);

  if (!pointDepart) {
    aideEl.innerHTML = 'Touche la carte une première fois pour placer le <strong>départ</strong>, une deuxième fois pour la <strong>destination</strong>.';
  } else if (!pointArrivee) {
    aideEl.innerHTML = 'Départ placé. Touche la carte une deuxième fois pour placer la <strong>destination</strong>.';
  } else {
    aideEl.innerHTML = 'Les deux points sont placés — tu peux les glisser pour ajuster, ou lancer la vérification ci-dessous.';
  }
}

// ---- Place ou déplace le marqueur de départ ----
function definirDepart(latlng) {
  pointDepart = { lat: latlng.lat, lng: latlng.lng };
  if (marqueurDepart) {
    marqueurDepart.setLatLng(latlng);
  } else {
    marqueurDepart = L.marker(latlng, { icon: ICONE_DEPART, draggable: true }).addTo(carte);
    marqueurDepart.on('drag', (e) => {
      pointDepart = { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng };
      mettreAJourAffichageChamps();
      mettreAJourLigne();
    });
  }
  mettreAJourAffichageChamps();
  mettreAJourLigne();
}

// ---- Place ou déplace le marqueur d'arrivée ----
function definirArrivee(latlng) {
  pointArrivee = { lat: latlng.lat, lng: latlng.lng };
  if (marqueurArrivee) {
    marqueurArrivee.setLatLng(latlng);
  } else {
    marqueurArrivee = L.marker(latlng, { icon: ICONE_ARRIVEE, draggable: true }).addTo(carte);
    marqueurArrivee.on('drag', (e) => {
      pointArrivee = { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng };
      mettreAJourAffichageChamps();
      mettreAJourLigne();
    });
  }
  mettreAJourAffichageChamps();
  mettreAJourLigne();
}

function mettreAJourLigne() {
  if (ligneTrajet) {
    carte.removeLayer(ligneTrajet);
    ligneTrajet = null;
  }
  if (pointDepart && pointArrivee) {
    ligneTrajet = L.polyline(
      [[pointDepart.lat, pointDepart.lng], [pointArrivee.lat, pointArrivee.lng]],
      { color: '#0f3460', weight: 3, dashArray: '6 8' }
    ).addTo(carte);
  }
}

// ---- Clic sur la carte : 1er clic = départ, 2e clic = arrivée, 3e clic = on recommence ----
carte.on('click', (evenement) => {
  if (!pointDepart) {
    definirDepart(evenement.latlng);
  } else if (!pointArrivee) {
    definirArrivee(evenement.latlng);
  } else {
    reinitialiserFormulaire();
    definirDepart(evenement.latlng);
  }
});

// ---- Bouton "Ma position" : place automatiquement le départ ----
btnMaPosition.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    afficherAlerteModale("Ton navigateur ne permet pas la géolocalisation.");
    return;
  }
  btnMaPosition.textContent = 'Recherche...';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      btnMaPosition.textContent = 'Ma position';
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      definirDepart(latlng);
      carte.setView(latlng, 15);
    },
    () => {
      btnMaPosition.textContent = 'Ma position';
      afficherAlerteModale("Impossible de te localiser. Vérifie que la géolocalisation est autorisée.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ---- Bouton "Recommencer" ----
btnEffacer.addEventListener('click', reinitialiserFormulaire);

function reinitialiserFormulaire() {
  pointDepart = null;
  pointArrivee = null;
  if (marqueurDepart) { carte.removeLayer(marqueurDepart); marqueurDepart = null; }
  if (marqueurArrivee) { carte.removeLayer(marqueurArrivee); marqueurArrivee = null; }
  if (ligneTrajet) { carte.removeLayer(ligneTrajet); ligneTrajet = null; }
  effacerMarqueursResultats();
  resultatsEl.innerHTML = '';
  mettreAJourAffichageChamps();
}

function effacerMarqueursResultats() {
  marqueursResultats.forEach((m) => carte.removeLayer(m));
  marqueursResultats = [];
}

// ---- Description de la position le long du trajet, pour l'affichage ----
function positionSurTrajetTexte(pourcentage) {
  if (pourcentage <= 15) return 'proche du départ';
  if (pourcentage >= 85) return "proche de l'arrivée";
  return 'à mi-parcours';
}

function construireCarteResultat(s) {
  const badgeIncertain = s.confiance === 'incertain'
    ? '<span class="badge-incertain">Non confirmé</span>'
    : '';
  return `
    <a href="confirmation.html?id=${s.id}" class="carte-voie ${s.gravite_classe}">
      <div class="nom-zone">
        ${s.zone}
        <span class="itineraire-position">${positionSurTrajetTexte(s.position_pourcentage)}</span>
        ${badgeIncertain}
      </div>
      <div class="info">Obstacle : ${s.gravite_label} · ${s.type_obstacle}</div>
      <div class="info">À environ ${s.distance_axe_km.toFixed(2).replace('.', ',')} km de l'axe direct</div>
      ${s.description ? `<div class="info" style="opacity:0.8; font-style: italic;">"${s.description}"</div>` : ''}
    </a>
  `;
}

// ---- Appel du backend et affichage des résultats ----
async function verifierTrajet() {
  if (!pointDepart || !pointArrivee) return;

  btnVerifier.disabled = true;
  const texteOriginal = btnVerifier.textContent;
  btnVerifier.textContent = 'Vérification en cours...';
  resultatsEl.innerHTML = '<p class="etat-vide">Recherche des signalements sur ce trajet…</p>';
  effacerMarqueursResultats();

  try {
    const url = new URL(`${window.API_BASE}/verifier_trajet.php`);
    url.searchParams.set('lat_depart', pointDepart.lat);
    url.searchParams.set('lng_depart', pointDepart.lng);
    url.searchParams.set('lat_arrivee', pointArrivee.lat);
    url.searchParams.set('lng_arrivee', pointArrivee.lng);

    const reponse = await fetch(url);
    const donnees = await reponse.json();

    if (!reponse.ok || !donnees.succes) {
      resultatsEl.innerHTML = `<p class="etat-vide">${donnees.erreur || 'Impossible de vérifier ce trajet pour le moment.'}</p>`;
      return;
    }

    if (donnees.nb_resultats === 0) {
      resultatsEl.innerHTML = `
        <p class="etat-vide">
          Aucun signalement actif sur cet axe pour le moment. Le trajet a l'air dégagé —
          reste prudent, cette information reste basée sur les signalements de la communauté.
        </p>
      `;
      return;
    }

    resultatsEl.innerHTML = `
      <p class="itineraire-aide" style="padding: 0;">
        ${donnees.nb_resultats} signalement${donnees.nb_resultats > 1 ? 's' : ''} sur ce trajet (dans un corridor de ${(donnees.corridor_km * 1000).toFixed(0)} m autour de l'axe direct), du départ vers la destination :
      </p>
      ${donnees.signalements.map(construireCarteResultat).join('')}
    `;

    // Place un petit marqueur pour chaque signalement trouvé, le long de la ligne
    donnees.signalements.forEach((s) => {
      const icone = creerIconePoint(s.gravite_classe === 'severe' ? 'rouge' : 'orange');
      const marqueur = L.marker([s.latitude, s.longitude], { icon: icone }).addTo(carte);
      marqueur.bindPopup(`<strong>${s.zone}</strong><br>${s.gravite_label}${s.confiance === 'incertain' ? ' — non confirmé' : ''}`);
      marqueursResultats.push(marqueur);
    });

  } catch (erreur) {
    console.error('Erreur vérification trajet :', erreur);
    resultatsEl.innerHTML = '<p class="etat-vide">Impossible de vérifier ce trajet. Vérifie ta connexion.</p>';
  } finally {
    btnVerifier.disabled = false;
    btnVerifier.textContent = texteOriginal;
  }
}

btnVerifier.addEventListener('click', verifierTrajet);

mettreAJourAffichageChamps();

// ---- Recalcule la taille de la carte si le conteneur change de dimensions ----
let delaiRedimensionnement;
function planifierInvalidateSize() {
  clearTimeout(delaiRedimensionnement);
  delaiRedimensionnement = setTimeout(() => carte.invalidateSize(), 150);
}
window.addEventListener('resize', planifierInvalidateSize);
window.addEventListener('orientationchange', planifierInvalidateSize);
window.addEventListener('load', planifierInvalidateSize);
