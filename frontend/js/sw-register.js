// notifications.js gère séparément l'abonnement push proprement dit.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((erreur) => {
      console.error('Échec de l\'enregistrement du service worker :', erreur);
    });
  });
}
