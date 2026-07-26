


// ============================================
// ClearWay Bénin - Écran Carte des zones (Leaflet)
// Affiche les voies bloquées (rouge), ralenties (orange) et récemment
// dégagées (vert) sur une carte OpenStreetMap centrée sur Cotonou,
// avec clustering, pop-ups d'action et géolocalisation de l'utilisateur.
// ============================================

window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';

// Même clé que confirmation.js : un même visiteur garde le même identifiant
// anonyme partout dans l'app, ce qui évite de fausser les comptes de votes
const CLE_VISITEUR_ID = 'clearway_visiteur_id';

function obtenirVisiteurId() {
  let id = localStorage.getItem(CLE_VISITEUR_ID);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    localStorage.setItem(CLE_VISITEUR_ID, id);
  }
  return id;
}

const CENTRE_COTONOU = [6.3654, 2.4183];
const ZOOM_DEFAUT = 13;

// ---- Initialisation de la carte ----
const carte = L.map('carte-zones', {
  zoomControl: true,
  attributionControl: true,
}).setView(CENTRE_COTONOU, ZOOM_DEFAUT);

// Le contrôle de zoom par défaut est en haut à gauche : on le laisse là pour
// ne pas entrer en conflit avec le bouton flottant de géolocalisation (bas-droite)
carte.zoomControl.setPosition('topleft');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(carte);

