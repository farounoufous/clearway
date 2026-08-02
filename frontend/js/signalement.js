// Déclaré via window pour rester cohérent avec les autres pages et éviter
// tout conflit si un autre script venait à être ajouté sur cette page
window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';


const selecteurGravite = document.getElementById('selecteur-gravite');
const champGravite = document.getElementById('gravite');
const form = document.getElementById('form-signalement');
const btnEnvoyer = document.getElementById('btn-envoyer');
const messageZone = document.getElementById('message-zone');
const champPhoto = document.getElementById('photo');
const apercuPhoto = document.getElementById('apercu-photo');
const selectTypeObstacle = document.getElementById('type-obstacle');
const champTypePersonnalise = document.getElementById('type-obstacle-personnalise');

// ---- Éléments de l'emplacement (GPS / carte) ----
const boutonsPosition = document.getElementById('boutons-position');
const btnGeolocalisation = document.getElementById('btn-geolocalisation');
const btnChoisirCarte = document.getElementById('btn-choisir-carte');
const statutGeolocalisation = document.getElementById('statut-geolocalisation');
const positionConfirmee = document.getElementById('position-confirmee');
const positionConfirmeeTexte = document.getElementById('position-confirmee-texte');
const lienMapsPosition = document.getElementById('lien-maps-position');
const btnModifierPosition = document.getElementById('btn-modifier-position');
const blocQuartierManuel = document.getElementById('bloc-quartier-manuel');
const champQuartierManuel = document.getElementById('quartier-manuel');

const champLatitude = document.getElementById('champ-latitude');
const champLongitude = document.getElementById('champ-longitude');
const champAccuracy = document.getElementById('champ-accuracy');
const champSourcePosition = document.getElementById('champ-source-position');
const champPays = document.getElementById('champ-pays');
const champVille = document.getElementById('champ-ville');
const champQuartier = document.getElementById('champ-quartier');
const champAdresseFormatee = document.getElementById('champ-adresse-formatee');

// ---- Éléments de la modale "Choisir sur la carte" ----
const modalCarte = document.getElementById('modal-carte');
const btnFermerCarte = document.getElementById('btn-fermer-carte');
const btnConfirmerCarte = document.getElementById('btn-confirmer-carte');
const rechercheLieu = document.getElementById('recherche-lieu');
const resultatsRechercheLieu = document.getElementById('resultats-recherche-lieu');
const statutCarte = document.getElementById('statut-carte');

// Point choisi par l'utilisateur (GPS ou carte), envoyé avec le formulaire.
// C'est la seule source de localisation désormais (plus de liste de zones) :
// { latitude, longitude, accuracy, source: 'GPS'|'CARTE', pays, ville, quartier, adresse_formatee }
let position = null;

// Instance Leaflet créée à la première ouverture de la modale, puis réutilisée
// (Leaflet ne supporte pas d'être ré-initialisé sur un conteneur déjà utilisé)
let carteLeaflet = null;
let marqueurCarte = null;

// Résultat du dernier géocodage inversé fait pendant qu'on déplace le marqueur
// dans la modale, en attente d'un clic sur "Confirmer la position"
let resultatEnAttenteCarte = null;

let minuterieRecherche = null;

// Centre par défaut de la carte (Cotonou / Abomey-Calavi) si l'utilisateur
// n'a pas encore de position connue
const CENTRE_PAR_DEFAUT = [6.3703, 2.3912];

// ---- 2. Gestion du sélecteur de gravité (3 boutons) ----
selecteurGravite.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('button');
  if (!bouton) return;

  selecteurGravite.querySelectorAll('button').forEach(b => b.classList.remove('actif'));
  bouton.classList.add('actif');
  champGravite.value = bouton.dataset.valeur;
});

selectTypeObstacle.addEventListener('change', () => {
  const estAutre = selectTypeObstacle.value === 'Autre';
  champTypePersonnalise.hidden = !estAutre;
  champTypePersonnalise.required = estAutre;
  if (!estAutre) champTypePersonnalise.value = '';
});

// ---- 2bis. Compression + aperçu de la photo sélectionnée ----
//
// Les photos de smartphone modernes pèsent 3-8 Mo. Sur une connexion mobile
// limitée (contexte courant à Cotonou/Abomey-Calavi), forcer l'envoi de ça
// pour signaler une route inondée est un vrai frein à l'usage, surtout dans
// l'urgence. On redimensionne et recompresse via <canvas> avant l'envoi :
// ~1280px de large et qualité JPEG 0.72 suffisent largement pour identifier
// un obstacle sur une photo, et ça fait passer le poids à 100-300 Ko.
let photoAEnvoyer = null; // fichier réellement envoyé au serveur (compressé, ou original si la compression échoue)

