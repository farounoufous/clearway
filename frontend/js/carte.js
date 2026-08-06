window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';

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

const carte = L.map('carte-zones', {
  zoomControl: true,
  attributionControl: true,
}).setView(CENTRE_COTONOU, ZOOM_DEFAUT);

carte.zoomControl.setPosition('topleft');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(carte);

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

const groupeMarqueurs = L.markerClusterGroup({
  maxClusterRadius: 55,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
});
carte.addLayer(groupeMarqueurs);

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

  const texteTemps = item.depuis
    ? `depuis ${item.depuis}`
    : (item.il_y_a || '');

  const avertissementIncertain = item.confiance === 'incertain'
    ? '<div class="popup-avertissement">⚠ Non reconfirmé depuis un moment — fiabilité incertaine</div>'
    : '';

  return `
    <div class="popup-carte">
      <div class="popup-zone">${item.zone}</div>
      <div class="popup-statut"><strong>${libellesStatut[couleur]}</strong>${texteTemps ? ` ${texteTemps}` : ''}</div>
      ${avertissementIncertain}
      <div class="popup-actions">
        <a href="${lienMaps}" target="_blank" rel="noopener" class="btn-popup-principal">Ouvrir dans Google Maps</a>
        ${boutonDegage}
      </div>
    </div>`;
}

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
      await afficherAlerteModale(resultat.erreur || 'Une erreur est survenue.');
      bouton.disabled = false;
      bouton.textContent = texteOriginal;
      return;
    }

    bouton.textContent = 'Merci pour ta confirmation !';

  } catch (erreur) {
    console.error('Erreur envoi confirmation (carte) :', erreur);
    await afficherAlerteModale('Impossible d\'envoyer ta confirmation. Vérifie ta connexion.');
    bouton.disabled = false;
    bouton.textContent = texteOriginal;
  }
}
carte.on('popupopen', (evenement) => {
  const noeud = evenement.popup.getElement();
  const bouton = noeud ? noeud.querySelector('[data-action="degage"]') : null;
  if (bouton) {
    bouton.addEventListener('click', () => envoyerVoieDegagee(bouton.dataset.id, bouton));
  }
});

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

      // Sévère = bloquée (rouge). Modéré/léger/praticable = trafic ralenti 
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
  afficherAlerteModale('Impossible de vous localiser. Vérifiez que la géolocalisation est autorisée pour ce site, puis réessayez.');
});

document.addEventListener('DOMContentLoaded', () => {
  chargerMarqueurs();
  setInterval(chargerMarqueurs, 30000);
});
let delaiRedimensionnement;
function planifierInvalidateSize() {
  clearTimeout(delaiRedimensionnement);
  delaiRedimensionnement = setTimeout(() => carte.invalidateSize(), 150);
}

window.addEventListener('resize', planifierInvalidateSize);
window.addEventListener('orientationchange', planifierInvalidateSize);

window.addEventListener('load', planifierInvalidateSize);