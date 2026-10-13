// Captures de la documentation Slowpoke, prises sur l'instance de démonstration locale.
// Toutes les données sont fictives (example.org, plages RFC 5737).
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

// Chemin du Chromium de Playwright. `bunx playwright install chromium` le dépose ici ;
// n'importe quel Chrome convient, d'où la variable pour le remplacer.
const EXEC = process.env.CAPTURES_CHROMIUM
  || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const BASE = process.env.CAPTURES_URL || 'http://localhost:3000'
const SORTIE = process.argv[2] || './out'
mkdirSync(SORTIE, { recursive: true })

// Compte de l'instance de DÉMONSTRATION uniquement — jamais un compte de production.
const IDENTIFIANTS = {
  email: process.env.CAPTURES_EMAIL || 'demo@incidents.local',
  motDePasse: process.env.CAPTURES_MDP || '',
}
if (!IDENTIFIANTS.motDePasse) {
  console.error('❌ CAPTURES_MDP est vide. Exemple :\n   CAPTURES_MDP="…" bun run captures.mjs ./out')
  process.exit(1)
}

// Incident servant aux vues « fiche », « chronologie » et « déclarer une liste blanche ».
const INTRUSION = process.env.CAPTURES_INCIDENT || 'EXEHD8'

const navigateur = await chromium.launch({ executablePath: EXEC })
const contexte = await navigateur.newContext({
  viewport: { width: 1400, height: 950 },
  deviceScaleFactor: 1,
  locale: 'fr-FR',
  colorScheme: 'light',
})
const page = await contexte.newPage()

/** Le badge Nuxt DevTools n'a rien à faire dans une capture de documentation. */
async function masquerDevtools() {
  await page.addStyleTag({
    content: '#nuxt-devtools-anchor,nuxt-devtools-anchor,[id*="devtools"],.nuxt-devtools-anchor{display:none!important}',
  }).catch(() => {})
  await page.evaluate(() => {
    document.querySelectorAll('#nuxt-devtools-anchor, nuxt-devtools-anchor, [id*="devtools" i]')
      .forEach(e => e.remove())
  }).catch(() => {})
}

async function capture(nom, attente = 1200) {
  await page.waitForTimeout(attente)
  await masquerDevtools()
  await page.screenshot({ path: `${SORTIE}/${nom}.png`, fullPage: false })
  console.log('✓', nom)
}

async function aller(chemin, attente = 1600) {
  await page.goto(BASE + chemin, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(attente)
}

// 01 — page de connexion, avant authentification
await aller('/login')

// Connexion par le compte de secours (le SSO de démonstration n'est pas branché)
await aller('/login-secours')
await page.fill('input[type="email"]', IDENTIFIANTS.email)
await page.fill('input[type="password"]', IDENTIFIANTS.motDePasse)
await page.click('button:has-text("Se connecter")')
await page.waitForTimeout(2500)

for (const [nom, chemin] of [
  ['02-tableau-de-bord', '/'],
  ['03-liste-incidents', '/incidents'],
  ['07-stats-vue-ensemble', '/stats'],
  ['11-comptes-service', '/accounts/service'],
  ['06-reglages-notifications', '/parametres'],
  ['12-listes-blanches', '/exclusions'],
]) {
  await aller(chemin)
  await capture(nom)
}

// 10 — comptes utilisateurs : la liste se charge en différé, on la force
await aller('/accounts/users')
await page.click('button:has-text("Actualiser")').catch(() => {})
await capture('10-comptes-utilisateurs', 2500)

// 09 — query builder, avec une requête exécutée et son résultat
await aller('/stats/query-builder')
await page.evaluate(() => {
  const zone = document.querySelector('.cm-content')
  if (zone) zone.textContent = ''
})
await page.click('.cm-content').catch(() => {})
await page.keyboard.type("SELECT type, severity, status FROM incident LIMIT 5")
await page.click('button:has-text("Exécuter")').catch(() => {})
await page.waitForTimeout(1500)
// Le curseur reste en fin de ligne et fait défiler l'éditeur : on le ramène au début.
await page.click('.cm-content').catch(() => {})
await page.keyboard.press('Home')
await capture('09-query-builder', 1500)

// 14 — valeurs récurrentes, seuil abaissé à 2 pour montrer plusieurs recoupements
await aller('/stats/correlation')
const champSeuil = page.locator('input[type="number"]').nth(1)
await champSeuil.fill('2').catch(() => {})
await page.click('button:has-text("Actualiser")').catch(() => {})
await capture('14-valeurs-recurrentes', 2000)

// 04 — fiche d'incident, onglet Détails
await aller(`/incidents/${INTRUSION}`)
await capture('04-fiche-incident-details')

// 05 — même fiche, onglet Chronologie
await page.click('button:has-text("Chronologie"), [role="tab"]:has-text("Chronologie")').catch(() => {})
await capture('05-fiche-incident-activite')

// 13 — déclaration d'une liste blanche depuis le menu « ⋯ »
await aller(`/incidents/${INTRUSION}`)
await page.click('button[title="Autres actions"]').catch(() => {})
await page.waitForTimeout(500)
await page.click('text=Déclarer une liste blanche').catch(() => {})
await page.waitForTimeout(900)
// Une portée volontairement trop large, pour montrer l'avertissement
await page.fill('input[placeholder*="Program Files"]', 'C:/').catch(() => {})
await capture('13-declarer-liste-blanche', 1200)

// 08 — widgets, mode « Modifier la disposition » actif
await aller('/stats/widgets')
await page.click('button:has-text("Modifier la disposition")').catch(() => {})
await capture('08-stats-widgets')

await navigateur.close()
console.log('Terminé.')