function compresserImage(fichier, largeurMax = 1280, qualite = 0.72) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // On ne réduit jamais une image déjà plus petite que la largeur max
      const ratio = Math.min(1, largeurMax / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);

      const contexte = canvas.getContext('2d');
      contexte.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], 'signalement.jpg', { type: 'image/jpeg' }));
        } else {
          resolve(fichier); // échec de l'encodage -> on envoie l'original plutôt que de bloquer l'utilisateur
        }
      }, 'image/jpeg', qualite);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(fichier); // fichier illisible comme image -> laissé tel quel, la validation serveur tranchera
    };

    img.src = url;
  });
}

champPhoto.addEventListener('change', async () => {
  apercuPhoto.innerHTML = '';
  photoAEnvoyer = null;
  const fichier = champPhoto.files[0];
  if (!fichier) return;

  // Limite d'entrée plus large qu'avant : la compression se charge de ramener
  // ça à une taille raisonnable, pas la peine de bloquer une photo un peu lourde
  const tailleMaxOctets = 10 * 1024 * 1024; // 10 Mo
  if (fichier.size > tailleMaxOctets) {
    afficherMessage('La photo est trop lourde (max 10 Mo).', 'erreur');
    champPhoto.value = '';
    return;
  }

  afficherMessage('Compression de la photo...', 'info');
  photoAEnvoyer = await compresserImage(fichier);
  messageZone.innerHTML = '';

  const img = document.createElement('img');
  img.src = URL.createObjectURL(photoAEnvoyer);
  apercuPhoto.appendChild(img);
});

const ICONE_LOCALISATION = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>';

// ============================================
// 3. Géocodage (Nominatim / OpenStreetMap)
//
// Politique d'usage Nominatim : pas plus d'~1 requête par seconde et pas
// d'usage intensif en production sans routage vers une instance dédiée.
// Suffisant ici (le géocodage n'est déclenché que sur une action explicite
// de l'utilisateur : clic GPS, glisser le marqueur, ou recherche).
// ============================================

async function geocodageInverse(latitude, longitude) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const reponse = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    if (!reponse.ok) throw new Error('Réponse géocodage invalide');
    const donnees = await reponse.json();
    const a = donnees.address || {};
    return {
      pays: a.country || null,
      ville: a.city || a.town || a.municipality || a.county || null,
      quartier: a.suburb || a.neighbourhood || a.quarter || a.residential || a.village || null,
      adresse_formatee: donnees.display_name || null,
    };
  } catch (erreur) {
    console.error('Erreur géocodage inversé :', erreur);
    return { pays: null, ville: null, quartier: null, adresse_formatee: null };
  }
}

async function rechercheLieux(requete) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(requete)}&countrycodes=bj&limit=5&addressdetails=1`;
    const reponse = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    if (!reponse.ok) throw new Error('Réponse recherche invalide');
    return await reponse.json();
  } catch (erreur) {
    console.error('Erreur recherche de lieu :', erreur);
    return [];
  }
}

// ============================================
// 4. Affichage de la position confirmée (remplace les 2 boutons)
// ============================================

function afficherStatutGeolocalisation(texte, type) {
  statutGeolocalisation.textContent = texte;
  statutGeolocalisation.className = `note-info ${type}`;
  statutGeolocalisation.hidden = false;
}

function texteLocalisation(p) {
  const parties = [p.quartier, p.ville].filter(Boolean);
  if (parties.length) return parties.join(', ');
  if (p.adresse_formatee) return p.adresse_formatee;
  return `Position (${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)})`;
}

function remplirChampsCaches() {
  champLatitude.value = position.latitude;
  champLongitude.value = position.longitude;
  champAccuracy.value = position.accuracy != null ? position.accuracy : '';
  champSourcePosition.value = position.source;
  champPays.value = position.pays || '';
  champVille.value = position.ville || '';
  champQuartier.value = position.quartier || champQuartierManuel.value.trim() || '';
  champAdresseFormatee.value = position.adresse_formatee || '';
}

function afficherPositionConfirmee() {
  let texte = texteLocalisation(position);
  if (position.source === 'GPS' && position.accuracy) {
    texte += ` — précision ~${Math.round(position.accuracy)} m`;
  }
  positionConfirmeeTexte.textContent = texte;
  lienMapsPosition.href = `https://www.google.com/maps?q=${position.latitude},${position.longitude}`;

  positionConfirmee.hidden = false;
  boutonsPosition.hidden = true;
  statutGeolocalisation.hidden = true;

  // Si le géocodage n'a pas trouvé de quartier, on laisse l'utilisateur le préciser
  blocQuartierManuel.hidden = !!position.quartier;
  if (position.quartier) champQuartierManuel.value = '';

  remplirChampsCaches();
}

