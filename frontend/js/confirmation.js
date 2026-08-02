window.API_BASE = window.API_BASE || 'https://clearway-production-6e27.up.railway.app/api';

const params = new URLSearchParams(window.location.search);
const signalementId = params.get('id');
const zoneContenu = document.getElementById('zone-contenu');
let zoneActuelle = '';

const CLE_SIGNALEMENTS_VUS = 'clearway_signalements_vus';
const CLE_MES_SIGNALEMENTS = 'clearway_mes_signalements';
const CLE_VOTES = 'clearway_signalement_votes'; // { [id]: { toujours_bloquee: true, voie_degagee: true } }
const CLE_VISITEUR_ID = 'clearway_visiteur_id';

function obtenirVisiteurId() {
  let id = localStorage.getItem(CLE_VISITEUR_ID);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    localStorage.setItem(CLE_VISITEUR_ID, id);
  }
  return id;
}

// ---- Ce visiteur est-il l'auteur de ce signalement ? (mémorisé lors de l'envoi, cf. signalement.js) ----
function estProprietaireDuSignalement(id) {
  try {
    const liste = JSON.parse(localStorage.getItem(CLE_MES_SIGNALEMENTS)) || [];
    return liste.includes(Number(id));
  } catch {
    return false;
  }
}

function recupererVotes(id) {
  try {
    const votes = JSON.parse(localStorage.getItem(CLE_VOTES)) || {};
    return votes[id] || {};
  } catch {
    return {};
  }
}

function enregistrerVote(id, action) {
  try {
    const votes = JSON.parse(localStorage.getItem(CLE_VOTES)) || {};
    votes[id] = { ...(votes[id] || {}), [action]: true };
    localStorage.setItem(CLE_VOTES, JSON.stringify(votes));
  } catch (erreur) {
    console.error('Erreur écriture localStorage :', erreur);
  }
}

function marquerSignalementCommeVu(id) {
  try {
    const vus = JSON.parse(localStorage.getItem(CLE_SIGNALEMENTS_VUS)) || [];
    if (!vus.includes(Number(id))) {
      localStorage.setItem(CLE_SIGNALEMENTS_VUS, JSON.stringify([...vus, Number(id)].slice(-100)));
    }
  } catch (erreur) {
    console.error('Erreur écriture localStorage :', erreur);
  }
}

// ---- Icônes SVG (remplacent les emojis pour un rendu plus soigné) ----
const ICONE_CHECK_CERCLE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
const ICONE_PROGRESSION = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>';
const ICONE_COMMUNAUTE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
const ICONE_INFO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
const ICONE_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

// ---- Message encourageant selon le nombre de confirmations "voie dégagée" ----
function messageProgressionDegagee(nbDegagees, seuil) {
  if (nbDegagees >= seuil) {
    return `<span class="icone-inline">${ICONE_CHECK_CERCLE}</span>Merci à tous ! La voie a été confirmée dégagée par la communauté. `;
  }
  if (nbDegagees === seuil - 1) {
    return `<span class="icone-inline">${ICONE_PROGRESSION}</span>Presque bon ! Une dernière personne doit encore confirmer, et cette voie disparaîtra automatiquement de la liste des voies bloquées.`;
  }
  if (nbDegagees >= 1) {
    return `<span class="icone-inline">${ICONE_COMMUNAUTE}</span> Merci pour ta confirmation ! Il faut encore ${seuil - nbDegagees} confirmations avant que cette voie soit retirée de la liste des voies bloquées.`;
  }
  return '';
}

function construireBarreProgression(progression, nbDegagees, seuil) {
  return `
    <div class="progression-degagee">
      <div class="progression-degagee-en-tete">
        <span>Confirmations "voie dégagée"</span>
        <span>${nbDegagees}/${seuil}</span>
      </div>
      <div class="progression-degagee-piste">
        <div class="progression-degagee-remplissage" style="width:${progression}%"></div>
      </div>
    </div>
  `;
}

