// Pages accessibles SANS session. `/login-secours` doit en faire partie : c'est la voie
// de reprise en main quand le SSO est en panne, et elle est par nature visitée par
// quelqu'un qui n'est pas encore connecté. Sans cette exception, le middleware la
// renvoyait vers /login — donc elle était inatteignable au seul moment où elle sert.
const PAGES_PUBLIQUES = ['/login', '/login-secours']

export default defineNuxtRouteMiddleware(async (to) => {
  const data = await useSSRAuth()
  const estPublique = PAGES_PUBLIQUES.includes(to.path)

  // Déjà connecté : rien à faire sur une page de connexion.
  if (data.value && estPublique) {
    return navigateTo('/')
  }

  if (!data.value && !estPublique) {
    return navigateTo('/login')
  }
})
