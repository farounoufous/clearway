// ============================================
// ClearWay Bénin - Écran Mes signalements
// Historique 100% local : aucun compte requis. Les IDs des signalements
// créés par ce visiteur sont mémorisés dans son navigateur (voir signalement.js)
// et servent ici à retrouver leur détail auprès du backend.
// ============================================

window.API_BASE = window.API_BASE || '../backend/api';

const CLE_MES_SIGNALEMENTS = 'clearway_mes_signalements';

function recupererMesSignalementsIds() {
  try {
    return JSON.parse(localStorage.getItem(CLE_MES_SIGNALEMENTS)) || [];
  } catch {
    return [];
  }
}

async function chargerMesSignalements() {
  const listeEl = document.getElementById('liste-mes-signalements');
  const ids = recupererMesSignalementsIds();

  if (ids.length === 0) {
    listeEl.innerHTML = `
      <p class="etat-vide">
        Tu n'as pas encore créé de signalement sur cet appareil.<br>
        Dès que tu en signales un, il apparaîtra ici.
      </p>
    `;
    return;
  }

  try {
    const reponse = await fetch(`${window.API_BASE}/mes-signalements.php?ids=${ids.join(',')}`);
    if (!reponse.ok) throw new Error('Réponse serveur invalide');
    const signalements = await reponse.json();

    if (signalements.length === 0) {
      listeEl.innerHTML = '<p class="etat-vide">Aucun de tes signalements n\'a pu être retrouvé.</p>';
      return;
    }

    listeEl.innerHTML = signalements.map(s => `
      <a href="confirmation.html?id=${s.id}" class="carte-voie ${s.gravite_classe}">
        ${s.photo ? `<img src="${s.photo}" class="photo-signalement" alt="Photo du dégât">` : ''}
        <div class="nom-zone">${s.zone}</div>
        <div class="info">Obstacle : ${s.gravite_label} · ${s.type_obstacle}</div>
        <div class="info">Confirmations : ${s.nb_confirmations}</div>
        <div class="info">Signalé le ${s.date_creation}</div>
        ${s.lien_maps ? `<button type="button" class="btn-voir-maps" data-maps="${s.lien_maps}">Voir sur Maps</button>` : ''}
      </a>
    `).join('');

    listeEl.querySelectorAll('.btn-voir-maps').forEach(bouton => {
      bouton.addEventListener('click', (evenement) => {
        evenement.preventDefault();
        evenement.stopPropagation();
        window.open(bouton.dataset.maps, '_blank', 'noopener');
      });
    });

  } catch (erreur) {
    listeEl.innerHTML = '<p class="etat-vide">Impossible de charger tes signalements. Vérifie ta connexion.</p>';
    console.error('Erreur chargement mes signalements :', erreur);
  }
}

document.addEventListener('DOMContentLoaded', chargerMesSignalements);