// ---- Icônes personnalisées (pin SVG coloré via CSS, léger et net sur mobile) ----
function creerIconePin(couleur) {
  return L.divIcon({
    className: `marqueur-pin marqueur-pin-${couleur}`,
    html: `
      <svg viewBox="0 0 24 32" width="34" height="34" aria-hidden="true">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="currentColor"></path>
        <circle cx="12" cy="12" r="4.5" fill="#fff"></circle>
      </svg>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32],
    popupAnchor: [0, -30],
  });
}

const ICONES = {
  rouge: creerIconePin('rouge'),
  orange: creerIconePin('orange'),
  vert: creerIconePin('vert'),
};

// ---- Groupe de clustering : regroupe les marqueurs proches au dézoom ----
const groupeMarqueurs = L.markerClusterGroup({
  maxClusterRadius: 55,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
});
carte.addLayer(groupeMarqueurs);

// ---- Construction du contenu du pop-up d'un marqueur ----
function construirePopup(item, couleur) {
  const libellesStatut = {
    rouge: 'Bloquée',
    orange: 'Trafic ralenti',
    vert: 'Récemment dégagée',
  };

  const lienMaps = item.lien_maps || 'https://google.com';
  const boutonDegage = couleur !== 'vert'
    ? `<button type="button" class="btn-popup-secondaire" data-action="degage" data-id="${item.id}">Ce n'est plus bloqué</button>`
    : '';

  // "depuis" (voies.php) est une durée brute ("20 min") à préfixer, alors que
  // "il_y_a" (recemment-degage.php) contient déjà le préfixe ("il y a 20 min")
  const texteTemps = item.depuis
    ? `depuis ${item.depuis}`
    : (item.il_y_a || '');

  return `
    <div class="popup-carte">
      <div class="popup-zone">${item.zone}</div>
      <div class="popup-statut"><strong>${libellesStatut[couleur]}</strong>${texteTemps ? ` ${texteTemps}` : ''}</div>
      <div class="popup-actions">
        <a href="${lienMaps}" target="_blank" rel="noopener" class="btn-popup-principal">Ouvrir dans Google Maps</a>
        ${boutonDegage}
      </div>
    </div>`;
}

// ---- Envoi du retour "Ce n'est plus bloqué" (même circuit que confirmation.php) ----
async function envoyerVoieDegagee(id, bouton) {
  bouton.disabled = true;
  const texteOriginal = bouton.textContent;
  bouton.textContent = 'Envoi en cours...';

  try {
    const reponse = await fetch(`${window.API_BASE}/confirmation.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signalement_id: id,
        action: 'voie_degagee',
        visiteur_id: obtenirVisiteurId(),
      }),
    });
    const resultat = await reponse.json();

    if (!reponse.ok) {
      alert(resultat.erreur || 'Une erreur est survenue.');
      bouton.disabled = false;
      bouton.textContent = texteOriginal;
      return;
    }

    bouton.textContent = 'Merci pour ta confirmation !';

  } catch (erreur) {
    console.error('Erreur envoi confirmation (carte) :', erreur);
    alert('Impossible d\'envoyer ta confirmation. Vérifie ta connexion.');
    bouton.disabled = false;
    bouton.textContent = texteOriginal;
  }
}

// Délégation : le contenu du pop-up est recréé à chaque ouverture, on
// rattache donc l'écouteur du bouton "Ce n'est plus bloqué" à ce moment-là
carte.on('popupopen', (evenement) => {
  const noeud = evenement.popup.getElement();
  const bouton = noeud ? noeud.querySelector('[data-action="degage"]') : null;
  if (bouton) {
    bouton.addEventListener('click', () => envoyerVoieDegagee(bouton.dataset.id, bouton));
  }
});

// ---- Chargement des marqueurs depuis l'API ----
async function chargerMarqueurs() {
  try {
    const [reponseVoies, reponseDegagees] = await Promise.all([
      fetch(`${window.API_BASE}/voies.php`),
      fetch(`${window.API_BASE}/recemment-degage.php`),
    ]);

    const voies = reponseVoies.ok ? await reponseVoies.json() : [];
    const degagees = reponseDegagees.ok ? await reponseDegagees.json() : [];

    groupeMarqueurs.clearLayers();

    voies.forEach((voie) => {
      if (voie.latitude == null || voie.longitude == null) return; // pas de position exploitable

      // Sévère = bloquée (rouge). Modéré/léger/praticable = trafic ralenti mais
      // encore actif (orange). Le vert est réservé aux voies déjà confirmées dégagées.
      const couleur = voie.gravite_classe === 'severe' ? 'rouge' : 'orange';

      const marqueur = L.marker([voie.latitude, voie.longitude], { icon: ICONES[couleur] });
      marqueur.bindPopup(construirePopup(voie, couleur));
      groupeMarqueurs.addLayer(marqueur);
    });

    degagees.forEach((degagee) => {
      if (degagee.latitude == null || degagee.longitude == null) return;

      const marqueur = L.marker([degagee.latitude, degagee.longitude], { icon: ICONES.vert });
      marqueur.bindPopup(construirePopup({ ...degagee, lien_maps: null }, 'vert'));
      groupeMarqueurs.addLayer(marqueur);
    });

  } catch (erreur) {
    console.error('Erreur chargement des marqueurs de la carte :', erreur);
  }
}

// ---- Géolocalisation de l'utilisateur ----
let marqueurPosition = null;
let cercleImprecision = null;

const boutonLocaliser = document.getElementById('btn-localiser');

boutonLocaliser.addEventListener('click', () => {
  boutonLocaliser.classList.add('en-cours');
  carte.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
});

carte.on('locationfound', (evenement) => {
  boutonLocaliser.classList.remove('en-cours');

  if (marqueurPosition) carte.removeLayer(marqueurPosition);
  if (cercleImprecision) carte.removeLayer(cercleImprecision);

  // Marqueur bleu pulsant (icône CSS, pas de tuile externe nécessaire)
  marqueurPosition = L.marker(evenement.latlng, {
    icon: L.divIcon({
      className: 'marqueur-position',
      html: '<span class="marqueur-position-halo"></span><span class="marqueur-position-point"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
    zIndexOffset: 1000,
    interactive: false,
  }).addTo(carte);

  // Cercle de précision GPS, discret
  cercleImprecision = L.circle(evenement.latlng, {
    radius: evenement.accuracy / 2,
    color: '#1a73e8',
    weight: 1,
    fillColor: '#1a73e8',
    fillOpacity: 0.12,
  }).addTo(carte);
});

carte.on('locationerror', () => {
  boutonLocaliser.classList.remove('en-cours');
  alert('Impossible de te localiser. Vérifie que la géolocalisation est autorisée pour ce site, puis réessaie.');
});

// ---- Chargement initial + rafraîchissement périodique (même logique que l'accueil) ----
document.addEventListener('DOMContentLoaded', () => {
  chargerMarqueurs();
  setInterval(chargerMarqueurs, 30000);
});

// ---- Recalcule la taille de la carte quand le conteneur change réellement
// de dimensions (rotation d'écran, redimensionnement de fenêtre, barre
// d'adresse mobile qui apparaît/disparaît). Nécessaire car Leaflet calcule
// la taille de ses tuiles une seule fois à l'initialisation. ----
let delaiRedimensionnement;
function planifierInvalidateSize() {
  clearTimeout(delaiRedimensionnement);
  delaiRedimensionnement = setTimeout(() => carte.invalidateSize(), 150);
}

window.addEventListener('resize', planifierInvalidateSize);
window.addEventListener('orientationchange', planifierInvalidateSize);

// Sécurité supplémentaire : certains navigateurs mobiles ajustent la barre
// d'adresse juste après le chargement, une fois la carte déjà initialisée
window.addEventListener('load', planifierInvalidateSize);