function afficherContenu(details) {
  zoneActuelle = details.zone;
  const estProprietaire = estProprietaireDuSignalement(signalementId);
  const votes = recupererVotes(signalementId);
  const seuilAtteint = details.nb_degagees >= details.seuil_degagees;

  const bandeauIncertain = details.confiance === 'incertain'
    ? `<div class="bandeau-incertain"><span class="icone-inline">${ICONE_INFO}</span>Personne n'a reconfirmé ce signalement depuis un moment : sa fiabilité est incertaine. Si tu passes par ici, dis-nous si c'est toujours bloqué.</div>`
    : '';

  // ---- Cas particulier : le seuil est déjà atteint -> on remplace les boutons
  // de vote par un unique bouton de confirmation finale explicite ----
  if (seuilAtteint) {
    zoneContenu.innerHTML = `
      ${details.photo ? `<img src="${details.photo}" class="photo-signalement" alt="Photo du dégât">` : ''}
      ${bandeauIncertain}
      <div class="boite-confirmation">
        ${details.nb_confirmations} personnes ont confirmé
        <div class="sous-titre">${details.zone} · Obstacle ${details.gravite_label}</div>
        ${details.lien_maps ? `<a href="${details.lien_maps}" target="_blank" rel="noopener" class="lien-maps-confirmation">Voir la position exacte sur Maps</a>` : ''}
      </div>

      <p class="message-progression">
        <span class="icone-inline">${ICONE_CHECK_CERCLE}</span>
        La communauté a confirmé que cette voie est dégagée (${details.nb_degagees}/${details.seuil_degagees}) !
        Confirme pour la retirer définitivement de la liste.
      </p>

      <button type="button" class="btn btn-principal" id="btn-confirmer-degagement">Confirmer et retirer de la liste</button>

    `;

    document.getElementById('btn-confirmer-degagement').addEventListener('click', confirmerArchivageDefinitif);
    return;
  }

  const messagePregression = messageProgressionDegagee(details.nb_degagees, details.seuil_degagees);

  zoneContenu.innerHTML = `
    ${details.photo ? `<img src="${details.photo}" class="photo-signalement" alt="Photo du dégât">` : ''}
    ${bandeauIncertain}
    <div class="boite-confirmation">
      ${details.nb_confirmations} personnes ont confirmé
      <div class="sous-titre">${details.zone} · Obstacle ${details.gravite_label}</div>
      ${details.lien_maps ? `<a href="${details.lien_maps}" target="_blank" rel="noopener" class="lien-maps-confirmation">Voir la position exacte sur Maps</a>` : ''}
    </div>

    ${construireBarreProgression(details.progression_degagee, details.nb_degagees, details.seuil_degagees)}

    ${messagePregression ? `<p class="message-progression">${messagePregression}</p>` : ''}


    <button type="button" class="btn btn-rouge" id="btn-toujours-bloquee">Toujours  bloquée, je confirme</button>
    <button type="button" class="btn btn-bleu-contour" id="btn-voie-degagee">La voie est dégagée</button>

    ${votes.signalement_errone
      ? '<button type="button" class="lien-discret lien-signaler-errone" disabled>Signalement transmis, merci</button>'
      : `<button type="button" class="lien-discret lien-signaler-errone" id="btn-signaler-errone">Ce signalement te semble faux ou suspect ? Le signaler (${details.nb_errones}/${details.seuil_errone})</button>`
    }

  `;

  const btnToujoursBloquee = document.getElementById('btn-toujours-bloquee');
  const btnVoieDegagee = document.getElementById('btn-voie-degagee');
  const btnSignalerErrone = document.getElementById('btn-signaler-errone');

  if (btnSignalerErrone) {
    btnSignalerErrone.addEventListener('click', signalerErrone);
  }

  // ---- Règle 1 : le propriétaire ne peut JAMAIS confirmer "toujours bloquée" sur son propre signalement ----
  if (estProprietaire) {
    btnToujoursBloquee.classList.add('verrouille');
    btnToujoursBloquee.addEventListener('click', (evenement) => {
      evenement.preventDefault();
      afficherMessageProprietaire();
    });
  } else if (votes.toujours_bloquee) {
    verrouillerBouton(btnToujoursBloquee);
  } else {
    btnToujoursBloquee.addEventListener('click', () => envoyerAction('toujours_bloquee', btnToujoursBloquee, btnVoieDegagee));
  }

  // ---- Règle 2 : "voie dégagée" reste ouvert à tous, y compris au propriétaire ----
  // (son vote compte pour 1 des 3 nécessaires) — juste une seule fois par visiteur.
  if (votes.voie_degagee) {
    verrouillerBouton(btnVoieDegagee);
  } else {
    btnVoieDegagee.addEventListener('click', () => envoyerAction('voie_degagee', btnToujoursBloquee, btnVoieDegagee));
  }
}

