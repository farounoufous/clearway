function afficherModal({ titre, message, texteConfirmer = 'Confirmer', texteAnnuler = 'Annuler', dangereux = false, alerteSeule = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-confirmation-action" role="dialog" aria-modal="true" aria-labelledby="modal-action-titre">
        ${titre ? `<h2 id="modal-action-titre">${titre}</h2>` : ''}
        <p>${message}</p>
        <div class="modal-actions">
          ${alerteSeule
            ? `<button type="button" class="btn btn-principal" data-action="ok">OK</button>`
            : `
              <button type="button" class="btn ${dangereux ? 'btn-rouge' : 'btn-principal'}" data-action="confirmer">${texteConfirmer}</button>
              <button type="button" class="btn btn-secondaire" data-action="annuler">${texteAnnuler}</button>
            `
          }
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden'; // empêche le scroll de la page derrière la modale

    function fermer(resultat) {
      overlay.classList.add('fermeture');
      document.body.style.overflow = '';
      setTimeout(() => overlay.remove(), 150); // laisse l'animation de sortie se jouer
      resolve(resultat);
    }

    overlay.querySelector('[data-action="confirmer"], [data-action="ok"]')
      ?.addEventListener('click', () => fermer(true));
    overlay.querySelector('[data-action="annuler"]')
      ?.addEventListener('click', () => fermer(false));

    // Clic sur le fond flouté (en dehors de la carte) = équivalent à "Annuler"
    overlay.addEventListener('click', (evenement) => {
      if (evenement.target === overlay) fermer(false);
    });
  });
}

// ---- Remplace confirm() : renvoie true/false selon le bouton cliqué ----
function afficherConfirmationModale(message, options = {}) {
  return afficherModal({ message, ...options });
}

// ---- Remplace alert() : un seul bouton "OK", se résout quand il est cliqué ----
function afficherAlerteModale(message, titre = null) {
  return afficherModal({ titre, message, alerteSeule: true });
}
