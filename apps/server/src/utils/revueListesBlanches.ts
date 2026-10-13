import { db } from '@slowpoke/database'
import { alertesSchema, exclusionsSchema, mainSchema } from '@slowpoke/database/tables'
import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import { sendGlobalNotificationSansIncident } from './notification'
import { dispatchWebhooksSansIncident } from './webhook'

// REVUE DES LISTES BLANCHES — ce qui sonne quand une échéance approche.
//
// La date de revue est obligatoire, mais rien ne la regardait : une exclusion posée « le temps
// de vérifier » restait indéfiniment sans que personne ne soit prévenu.
//
// La tâche couvre les trois objets qui portent une échéance : exclusions nées d'un incident,
// revues de règles posées sans incident, et silences posés sur une série d'alertes.

const VERROU = 4837204
const INTERVALLE_MS = 6 * 60 * 60 * 1000

/** Jours avant l'échéance où part le premier rappel. */
export const JOURS_AVANT = 7
/** Un retard se rappelle, mais pas à chaque passage. */
export const JOURS_ENTRE_RAPPELS = 7

export const EVENEMENT_PROCHE = 'revue_liste_blanche_proche'
export const EVENEMENT_DEPASSEE = 'revue_liste_blanche_depassee'
/** Les deux événements, pour que les réglages des webhooks les proposent sans les recopier. */
export const EVENEMENTS_REVUE = [EVENEMENT_PROCHE, EVENEMENT_DEPASSEE]

const JOUR_MS = 24 * 60 * 60 * 1000

export type Niveau = 'proche' | 'depassee'

export type EcheanceRevue = {
  origine: 'exclusion' | 'regle' | 'silence'
  id: string
  /** Référence de la règle dans l'outil, quand elle est connue. */
  regleRef: string | null
  incidentId: string | null
  /** Portée de l'exclusion, ou libellé de la règle : ce qui est mis en liste blanche. */
  objet: string
  motif: string
  echeance: string
  niveau: Niveau
}

const niveauDe = (echeance: Date, maintenant: Date): Niveau =>
  echeance.getTime() <= maintenant.getTime() ? 'depassee' : 'proche'

/** Un rappel déjà envoyé ne se répète pas, sauf un retard qui dure. */
function aRappeler(
  niveau: Niveau,
  derniereAlerteNiveau: string | null,
  derniereAlerteLe: Date | null,
  maintenant: Date,
): boolean {
  if (derniereAlerteNiveau !== niveau) return true
  if (niveau !== 'depassee') return false
  if (!derniereAlerteLe) return true
  return maintenant.getTime() - derniereAlerteLe.getTime() >= JOURS_ENTRE_RAPPELS * JOUR_MS
}

/** Une revue de règle cède la place à l'exclusion qui la couvre : le jour où la règle en reçoit
 *  une, c'est son échéance qui fait autorité. Sans ce passage, la même règle porterait deux
 *  dates, et l'arbitrage n'appartiendrait à personne. */
export async function remplacerRevuesCouvertes(): Promise<number> {
  const R = exclusionsSchema.revueRegle
  const X = exclusionsSchema.exclusion
  const couvertes = await db.select({ id: R.id, exclusionId: X.id })
    .from(R)
    .innerJoin(X, and(eq(X.outilRef, R.regleRef), eq(X.state, 'active')))
    .where(eq(R.etat, 'active'))

  for (const c of couvertes) {
    await db.update(R)
      .set({ etat: 'remplacee', remplaceeLe: new Date(), remplaceeParExclusion: c.exclusionId })
      .where(eq(R.id, c.id))
  }
  return couvertes.length
}

