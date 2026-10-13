import { auth } from "@slowpoke/auth"
import { db } from "@slowpoke/database"
import { authSchema } from "@slowpoke/database/tables"
import { eq } from "drizzle-orm"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

// COMPTE ADMINISTRATEUR DE SECOURS.
//
// Il permet de reprendre la main quand le SSO est indisponible — panne d'annuaire, client OIDC
// mal déclaré, claim `groups` absent. Le SSO n'attribue que `admin` (groupe configuré) ou
// `user` (aucun accès) : si l'annuaire ne répond plus, personne ne peut promouvoir personne.

// `||` et non `??` : le compose passe une chaîne VIDE quand la variable n'est pas
// renseignée dans .env, et une chaîne vide doit retomber sur le défaut.
const email = process.env.SEED_ADMIN_EMAIL || 'secours@incidents.local'
const name = process.env.SEED_ADMIN_NAME || 'Administrateur de secours'

/** Mot de passe robuste, lisible à la voix et sans caractère ambigu (0/O, 1/l/I). */
function engendrerMotDePasse(longueur = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-+=?!@#'
  const octets = crypto.getRandomValues(new Uint8Array(longueur))
  return Array.from(octets, o => alphabet[o % alphabet.length]).join('')
}

// D'OÙ VIENT LE MOT DE PASSE, par ordre de priorité.
//
// Le FICHIER passe avant la variable d'environnement, et ce n'est pas un détail : une
// variable se lit dans `docker inspect`, dans la liste des processus et dans les journaux
// de l'orchestrateur. Un fichier en droits 0600 reste sur le disque, et surtout il se
// COPIE — c'est ce qui permet à deux installations de partager le même identifiant de
// secours, là où un mot de passe engendré localement différerait sur chacune.
const CHEMIN_SECRET_DEFAUT = '.secrets/admin-password'

function lireFichier(chemin: string): string | null {
  try {
    const contenu = readFileSync(chemin, 'utf8').trim()
    return contenu || null
  }
  catch { return null }
}

let origineMotDePasse: 'fichier' | 'variable' | 'engendré'
let password: string | null = null

// 1. Fichier explicitement désigné (convention des secrets Docker).
const cheminDesigne = process.env.SEED_ADMIN_PASSWORD_FILE
if (cheminDesigne) {
  password = lireFichier(cheminDesigne)
  if (!password) {
    console.error(`❌ SEED_ADMIN_PASSWORD_FILE désigne « ${cheminDesigne} », mais ce fichier est introuvable ou vide.`)
    process.exit(1)
  }
  origineMotDePasse = 'fichier'
}
// 2. Variable d'environnement (installations automatisées).
else if (process.env.SEED_ADMIN_PASSWORD) {
  password = process.env.SEED_ADMIN_PASSWORD
  origineMotDePasse = 'variable'
}
// 3. Fichier de secret local, s'il existe déjà : le seed est rejoué à chaque déploiement,
//    et le mot de passe doit rester le même d'une fois sur l'autre.
else if ((password = lireFichier(CHEMIN_SECRET_DEFAUT))) {
  origineMotDePasse = 'fichier'
}
// 4. Rien de fourni : on en engendre un et on le DÉPOSE dans le fichier de secret, pour
//    qu'il survive au prochain seed et puisse être recopié ailleurs.
else {
  password = engendrerMotDePasse()
  origineMotDePasse = 'engendré'
  try {
    mkdirSync(dirname(CHEMIN_SECRET_DEFAUT), { recursive: true })
    writeFileSync(CHEMIN_SECRET_DEFAUT, password + '\n', { mode: 0o600 })
  }
  catch {
    console.warn(`⚠️  Impossible d'écrire ${CHEMIN_SECRET_DEFAUT} — notez le mot de passe ci-dessous, il ne sera pas conservé.`)
  }
}

const motDePasseFourni = origineMotDePasse !== 'engendré'

async function promouvoir(id: string) {
  await db.update(authSchema.user).set({ role: 'admin' }).where(eq(authSchema.user.id, id))
}

/** Encadré bien visible : ce mot de passe ne sera plus jamais affiché. */
function afficherIdentifiants() {
  const l = (t: string) => console.log(`   ║ ${t.padEnd(62)} ║`)
  console.log(`   ╔${'═'.repeat(64)}╗`)
  l('')
  l('  COMPTE ADMINISTRATEUR DE SECOURS')
  l('')
  l(`  Adresse       : ${email}`)
  l(`  Mot de passe  : ${password}`)
  l('')
  l('  Connexion par /login-secours si le SSO est indisponible.')
  l('')
  console.log(`   ╚${'═'.repeat(64)}╝`)
  if (motDePasseFourni) {
    console.log(`   (source : ${origineMotDePasse})`)
  }
  else {
    console.log(`   Engendré aléatoirement et déposé dans « ${CHEMIN_SECRET_DEFAUT} » (droits 0600).`)
    console.log('   Rangez le mot de passe dans le coffre de l\'équipe.')
  }
}

try {
  const res = await auth.api.signUpEmail({ body: { email, password, name } })
  await promouvoir(res.user.id)
  console.log('✅ Compte administrateur de secours créé.')
  afficherIdentifiants()
}
catch (erreur) {
  // Déjà existant : on s'assure simplement qu'il est admin.
  const existant = await db.select().from(authSchema.user).where(eq(authSchema.user.email, email)).limit(1)
  if (existant[0]) {
    await promouvoir(existant[0].id)
    // On NE réinitialise PAS le mot de passe d'un compte existant : le seed est rejoué à
    // chaque déploiement, et le remplacer à chaque fois invaliderait celui que la personne
    // a noté — sans compter la fenêtre où il transiterait dans les journaux.
    console.log(`ℹ️  Compte ${email} déjà existant — rôle admin confirmé, mot de passe inchangé.`)
  }
  else {
    // Le compte n'existe pas ET n'a pas pu être créé : sans le motif exact, la personne
    // qui déploie n'a aucune prise sur le problème. On le montre.
    const motif = erreur instanceof Error ? erreur.message : String(erreur)
    console.error('❌ Échec de création du compte administrateur de secours.')
    console.error(`   Adresse visée : ${email}`)
    console.error(`   Motif         : ${motif || '(aucun message)'}`)
    if (erreur && typeof erreur === 'object' && 'body' in erreur) {
      console.error(`   Détail        : ${JSON.stringify((erreur as { body?: unknown }).body)}`)
    }
    if (process.env.AUTH_DOMAIN) {
      console.error(`   ℹ️  AUTH_DOMAIN vaut « ${process.env.AUTH_DOMAIN} » : si l'adresse doit appartenir à ce domaine,`)
      console.error(`      relancez avec SEED_ADMIN_EMAIL=secours@${process.env.AUTH_DOMAIN}`)
    }
    if (!process.env.BETTER_AUTH_SECRET) {
      console.error('   ℹ️  BETTER_AUTH_SECRET n\'est pas défini — Better Auth peut refuser de créer un compte.')
    }
    process.exit(1)
  }
}

process.exit(0)
