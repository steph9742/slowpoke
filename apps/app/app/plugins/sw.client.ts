// Enregistre le service worker des notifications push (servi à /sw.js).
// Sans ça, navigator.serviceWorker.ready ne résout jamais et l'abonnement push reste bloqué.
export default defineNuxtPlugin(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Échec de l\'enregistrement du service worker:', err)
    })
  }
})
