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

  document.addEventListener('click', (evenement) => {
    if (!menuLateral.hidden && !menuLateral.contains(evenement.target) && evenement.target !== btnMenu) {
      fermerMenu();
    }
  });
}
