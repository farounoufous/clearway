// Par défaut, l'app suit le réglage du système (prefers-color-scheme).
// Ce script permet de FORCER un choix explicite via le bouton du menu,
// qui prime alors sur le système jusqu'à ce que l'utilisateur le change.
const CLE_THEME = 'clearway_theme';

// ---- Applique tout de suite la préférence sauvegardée (avant l'affichage,
// pour éviter un flash de la mauvaise couleur au chargement) ----
(function appliquerThemeSauvegarde() {
  const theme = localStorage.getItem(CLE_THEME);
  if (theme === 'dark' || theme === 'light') {
    document.documentElement.setAttribute('data-theme', theme);
  }
})();

// ---- Détermine le thème actuellement affiché (forcé, ou sinon système) ----
function themeActuellementAffiche() {
  const force = localStorage.getItem(CLE_THEME);
  if (force === 'dark' || force === 'light') return force;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function mettreAJourBoutonTheme() {
  const bouton = document.getElementById('btn-theme');
  if (!bouton) return; // le bouton n'existe que dans le menu de l'accueil

  const estSombre = themeActuellementAffiche() === 'dark';
  bouton.setAttribute('aria-pressed', estSombre ? 'true' : 'false');
  const libelle = bouton.querySelector('.libelle');
  if (libelle) libelle.textContent = estSombre ? 'Mode sombre' : 'Mode clair';
}

function basculerTheme() {
  const nouveauTheme = themeActuellementAffiche() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(CLE_THEME, nouveauTheme);
  document.documentElement.setAttribute('data-theme', nouveauTheme);
  mettreAJourBoutonTheme();
}

document.addEventListener('DOMContentLoaded', () => {
  mettreAJourBoutonTheme();
  const bouton = document.getElementById('btn-theme');
  if (bouton) bouton.addEventListener('click', basculerTheme);
});
