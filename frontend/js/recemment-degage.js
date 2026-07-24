// ============================================
// ClearWay Bénin - Écran Récemment dégagé
// ============================================

window.API_BASE = window.API_BASE || '../backend/api';

async function chargerRecemmentDegage() {
  const listeEl = document.getElementById('liste-recemment-degage');

  try {
    const reponse = await fetch(`${window.API_BASE}/recemment-degage.php`);
    if (!reponse.ok) throw new Error('Réponse serveur invalide');
    const items = await reponse.json();

    if (!items || items.length === 0) {
      listeEl.innerHTML = '<p class="etat-vide">Aucune voie dégagée confirmée dans les dernières 24h.</p>';
      return;
    }

    listeEl.innerHTML = items.map(item => `
      <div class="carte-degage">
        <div class="carte-degage-icone"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>
        <div>
          <div class="carte-degage-zone">${item.zone}</div>
          <div class="carte-degage-details">${item.type_obstacle} ${item.gravite_label} · confirmée par ${item.nb_degagees} utilisateurs · ${item.il_y_a}</div>
        </div>
      </div>
    `).join('');

  } catch (erreur) {
    listeEl.innerHTML = '<p class="etat-vide">Impossible de charger la liste. Vérifie ta connexion.</p>';
    console.error('Erreur chargement récemment dégagé :', erreur);
  }
}

document.addEventListener('DOMContentLoaded', chargerRecemmentDegage);