/** Échéances à rappeler maintenant, les deux origines confondues. */
export async function echeancesARappeler(maintenant = new Date()): Promise<EcheanceRevue[]> {
  const limite = new Date(maintenant.getTime() + JOURS_AVANT * JOUR_MS)
  const X = exclusionsSchema.exclusion
  const R = exclusionsSchema.revueRegle

  const exclusions = await db.select({
    id: X.id, incidentId: X.incidentId, scope: X.scope, reason: X.reason, outilRef: X.outilRef,
    reviewDate: X.reviewDate, derniereAlerteLe: X.derniereAlerteLe, derniereAlerteNiveau: X.derniereAlerteNiveau,
  })
    .from(X)
    .innerJoin(mainSchema.incident, eq(mainSchema.incident.id, X.incidentId))
    .where(and(
      eq(X.state, 'active'),
      lte(X.reviewDate, limite),
      // Un dossier archivé ne réveille personne : il est sorti des listes et des décomptes.
      isNull(mainSchema.incident.archiveLe),
    ))

  const regles = await db.select().from(R)
    .where(and(eq(R.etat, 'active'), lte(R.echeance, limite)))

  const S = alertesSchema.silenceAlerte
  const silences = await db.select().from(S)
    .where(and(eq(S.etat, 'active'), lte(S.echeance, limite)))

  const aEnvoyer: EcheanceRevue[] = []

  for (const e of exclusions) {
    const niveau = niveauDe(e.reviewDate, maintenant)
    if (!aRappeler(niveau, e.derniereAlerteNiveau, e.derniereAlerteLe, maintenant)) continue
    aEnvoyer.push({
      origine: 'exclusion', id: e.id, regleRef: e.outilRef, incidentId: e.incidentId,
      objet: e.scope, motif: e.reason, echeance: e.reviewDate.toISOString(), niveau,
    })
  }
  for (const r of regles) {
    const niveau = niveauDe(r.echeance, maintenant)
    if (!aRappeler(niveau, r.derniereAlerteNiveau, r.derniereAlerteLe, maintenant)) continue
    aEnvoyer.push({
      origine: 'regle', id: r.id, regleRef: r.regleRef, incidentId: null,
      objet: r.libelle || r.regleRef, motif: r.motif, echeance: r.echeance.toISOString(), niveau,
    })
  }
  for (const s of silences) {
    const niveau = niveauDe(s.echeance, maintenant)
    if (!aRappeler(niveau, s.derniereAlerteNiveau, s.derniereAlerteLe, maintenant)) continue
    aEnvoyer.push({
      origine: 'silence', id: s.id, regleRef: s.regleId, incidentId: null,
      objet: `alertes de la règle ${s.regleId}${s.machine ? ` sur ${s.machine}` : ' (toutes machines)'}`,
      motif: s.note ? `${s.motif} — ${s.note}` : s.motif,
      echeance: s.echeance.toISOString(), niveau,
    })
  }
  return aEnvoyer
}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium' }).format(new Date(iso))

/** Rappelle les revues dues : notification GROUPÉE, parce que six notifications d'affilée se
 *  font couper ; webhook DÉTAILLÉ par échéance, parce qu'une automatisation a besoin de la
 *  règle, de l'échéance et de l'incident un par un. */
export async function rappelerRevues(maintenant = new Date()): Promise<{ rappelees: number, proches: number, depassees: number }> {
  const vide = { rappelees: 0, proches: 0, depassees: 0 }
  const [verrou] = (await db.execute(sql`SELECT pg_try_advisory_lock(${VERROU}) AS obtenu`)).rows as { obtenu: boolean }[]
  if (!verrou?.obtenu) return vide

  try {
    await remplacerRevuesCouvertes()
    const dues = await echeancesARappeler(maintenant)
    if (!dues.length) return vide

    const depassees = dues.filter(d => d.niveau === 'depassee')
    const proches = dues.filter(d => d.niveau === 'proche')

    // Un webhook par échéance, avec de quoi agir sans rien aller chercher.
    for (const d of dues) {
      await dispatchWebhooksSansIncident(
        d.niveau === 'depassee' ? EVENEMENT_DEPASSEE : EVENEMENT_PROCHE,
        `Liste blanche à revoir : ${d.objet} (échéance du ${dateFr(d.echeance)})`,
        { listeBlanche: d },
      )
    }

    const morceaux = [
      depassees.length ? `${depassees.length} en retard` : null,
      proches.length ? `${proches.length} dans les ${JOURS_AVANT} jours` : null,
    ].filter(Boolean).join(', ')
    await sendGlobalNotificationSansIncident(
      'revue_listes_blanches',
      'Listes blanches à revoir',
      `${dues.length} liste(s) blanche(s) à revoir — ${morceaux}.`,
      '/listes-blanches',
    )

    // La mémoire du rappel : sans elle, la tâche réveillerait tout le monde toutes les six heures.
    for (const d of dues) {
      const valeurs = { derniereAlerteLe: maintenant, derniereAlerteNiveau: d.niveau }
      if (d.origine === 'exclusion') {
        await db.update(exclusionsSchema.exclusion).set(valeurs)
          .where(eq(exclusionsSchema.exclusion.id, d.id))
      }
      else if (d.origine === 'regle') {
        await db.update(exclusionsSchema.revueRegle).set(valeurs)
          .where(eq(exclusionsSchema.revueRegle.id, d.id))
      }
      else {
        await db.update(alertesSchema.silenceAlerte).set(valeurs)
          .where(eq(alertesSchema.silenceAlerte.id, d.id))
      }
    }

    console.log(`🔔 Listes blanches : ${dues.length} revue(s) rappelée(s) — ${morceaux}.`)
    return { rappelees: dues.length, proches: proches.length, depassees: depassees.length }
  }
  finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${VERROU})`)
  }
}

/** Démarre le rappel périodique. Appelé une fois au démarrage du serveur. */
export function demarrerRevueListesBlanches(): void {
  // Un passage au démarrage : un serveur arrêté une semaine ne doit pas attendre six
  // heures de plus pour signaler ce qui est déjà en retard.
  rappelerRevues().catch(e => console.error('❌ Revue des listes blanches (démarrage) :', e))

  const minuteur = setInterval(() => {
    rappelerRevues().catch(e => console.error('❌ Revue des listes blanches (périodique) :', e))
  }, INTERVALLE_MS)
  minuteur.unref?.()
}
