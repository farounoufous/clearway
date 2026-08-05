window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';
const CLE_SIGNALEMENTS_VUS = 'clearway_signalements_vus';

function recupererSignalementsVus() {
  try {
    return JSON.parse(localStorage.getItem(CLE_SIGNALEMENTS_VUS)) || [];
  } catch {
    return [];
  }
}

function marquerSignalementCommeVu(id) {
  try {
    const vus = recupererSignalementsVus();
    if (!vus.includes(id)) {
      localStorage.setItem(CLE_SIGNALEMENTS_VUS, JSON.stringify([...vus, id].slice(-100)));
    }
  } catch (erreur) {
    console.error('Erreur écriture localStorage :', erreur);
  }
}

// ---- Normalise un texte pour une recherche insensible aux accents/majuscules ----
// (utile pour des noms comme "Fidjrossè")
function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

let toutesLesVoies = [];

function afficherVoies(voies) {
  const listeEl = document.getElementById('liste-voies');

  if (voies.length === 0) {
    listeEl.innerHTML = '<p class="etat-vide">Aucune voie ne correspond à votre recherche.</p>';
    return;
  }

  const vus = recupererSignalementsVus();

  listeEl.innerHTML = voies.map(v => {
    const afficherBadge = v.est_nouveau && !vus.includes(v.id);
    const miniBarre = v.nb_degagees > 0
      ? `<div class="mini-progression" title="${v.nb_degagees} sur 3 confirmations 'Voie dégagée'">
           <div class="mini-progression-piste"><div class="mini-progression-remplissage" style="width:${v.progression_degagee}%"></div></div>
         </div>`
      : '';
    return `
    <a href="confirmation.html?id=${v.id}" class="carte-voie ${v.gravite_classe}" data-id="${v.id}">
      ${v.photo ? `<img src="${v.photo}" class="photo-signalement" alt="Photo du dégât">` : ''}
      <div class="nom-zone">${v.zone}${afficherBadge ? '<span class="badge-nouveau">Nouveau</span>' : ''}${v.recemment_degagee ? '<span class="badge-degagee">Récemment dégagée</span>' : ''}${v.confiance === 'incertain' ? '<span class="badge-incertain">Non confirmé</span>' : ''}</div>
      <div class="info">Obstacle : ${v.gravite_label}</div>
      <div class="info">Confirmation ${v.nb_confirmations}${v.valide ? ', validée par la communauté' : ''}</div>
      ${miniBarre}
      ${v.lien_maps ? `<button type="button" class="btn-voir-maps" data-maps="${v.lien_maps}">Voir sur Maps</button>` : ''}
    </a>
  `;
  }).join('');

  listeEl.querySelectorAll('.carte-voie').forEach(el => {
    el.addEventListener('click', () => {
      marquerSignalementCommeVu(Number(el.dataset.id));
    });
  });

  // Le bouton Maps ne doit pas déclencher la navigation vers confirmation.html
  // (il est à l'intérieur de la carte, qui est elle-même un lien)
  listeEl.querySelectorAll('.btn-voir-maps').forEach(bouton => {
    bouton.addEventListener('click', (evenement) => {
      evenement.preventDefault();
      evenement.stopPropagation();
      window.open(bouton.dataset.maps, '_blank', 'noopener');
    });
  });
}

async function chargerVoies() {
  const listeEl = document.getElementById('liste-voies');

  try {
    const reponse = await fetch(`${window.API_BASE}/voies.php`);
    if (!reponse.ok) throw new Error('Réponse serveur invalide');
    toutesLesVoies = await reponse.json();

    if (toutesLesVoies.length === 0) {
      listeEl.innerHTML = '<p class="etat-vide">Aucune voie bloquée pour le moment.</p>';
      return;
    }

    afficherVoies(toutesLesVoies);

  } catch (erreur) {
    listeEl.innerHTML = '<p class="etat-vide">Impossible de charger les voies. Vérifiez votre connexion.</p>';
    console.error('Erreur chargement voies :', erreur);
  }
}

// ---- Recherche par zone (filtre la liste déjà chargée, aucun appel serveur) ----
const champRecherche = document.getElementById('recherche-zone');

champRecherche.addEventListener('input', () => {
  const requete = normaliser(champRecherche.value);

  if (requete === '') {
    afficherVoies(toutesLesVoies);
    return;
  }

  const resultats = toutesLesVoies.filter(v => normaliser(v.zone).includes(requete));
  afficherVoies(resultats);
});

document.addEventListener('DOMContentLoaded', chargerVoies);
