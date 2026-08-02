// Mode clair par défaut, quel que soit le réglage du système.
// Seul un choix explicite de l'utilisateur (bouton du menu) active le mode sombre.
const CLE_THEME = 'clearway_theme';

// ---- Applique tout de suite le thème (avant l'affichage, pour éviter un
// flash de la mauvaise couleur au chargement) : sombre uniquement si
// l'utilisateur l'a choisi explicitement, clair dans tous les autres cas ----
(function appliquerThemeSauvegarde() {
  const theme = localStorage.getItem(CLE_THEME);
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
})();

// ---- Détermine le thème actuellement affiché (choix explicite, sinon clair par défaut) ----
function themeActuellementAffiche() {
  return localStorage.getItem(CLE_THEME) === 'dark' ? 'dark' : 'light';
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