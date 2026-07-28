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

async function chargerAccueil(rafraichissementSilencieux = false) {
  const listeEl = document.getElementById('liste-signalements');

  try {
    const reponse = await fetch(`${window.API_BASE}/accueil.php`);
    if (!reponse.ok) throw new Error('Réponse serveur invalide');
    const donnees = await reponse.json();

    document.getElementById('nb-bloquees').textContent = donnees.nb_bloquees;
    document.getElementById('nb-actifs').textContent = donnees.nb_actifs;

    // Alimente la cloche de notifications avec les signalements réellement nouveaux
    if (typeof detecterNouveauxSignalements === 'function') {
      detecterNouveauxSignalements(donnees.derniers_signalements || []);
    }

    if (!donnees.derniers_signalements || donnees.derniers_signalements.length === 0) {
      listeEl.innerHTML = '<p class="etat-vide">Aucun signalement pour le moment.</p>';
      return;
    }

    const vus = recupererSignalementsVus();

    listeEl.innerHTML = donnees.derniers_signalements.map(s => {
      const afficherBadge = s.est_nouveau && !vus.includes(s.id);
      return `
      <a href="confirmation.html?id=${s.id}" class="carte-signalement-accueil ${s.gravite_classe}" data-id="${s.id}">
        ${afficherBadge ? '<span class="badge-nouveau badge-nouveau-carte">Nouveau</span>' : ''}
        <div class="carte-signalement-tete">
          <span class="pastille-gravite ${s.gravite_classe}"></span>
          <span class="carte-signalement-gravite">${s.gravite_label}</span>
        </div>
        <div class="carte-signalement-zone">${s.zone}</div>
        <div class="carte-signalement-details">
          <span>${s.type_obstacle}</span>
          <span class="separateur-point">·</span>
          <span>${s.date_heure}</span>
        </div>
        ${s.description_apercu ? `<div class="carte-signalement-description">${s.description_apercu}</div>` : ''}
      </a>
    `;
    }).join('');

    listeEl.querySelectorAll('.carte-signalement-accueil').forEach(el => {
      el.addEventListener('click', () => {
        marquerSignalementCommeVu(Number(el.dataset.id));
      });
    });

  } catch (erreur) {
    // Un rafraîchissement silencieux qui échoue ne doit pas effacer la liste déjà affichée
    if (!rafraichissementSilencieux) {
      listeEl.innerHTML = '<p class="etat-vide">Impossible de charger les signalements. Vérifie ta connexion.</p>';
    }
    console.error('Erreur chargement accueil :', erreur);
  }
}

// ---- Rafraîchissement automatique toutes les 10 secondes ----
// Permet de voir arriver les nouveaux signalements sans recharger la page
setInterval(() => chargerAccueil(true), 10000);

document.addEventListener('DOMContentLoaded', chargerAccueil);