function afficherMessageProprietaire() {
  let bulle = document.getElementById('bulle-message-proprietaire');
  if (!bulle) {
    bulle = document.createElement('p');
    bulle.id = 'bulle-message-proprietaire';
    bulle.className = 'message-etat erreur';
    document.getElementById('note-archivage').insertAdjacentElement('beforebegin', bulle);
  }
  bulle.innerHTML = `<span class="icone-inline">${ICONE_INFO}</span>Ce sont les autres utilisateurs qui peuvent confirmer ton signalement, pas toi.`;
}

function verrouillerBouton(bouton) {
  bouton.disabled = true;
  bouton.innerHTML = `<span class="icone-inline">${ICONE_CHECK}</span>Confirmation enregistrée`;
}

async function chargerDetails() {
  if (!signalementId) {
    zoneContenu.innerHTML = '<p class="etat-vide">Aucun signalement sélectionné.</p>';
    return;
  }

  try {
    const reponse = await fetch(`${window.API_BASE}/confirmation.php?id=${signalementId}`);
    const details = await reponse.json();

    if (!reponse.ok) {
      zoneContenu.innerHTML = `<p class="etat-vide">${details.erreur || 'Erreur de chargement.'}</p>`;
      return;
    }

    if (details.statut !== 'actif' && details.statut !== 'incertain') {
      zoneContenu.innerHTML = '<p class="etat-vide">Ce signalement a déjà été archivé.</p>';
      return;
    }

    marquerSignalementCommeVu(signalementId);
    afficherContenu(details);

  } catch (erreur) {
    zoneContenu.innerHTML = '<p class="etat-vide">Impossible de charger le signalement. Vérifie ta connexion.</p>';
    console.error('Erreur chargement confirmation :', erreur);
  }
}