function reinitialiserPosition() {
  position = null;
  positionConfirmee.hidden = true;
  boutonsPosition.hidden = false;
  blocQuartierManuel.hidden = true;
  champQuartierManuel.value = '';
  statutGeolocalisation.hidden = true;

  [champLatitude, champLongitude, champAccuracy, champSourcePosition, champPays, champVille, champQuartier, champAdresseFormatee]
    .forEach(champ => { champ.value = ''; });

  btnGeolocalisation.disabled = false;
  btnGeolocalisation.innerHTML = `<span class="icone-inline">${ICONE_LOCALISATION}</span>Utiliser ma position`;
}

btnModifierPosition.addEventListener('click', reinitialiserPosition);

// Si l'utilisateur précise son quartier manuellement (géocodage muet), on le
// répercute en direct dans le champ cache envoyé au serveur
champQuartierManuel.addEventListener('input', () => {
  champQuartier.value = champQuartierManuel.value.trim();
});

// ============================================
// 5. "Utiliser ma position" (géolocalisation du navigateur)
// ============================================

btnGeolocalisation.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    afficherStatutGeolocalisation("Ton navigateur ne supporte pas la géolocalisation.", 'erreur');
    return;
  }

  btnGeolocalisation.disabled = true;
  btnGeolocalisation.innerHTML = 'Localisation en cours...';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      afficherStatutGeolocalisation('Position récupérée, recherche de l\'adresse...', 'succes');

      const geocode = await geocodageInverse(latitude, longitude);
      position = { latitude, longitude, accuracy, source: 'GPS', ...geocode };
      afficherPositionConfirmee();
    },
    (erreur) => {
      // On ne bloque jamais le formulaire : on propose simplement l'autre méthode
      const messages = {
        1: 'Position refusée — pas de souci, choisis un point sur la carte à la place.',
        2: 'Position indisponible pour le moment — choisis un point sur la carte.',
        3: 'La localisation a pris trop de temps — choisis un point sur la carte.',
      };
      afficherStatutGeolocalisation(messages[erreur.code] || 'Géolocalisation impossible.', 'erreur');
      btnGeolocalisation.disabled = false;
      btnGeolocalisation.innerHTML = `<span class="icone-inline">${ICONE_LOCALISATION}</span>Utiliser ma position`;
    },
    { timeout: 8000, maximumAge: 60000 }
  );
});

// ============================================
// 6. "Choisir sur la carte" (modale Leaflet / OpenStreetMap)
// ============================================

