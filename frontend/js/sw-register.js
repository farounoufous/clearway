// ============================================
// ClearWay Bénin - Enregistrement du Service Worker
// Indépendant des notifications push : sert uniquement à activer le cache
// hors-ligne (app shell + dernières données) sur TOUTES les pages.
// notifications.js gère séparément l'abonnement push proprement dit.
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((erreur) => {
      console.error('Échec de l\'enregistrement du service worker :', erreur);
    });
  });
}
