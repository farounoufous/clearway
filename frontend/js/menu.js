// ============================================
// ClearWay Bénin - Panneau déroulant du menu (hamburger)
// Même comportement que le panneau de notifications : petit panneau ancré
// sous le bouton, fermeture au clic en dehors (pas de fond assombri)
// ============================================

const btnMenu = document.getElementById('btn-menu');
const menuLateral = document.getElementById('menu-lateral');
const btnFermerMenu = document.getElementById('btn-fermer-menu');

function ouvrirMenu() {
  menuLateral.hidden = false;
}

function fermerMenu() {
  menuLateral.hidden = true;
}

if (btnMenu) {
  btnMenu.addEventListener('click', (evenement) => {
    evenement.stopPropagation();
    if (menuLateral.hidden) {
      ouvrirMenu();
    } else {
      fermerMenu();
    }
  });

  btnFermerMenu.addEventListener('click', fermerMenu);

  // Ferme le panneau si on clique en dehors
  document.addEventListener('click', (evenement) => {
    if (!menuLateral.hidden && !menuLateral.contains(evenement.target) && evenement.target !== btnMenu) {
      fermerMenu();
    }
  });
}