function initCarteLeaflet() {
  const centreDepart = position ? [position.latitude, position.longitude] : CENTRE_PAR_DEFAUT;

  carteLeaflet = L.map('carte-leaflet').setView(centreDepart, 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(carteLeaflet);

  marqueurCarte = L.marker(centreDepart, { draggable: true }).addTo(carteLeaflet);

  marqueurCarte.on('dragend', () => {
    const { lat, lng } = marqueurCarte.getLatLng();
    gererDeplacementMarqueur(lat, lng);
  });

  carteLeaflet.on('click', (evenement) => {
    marqueurCarte.setLatLng(evenement.latlng);
    gererDeplacementMarqueur(evenement.latlng.lat, evenement.latlng.lng);
  });

  gererDeplacementMarqueur(centreDepart[0], centreDepart[1]);
}

async function gererDeplacementMarqueur(lat, lon) {
  btnConfirmerCarte.disabled = true;
  statutCarte.textContent = "Recherche de l'adresse...";

  const geocode = await geocodageInverse(lat, lon);
  resultatEnAttenteCarte = { latitude: lat, longitude: lon, ...geocode };

  const parties = [geocode.quartier, geocode.ville].filter(Boolean);
  statutCarte.textContent = parties.length
    ? parties.join(', ')
    : (geocode.adresse_formatee || `Position (${lat.toFixed(4)}, ${lon.toFixed(4)})`);

  btnConfirmerCarte.disabled = false;
}

function ouvrirModalCarte() {
  modalCarte.hidden = false;

  // Attend que le conteneur soit visible (donc dimensionné) avant que Leaflet
  // ne mesure sa taille — sinon la carte s'affiche rognée dans un coin
  requestAnimationFrame(() => {
    if (!carteLeaflet) {
      initCarteLeaflet();
    } else {
      carteLeaflet.invalidateSize();
      if (position) {
        const centre = [position.latitude, position.longitude];
        carteLeaflet.setView(centre, 15);
        marqueurCarte.setLatLng(centre);
        gererDeplacementMarqueur(centre[0], centre[1]);
      }
    }
  });
}

function fermerModalCarte() {
  modalCarte.hidden = true;
  resultatsRechercheLieu.hidden = true;
  resultatsRechercheLieu.innerHTML = '';
  rechercheLieu.value = '';
}

btnChoisirCarte.addEventListener('click', ouvrirModalCarte);
btnFermerCarte.addEventListener('click', fermerModalCarte);

// Ferme la modale si on clique sur le fond sombre (en dehors de la carte)
modalCarte.addEventListener('click', (evenement) => {
  if (evenement.target === modalCarte) fermerModalCarte();
});

btnConfirmerCarte.addEventListener('click', () => {
  if (!resultatEnAttenteCarte) return;
  position = { ...resultatEnAttenteCarte, source: 'CARTE' };
  fermerModalCarte();
  afficherPositionConfirmee();
});

// ---- Recherche de lieu (avec anti-rebond pour respecter Nominatim) ----
rechercheLieu.addEventListener('input', () => {
  clearTimeout(minuterieRecherche);
  const requete = rechercheLieu.value.trim();

  if (requete.length < 3) {
    resultatsRechercheLieu.hidden = true;
    resultatsRechercheLieu.innerHTML = '';
    return;
  }

  minuterieRecherche = setTimeout(async () => {
    const resultats = await rechercheLieux(requete);
    afficherResultatsRecherche(resultats);
  }, 600);
});

function afficherResultatsRecherche(resultats) {
  resultatsRechercheLieu.innerHTML = '';

  if (!resultats.length) {
    resultatsRechercheLieu.hidden = true;
    return;
  }

  resultats.forEach(resultat => {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.textContent = resultat.display_name;
    bouton.addEventListener('click', () => {
      const lat = parseFloat(resultat.lat);
      const lon = parseFloat(resultat.lon);
      carteLeaflet.setView([lat, lon], 16);
      marqueurCarte.setLatLng([lat, lon]);
      gererDeplacementMarqueur(lat, lon);
      resultatsRechercheLieu.hidden = true;
      rechercheLieu.value = resultat.display_name;
    });
    resultatsRechercheLieu.appendChild(bouton);
  });

  resultatsRechercheLieu.hidden = false;
}

// ---- 7. Affichage des messages de succès/erreur ----
function afficherMessage(texte, type) {
  messageZone.innerHTML = `<div class="message-etat ${type}">${texte}</div>`;
}

// ---- 7ter. Vérification des doublons possibles avant l'envoi (Option B) ----
// On ne fusionne JAMAIS automatiquement : on propose juste à l'utilisateur
// de confirmer un signalement existant proche, ou de continuer le sien s'il
// juge que c'est vraiment un problème différent.
let ignorerVerificationDoublon = false;

async function chercherDoublonsPossibles(latitude, longitude) {
  try {
    const url = `${window.API_BASE}/verifier_proximite.php?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`;
    const reponse = await fetch(url);
    if (!reponse.ok) return [];
    const donnees = await reponse.json();
    return donnees.doublons_possibles || [];
  } catch (erreur) {
    console.error('Vérification des doublons impossible (on continue quand même) :', erreur);
    return []; // en cas d'erreur réseau, on n'empêche pas l'utilisateur de signaler
  }
}

function afficherChoixDoublon(doublons) {
  const plusProche = doublons[0];
  const distanceTexte = plusProche.distance_m < 1
    ? 'au même endroit'
    : `à environ ${plusProche.distance_m} m`;
  const nonConfirme = plusProche.confiance === 'incertain'
    ? '<span class="badge-incertain">Non confirmé</span>'
    : '';

  messageZone.innerHTML = `
    <div class="carte-doublon-possible">
      <p class="carte-doublon-titre">Un signalement existe déjà ${distanceTexte}</p>
      <p class="carte-doublon-detail">
        ${plusProche.zone} — ${plusProche.type_obstacle.toLowerCase()} ${plusProche.gravite_label}, créé il y a ${plusProche.depuis} ${nonConfirme}
      </p>
      <p class="carte-doublon-question">Est-ce le même problème que celui que tu veux signaler ?</p>
      <div class="carte-doublon-actions">
        <button type="button" class="btn btn-principal" id="btn-confirmer-existant">Oui, confirmer celui-ci</button>
        <button type="button" class="btn btn-secondaire" id="btn-probleme-different">Non, c'est différent</button>
      </div>
    </div>
  `;

  document.getElementById('btn-confirmer-existant').addEventListener('click', () => {
    window.location.href = `confirmation.html?id=${plusProche.id}`;
  });

  document.getElementById('btn-probleme-different').addEventListener('click', () => {
    ignorerVerificationDoublon = true;
    messageZone.innerHTML = '';
    form.requestSubmit();
  });
}

// ---- 7bis. Mémorise ce signalement comme étant "le mien" (écran "Mes signalements") ----
// Pas de compte utilisateur : on garde juste l'ID dans le navigateur
const CLE_MES_SIGNALEMENTS = 'clearway_mes_signalements';

function marquerCommeMonSignalement(id) {
  try {
    const liste = JSON.parse(localStorage.getItem(CLE_MES_SIGNALEMENTS)) || [];
    if (!liste.includes(id)) {
      localStorage.setItem(CLE_MES_SIGNALEMENTS, JSON.stringify([...liste, id].slice(-200)));
    }
  } catch (erreur) {
    console.error('Erreur écriture localStorage :', erreur);
  }
}

// ---- 8. Envoi du formulaire (FormData car il peut contenir un fichier) ----
form.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  messageZone.innerHTML = '';

  if (!position) {
    afficherMessage('Choisis d\'abord ton emplacement : "Utiliser ma position" ou "Choisir sur la carte".', 'erreur');
    return;
  }

  // Si le quartier n'a pas été détecté automatiquement, on prend la saisie manuelle
  if (!position.quartier && champQuartierManuel.value.trim() !== '') {
    champQuartier.value = champQuartierManuel.value.trim();
  }

  // ---- Vérification des doublons possibles (une seule fois par tentative) ----
  if (!ignorerVerificationDoublon) {
    btnEnvoyer.disabled = true;
    btnEnvoyer.textContent = 'Vérification...';
    const doublons = await chercherDoublonsPossibles(position.latitude, position.longitude);
    btnEnvoyer.disabled = false;
    btnEnvoyer.textContent = 'Envoyer le signalement';

    if (doublons.length > 0) {
      afficherChoixDoublon(doublons);
      return; // on attend le choix de l'utilisateur (cf. afficherChoixDoublon)
    }
  }
  ignorerVerificationDoublon = false; // reset pour la prochaine fois

  const donnees = new FormData();
  donnees.append('type_obstacle', document.getElementById('type-obstacle').value);
  donnees.append('type_obstacle_personnalise', champTypePersonnalise.value.trim());
  donnees.append('gravite', champGravite.value);
  donnees.append('description', document.getElementById('description').value.trim());
  donnees.append('latitude', champLatitude.value);
  donnees.append('longitude', champLongitude.value);
  donnees.append('accuracy', champAccuracy.value);
  donnees.append('source_position', champSourcePosition.value);
  donnees.append('pays', champPays.value);
  donnees.append('ville', champVille.value);
  donnees.append('quartier', champQuartier.value);
  donnees.append('adresse_formatee', champAdresseFormatee.value);
  if (photoAEnvoyer) {
    donnees.append('photo', photoAEnvoyer);
  }

  btnEnvoyer.disabled = true;
  btnEnvoyer.textContent = 'Envoi en cours...';

  try {
    const reponse = await fetch(`${window.API_BASE}/signalement.php`, {
      method: 'POST',
      body: donnees, // pas de header Content-Type : le navigateur le fixe lui-même (multipart + boundary)
    });

    const resultat = await reponse.json();

    if (!reponse.ok) {
      afficherMessage(resultat.erreur || 'Une erreur est survenue.', 'erreur');
      return;
    }

    afficherMessage('Signalement envoyé avec succès.', 'succes');
    if (resultat.id) marquerCommeMonSignalement(resultat.id);
    form.reset();
    apercuPhoto.innerHTML = '';
    photoAEnvoyer = null;
    champTypePersonnalise.hidden = true;
    champTypePersonnalise.required = false;
    selecteurGravite.querySelectorAll('button').forEach(b => b.classList.remove('actif'));
    selecteurGravite.querySelector('[data-valeur="Modere"]').classList.add('actif');
    champGravite.value = 'Modere';

    // Repart de zéro sur la localisation : évite de renvoyer silencieusement
    // une position périmée si l'utilisateur signale une 2e voie dans la foulée
    reinitialiserPosition();

    // Retour à l'accueil après un court délai
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);

  } catch (erreur) {
    console.error('Erreur envoi du signalement :', erreur);
    afficherMessage('Impossible d\'envoyer le signalement. Vérifie ta connexion.', 'erreur');
  } finally {
    btnEnvoyer.disabled = false;
    btnEnvoyer.textContent = 'Envoyer le signalement';
  }
});