async function envoyerAction(action, btnToujoursBloquee, btnVoieDegagee) {
  // Empêche tout double-clic pendant que la requête est en cours (sur les deux boutons,
  // pour éviter de cliquer l'autre pendant l'envoi)
  btnToujoursBloquee.disabled = true;
  btnVoieDegagee.disabled = true;
  const texteOriginalToujoursBloquee = btnToujoursBloquee.textContent;
  const texteOriginalVoieDegagee = btnVoieDegagee.textContent;
  if (action === 'toujours_bloquee') btnToujoursBloquee.textContent = 'Envoi en cours...';
  if (action === 'voie_degagee') btnVoieDegagee.textContent = 'Envoi en cours...';

  try {
    const reponse = await fetch(`${window.API_BASE}/confirmation.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signalement_id: signalementId,
        action,
        visiteur_id: obtenirVisiteurId(),
      }),
    });
    const resultat = await reponse.json();

    if (!reponse.ok) {
      alert(resultat.erreur || 'Une erreur est survenue.');
      btnToujoursBloquee.disabled = false;
      btnVoieDegagee.disabled = false;
      btnToujoursBloquee.textContent = texteOriginalToujoursBloquee;
      btnVoieDegagee.textContent = texteOriginalVoieDegagee;
      return;
    }

    enregistrerVote(signalementId, action);

    // Recharge l'écran à jour (nouveau compte, nouvelle barre de progression, boutons
    // verrouillés, ou bascule vers l'écran "seuil atteint" si on vient de l'atteindre)
    chargerDetails();

  } catch (erreur) {
    console.error('Erreur envoi confirmation :', erreur);
    alert('Impossible d\'envoyer ta confirmation. Vérifie ta connexion.');
    btnToujoursBloquee.disabled = false;
    btnVoieDegagee.disabled = false;
    btnToujoursBloquee.textContent = texteOriginalToujoursBloquee;
    btnVoieDegagee.textContent = texteOriginalVoieDegagee;
  }
}

// ---- Signale ce signalement comme faux/suspect/mal placé (seuil bas : 2 avis distincts) ----
async function signalerErrone() {
  if (!confirm('Confirmer que ce signalement te semble faux ou mal placé ?')) return;

  const bouton = document.getElementById('btn-signaler-errone');
  bouton.disabled = true;
  bouton.textContent = 'Envoi en cours...';

  try {
    const reponse = await fetch(`${window.API_BASE}/confirmation.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signalement_id: signalementId,
        action: 'signalement_errone',
        visiteur_id: obtenirVisiteurId(),
      }),
    });
    const resultat = await reponse.json();

    if (!reponse.ok) {
      alert(resultat.erreur || 'Une erreur est survenue.');
      bouton.disabled = false;
      bouton.textContent = `Ce signalement te semble faux ou suspect ? Le signaler`;
      return;
    }

    enregistrerVote(signalementId, 'signalement_errone');

    if (resultat.archive) {
      zoneContenu.innerHTML = `
        <div class="boite-confirmation">
          <span class="icone-inline">${ICONE_INFO}</span>Merci, ce signalement a été retiré suite à plusieurs signalements d'erreur.
        </div>
      `;
      setTimeout(() => { window.location.href = 'voies.html'; }, 1500);
    } else {
      chargerDetails(); // recharge l'écran (compteur mis à jour, bouton verrouillé)
    }

  } catch (erreur) {
    console.error('Erreur signalement erroné :', erreur);
    alert('Impossible d\'envoyer ton signalement. Vérifie ta connexion.');
    bouton.disabled = false;
    bouton.textContent = `Ce signalement te semble t'il faux ou suspect ? Le signaler`;
  }
}

// ---- Clic explicite pour retirer définitivement la voie de la liste,
// une fois le seuil de 3 confirmations déjà atteint ----
async function confirmerArchivageDefinitif() {
  const bouton = document.getElementById('btn-confirmer-degagement');
  bouton.disabled = true;
  bouton.textContent = 'Confirmation en cours...';

  try {
    const reponse = await fetch(`${window.API_BASE}/confirmation.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signalement_id: signalementId,
        action: 'confirmer_degagement',
        visiteur_id: obtenirVisiteurId(),
      }),
    });
    const resultat = await reponse.json();

    if (!reponse.ok) {
      alert(resultat.erreur || 'Une erreur est survenue.');
      bouton.disabled = false;
      bouton.textContent = 'Confirmer et retirer de la liste';
      return;
    }

    if (typeof ajouterNotificationLocale === 'function') {
      ajouterNotificationLocale({
        titre: 'Voie dégagée',
        message: `${zoneActuelle} a été retirée de la liste des voies bloquées.`,
      });
    }

    zoneContenu.innerHTML = `
      <div class="boite-confirmation">
        <span class="icone-inline">${ICONE_CHECK_CERCLE}</span>Merci ! Cette voie n'est plus bloquée
      </div>
    `;
    setTimeout(() => { window.location.href = 'voies.html'; }, 1500);

  } catch (erreur) {
    console.error('Erreur confirmation archivage :', erreur);
    alert('Impossible d\'envoyer ta confirmation. Vérifie ta connexion.');
    bouton.disabled = false;
    bouton.textContent = 'Confirmer et retirer de la liste';
  }
}

document.addEventListener('DOMContentLoaded', chargerDetails);
