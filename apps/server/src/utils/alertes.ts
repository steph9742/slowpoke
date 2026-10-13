import { db } from '@slowpoke/database'
import { alertesSchema, authSchema, mainSchema, settingsSchema } from '@slowpoke/database/tables'
import { and, asc, count, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { noterSucces } from '@slowpoke/connecteurs/synchro'
import { lireConfigIA, avisAlerte, poursuivreSurAlerte, VERSION_PROMPT } from './ia'
import { sendGlobalNotificationSansIncident } from './notification'
import { dispatchWebhooksSansIncident } from './webhook'
import { lireConfigWazuh } from '@slowpoke/connecteurs/wazuh'
import { createLog } from './log'

// FILE DE TRIAGE — l'alerte entre, l'incident sort.
//
// Le seuil d'ingestion vit ici et nulle part ailleurs : sous le seuil, une alerte est refusée
// avec son motif plutôt que stockée en silence.
//
// AUCUNE ESCALADE AUTOMATIQUE : un incident porte des compteurs réglementaires qui courent,
// le créer sans humain revient à les armer sur une détection que personne n'a lue.

/** Seuil par défaut. Réglable : toutes les sources ne gradent pas comme Wazuh. */
export const SEUIL_INGESTION_DEFAUT = 10
/** Rétention par défaut des alertes non escaladées, en jours. */
export const RETENTION_DEFAUT = 90

export const CLE_ALERTES_TABLEAU_DE_BORD = 'alertes.tableau_de_bord'
export const CLE_ALERTES_SEUIL = 'alertes.seuil'
export const CLE_ALERTES_RETENTION = 'alertes.retention_jours'
export const CLE_ALERTES_NIVEAU_NOTIFICATION = 'alertes.niveau_notification'
export const CLES_ALERTES = [CLE_ALERTES_TABLEAU_DE_BORD, CLE_ALERTES_SEUIL, CLE_ALERTES_RETENTION, CLE_ALERTES_NIVEAU_NOTIFICATION]

/** Niveau à partir duquel une alerte NEUVE notifie. Notifier chaque alerte fait couper les
 *  notifications au bout d'une journée, et perdre celles qui comptaient. */
export const NIVEAU_NOTIFICATION_DEFAUT = 12

export const EVENEMENT_ALERTE_NOUVELLE = 'alerte_nouvelle'
export const EVENEMENT_ALERTE_ECARTEE = 'alerte_ecartee'
export const EVENEMENT_ALERTE_ESCALADEE = 'alerte_escaladee'

export type ConfigAlertes = {
  /** Adresse publique du tableau de bord de la source, pour les liens de retour. */
  tableauDeBord: string | null
  seuil: number
  retentionJours: number
  niveauNotification: number
}

/** Réglages de la file, lus en base à chaque passage. */
export async function lireConfigAlertes(): Promise<ConfigAlertes> {
  const lignes = await db.select().from(settingsSchema.appSetting)
    .where(inArray(settingsSchema.appSetting.key, CLES_ALERTES))
  const v = Object.fromEntries(lignes.map(l => [l.key, l.value?.trim() ?? '']))
  const entier = (brut: string | undefined, defaut: number, min: number, max: number) => {
    const n = Number.parseInt(brut ?? '', 10)
    return Number.isInteger(n) && n >= min && n <= max ? n : defaut
  }
  return {
    tableauDeBord: v[CLE_ALERTES_TABLEAU_DE_BORD] || null,
    seuil: entier(v[CLE_ALERTES_SEUIL], SEUIL_INGESTION_DEFAUT, 0, 16),
    retentionJours: entier(v[CLE_ALERTES_RETENTION], RETENTION_DEFAUT, 7, 3650),
    niveauNotification: entier(v[CLE_ALERTES_NIVEAU_NOTIFICATION], NIVEAU_NOTIFICATION_DEFAUT, 0, 17),
  }
}
/** Le log brut est une pièce de contexte, pas un stockage de journaux. */
export const PLAFOND_LOG_BRUT = 2048
export const PLAFOND_CONTEXTE_CLES = 20
export const PLAFOND_CONTEXTE_VALEUR = 500
const FUSEAU = 'Europe/Paris'

export type Statut = (typeof alertesSchema.alerteStatut.enumValues)[number]
export type MotifEcart = (typeof alertesSchema.alerteMotifEcart.enumValues)[number]
type Severite = (typeof mainSchema.incidentSeverity.enumValues)[number]
type TypeIncident = (typeof mainSchema.incidentType.enumValues)[number]

type Echec = { erreur: string, code: 403 | 404 | 409 | 422 }
const echec = (code: Echec['code'], erreur: string): Echec => ({ erreur, code })

/** Jour d'`Europe/Paris` pour le panier : une alerte à 00h30 à Paris est la veille en UTC,
 *  et regrouper sur le jour UTC scinderait la série une nuit sur deux. */
export function jourParis(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/**
 * Panier de regroupement : source, règle, machine, jour. Calculé ICI et jamais reçu — un
 * émetteur qui se trompe de format ne doit pas pouvoir couper une série en deux. Une récidive
 * le lendemain est une alerte NEUVE.
 */
export function panierDe(source: string, regleId: string, machine: string, observeLe: Date): string {
  return `${source}:${regleId}:${machine.trim().toLowerCase()}:${jourParis(observeLe)}`
}

/**
 * Niveau de la source → gravité. L'émetteur envoie ce qu'il sait (un niveau), pas une
 * gravité : deux tables de correspondance dans deux dépôts donneraient deux réponses.
 */
/** Le niveau dans le vocabulaire de la cellule : « P1 », pas « critical ». */
export function gravitePourNiveauLibelle(niveau: number): string {
  const n = gravitePourNiveau(niveau)
  return n === 'critical' ? 'P1' : n === 'high' ? 'P2' : n === 'medium' ? 'P3' : 'P4'
}

export function gravitePourNiveau(niveau: number): Severite {
  if (niveau >= 15) return 'critical'
  if (niveau >= 12) return 'high'
  if (niveau >= 10) return 'medium'
  return 'low'
}

/** Transitions admises. `escaladee` est terminal : la suite appartient à l'incident. */
export const TRANSITIONS: Record<Statut, Statut[]> = {
  nouvelle: ['en_cours', 'ecartee', 'escaladee'],
  en_cours: ['nouvelle', 'ecartee', 'escaladee'],
  ecartee: ['nouvelle'],
  escaladee: [],
}

const texte = (v: unknown, max = 500): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

const liste = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(x => texte(x, 200)).filter((x): x is string => Boolean(x)))] : []

/** Contexte plat et borné : il vient d'un émetteur et finit à l'écran. */
function contexteSain(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const propre: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(v as Record<string, unknown>).slice(0, PLAFOND_CONTEXTE_CLES)) {
    const s = texte(typeof valeur === 'number' || typeof valeur === 'boolean' ? String(valeur) : valeur, PLAFOND_CONTEXTE_VALEUR)
    if (s) propre[cle.slice(0, 64)] = s
  }
  return propre
}

/**
 * Adresse de retour vers l'outil, en `https` seulement : une URL arbitraire venue d'un
 * émetteur deviendrait un lien cliquable dans l'interface.
 *
 * Elle est RÉÉCRITE vers l'adresse que la cellule emploie — un émetteur fabrique son lien
 * avec celle qu'il connaît, souvent interne, que personne ne joint depuis un poste. Chemin et
 * fragment conservés, seule l'origine change ; sans adresse configurée, l'URL est gardée.
 */
export function urlTableauDeBordSaine(url: string | null, baseTableauDeBord?: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    if (!baseTableauDeBord) return u.toString()
    const base = new URL(baseTableauDeBord)
    if (base.protocol !== 'https:') return u.toString()
    u.protocol = base.protocol
    u.host = base.host
    return u.toString()
  }
  catch {
    return null
  }
}

/** Adresse par laquelle la cellule joint le tableau de bord de la source, reprise des
 *  réglages de la source quand l'accès passe par lui. */
export async function baseTableauDeBord(): Promise<string | null> {
  const { tableauDeBord } = await lireConfigAlertes()
  if (tableauDeBord) return tableauDeBord.replace(/\/+$/, '')
  // À défaut, l'adresse par laquelle la cellule lit déjà les archives.
  const cfg = await lireConfigWazuh()
  if (!cfg || cfg.acces !== 'tableau_de_bord') return null
  return cfg.url.trim().replace(/\/+$/, '')
}

export type EntreeAlerte = {
  source?: string
  ruleId: string
  ruleDescription: string
  level: number
  machine: string
  sourceIps?: string[]
  username?: string
  mitre?: string[]
  observedAt: string
  dashboardUrl?: string
  rawLog?: string
  context?: Record<string, unknown>
}

type Alerte = typeof alertesSchema.alerte.$inferSelect

/** Forme publiée de l'alerte : les colonnes sont en français, le contrat d'API est celui de
 *  l'émetteur. La traduction se fait ICI, donc renommer une colonne ne casse aucun appelant. */
export function pourApi(a: Alerte) {
  return {
    id: a.id,
    panier: a.panier,
    source: a.source,
    ruleId: a.regleId,
    ruleDescription: a.regleLibelle,
    level: a.niveau,
    severity: gravitePourNiveau(a.niveau),
    machine: a.machine,
    sourceIps: a.ipsSource,
    username: a.compte,
    mitre: a.mitre,
    firstSeen: a.premiereVue.toISOString(),
    lastSeen: a.derniereVue.toISOString(),
    occurrences: a.occurrences,
    status: a.statut,
    dismissReason: a.motifEcart,
    dismissNote: a.noteEcart,
    incidentId: a.incidentId,
    assignee: a.assigneA,
    dashboardUrl: a.urlTableauDeBord,
    rawLog: a.logBrut,
    context: a.contexte,
  }
}

/** Noms des personnes citées, en une requête : « prise en charge » sans dire par qui ne sert
 *  à rien quand deux analystes trient la même file. */
async function nomsDe(ids: (string | null)[]): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter((i): i is string => Boolean(i)))]
  if (!uniques.length) return new Map()
  const lignes = await db.select({ id: authSchema.user.id, name: authSchema.user.name, email: authSchema.user.email })
    .from(authSchema.user).where(inArray(authSchema.user.id, uniques))
  return new Map(lignes.map(l => [l.id, l.name || l.email || 'un utilisateur']))
}

async function nomDe(id: string | null | undefined): Promise<string> {
  if (!id) return 'personne'
  return (await nomsDe([id])).get(id) ?? 'un utilisateur'
}

async function journaliser(alerteId: string, genre: string, message: string, userId?: string, svcId?: string) {
  await db.insert(alertesSchema.alerteJournal).values({ alerteId, genre, message, parUtilisateur: userId ?? null, parService: svcId ?? null })
}

/**
 * Ingestion idempotente. Les occurrences ne sont PAS journalisées une par une — une règle en
 * vrille en produit des centaines : elles sont comptées dans la ligne, le journal ne porte
 * que les décisions.
 */
export async function ingererAlerte(e: EntreeAlerte, auteur?: { userId?: string, svcId?: string }, base?: string | null) {
  const regleId = texte(e.ruleId, 100)
  const regleLibelle = texte(e.ruleDescription, 300)
  const machine = texte(e.machine, 200)
  if (!regleId || !regleLibelle || !machine) return echec(422, 'Règle, libellé de règle et machine sont obligatoires.')

  if (!Number.isInteger(e.level) || e.level < 0 || e.level > 16) return echec(422, 'Le niveau doit être un entier de 0 à 16.')
  const reglages = await lireConfigAlertes()
  if (e.level < reglages.seuil) {
    return echec(422, `Niveau ${e.level} sous le seuil d'ingestion (${reglages.seuil}) : l'alerte n'est pas enregistrée.`)
  }

  // L'horodatage de l'ALERTE, jamais l'heure de l'appel : c'est lui qui datera la
  // connaissance de l'incident en cas d'escalade.
  const observeLe = e.observedAt ? new Date(e.observedAt) : null
  if (!observeLe || Number.isNaN(observeLe.getTime())) {
    return echec(422, "`observedAt` est obligatoire et doit être l'horodatage de l'alerte, pas l'heure de l'envoi.")
  }

  const source = (['wazuh', 'n8n', 'manuel'] as const).find(s => s === e.source) ?? 'wazuh'
  const panier = panierDe(source, regleId, machine, observeLe)
  const A = alertesSchema.alerte

  const [existante] = await db.select().from(A).where(eq(A.panier, panier)).limit(1)

  if (!existante) {
    // Une série qu'on a décidé de ne plus voir naît écartée, en citant la décision : sans
    // cela, le panier étant journalier, le même bruit reviendrait chaque matin en « nouvelle ».
    const silence = await silenceApplicable(source, regleId, machine, observeLe)

    const [creee] = await db.insert(A).values({
      panier, source, regleId, regleLibelle, niveau: e.level, machine,
      ...(silence
        ? {
            statut: 'ecartee' as const,
            motifEcart: silence.motif,
            noteEcart: `Série faite taire jusqu'au ${silence.echeance.toLocaleDateString('fr-FR', { timeZone: FUSEAU })}${silence.note ? ` — ${silence.note}` : ''}`,
            silenceId: silence.id,
          }
        : {}),
      ipsSource: liste(e.sourceIps),
      compte: texte(e.username, 200),
      mitre: liste(e.mitre),
      premiereVue: observeLe,
      derniereVue: observeLe,
      urlTableauDeBord: urlTableauDeBordSaine(texte(e.dashboardUrl, 2000), base ?? await baseTableauDeBord()),
      logBrut: texte(e.rawLog, PLAFOND_LOG_BRUT),
      contexte: contexteSain(e.context),
    }).returning()
    await journaliser(creee!.id, 'creation', `Alerte reçue — ${regleLibelle} (niveau ${e.level}) sur ${machine}.`, auteur?.userId, auteur?.svcId)
    if (silence) {
      await journaliser(creee!.id, 'silence', `Écartée d'office — silence ${silence.id} posé sur la série (${silence.motif}).`, auteur?.userId, auteur?.svcId)
    }

    // Prévenir, mais seulement pour ce qui mérite d'interrompre : une alerte neuve, jamais
    // une occurrence, et jamais une série qu'on a déjà décidé de ne plus voir.
    if (!silence) {
      await dispatchWebhooksSansIncident(EVENEMENT_ALERTE_NOUVELLE,
        `Alerte ${creee!.id} — ${regleLibelle} (niveau ${e.level}) sur ${machine}`,
        { alerte: pourApi(creee!) })
      if (e.level >= reglages.niveauNotification) {
        await sendGlobalNotificationSansIncident('alertes_graves',
          `${gravitePourNiveauLibelle(e.level)} — ${machine}`,
          `${regleLibelle} (niveau ${e.level}). À trier.`,
          `/alertes/${creee!.id}`)
      }
    }
    await noterSucces('alertes', `alerte ${creee!.id} reçue`)
    return { etat: 'creee' as const, alerte: creee! }
  }

  // Les adresses et les techniques s'ACCUMULENT : une campagne vue depuis cinquante IP est
  // une seule série, et perdre les quarante-neuf premières serait perdre l'essentiel.
  const ips = [...new Set([...existante.ipsSource, ...liste(e.sourceIps)])]
  const mitre = [...new Set([...existante.mitre, ...liste(e.mitre)])]
  const derniereVue = observeLe > existante.derniereVue ? observeLe : existante.derniereVue

  const [maj] = await db.update(A).set({
    occurrences: existante.occurrences + 1,
    derniereVue,
    ipsSource: ips,
    mitre,
    // `premiereVue` ne bouge jamais, et un écartement n'est PAS rouvert par une occurrence :
    // c'est ce qui rend l'écartement utile.
    compte: existante.compte ?? texte(e.username, 200),
    logBrut: existante.logBrut ?? texte(e.rawLog, PLAFOND_LOG_BRUT),
  }).where(eq(A.id, existante.id)).returning()

  // Une occurrence de plus sur une alerte déjà escaladée intéresse le dossier, lui.
  if (existante.statut === 'escaladee' && existante.incidentId) {
    await createLog(existante.incidentId, 'update', auteur?.userId, auteur?.svcId,
      `Nouvelle occurrence de l'alerte ${existante.id} — ${existante.occurrences + 1} au total depuis le ${existante.premiereVue.toLocaleString('fr-FR', { timeZone: FUSEAU })}.`,
      undefined, { silent: true })
  }

  await noterSucces('alertes', `alerte ${existante.id} incrémentée`)
  return { etat: 'incrementee' as const, alerte: maj! }
}

export type Triage = { status?: Statut, dismissReason?: MotifEcart, dismissNote?: string, assignee?: string | null }

/** Triage d'une alerte : changement de statut, motif d'écartement, prise en charge. */
export async function trierAlerte(id: string, t: Triage, userId?: string, estAdmin = false) {
  const A = alertesSchema.alerte
  const [a] = await db.select().from(A).where(eq(A.id, id)).limit(1)
  if (!a) return echec(404, 'Alerte introuvable.')

  const valeurs: Partial<typeof A.$inferInsert> = {}
  const lignes: string[] = []

  if (t.status && t.status !== a.statut) {
    if (!TRANSITIONS[a.statut].includes(t.status)) {
      return echec(409, `Transition « ${a.statut} → ${t.status} » interdite.${a.statut === 'escaladee' ? " L'incident porte la suite." : ''}`)
    }
    if (t.status === 'ecartee' && !t.dismissReason) {
      return echec(422, "Un écartement sans motif ne se défend pas six mois plus tard : `dismissReason` est obligatoire.")
    }
    valeurs.statut = t.status
    if (t.status === 'ecartee') {
      valeurs.motifEcart = t.dismissReason
      valeurs.noteEcart = texte(t.dismissNote, 1000)
      lignes.push(`Écartée — ${t.dismissReason}${valeurs.noteEcart ? ` : ${valeurs.noteEcart}` : ''}.`)
    }
    else {
      // Rouvrir efface le motif : le garder laisserait croire que la décision tient encore.
      if (a.statut === 'ecartee') { valeurs.motifEcart = null; valeurs.noteEcart = null }
      lignes.push(`Statut : ${a.statut} → ${t.status}.`)
    }
  }

  if (t.assignee !== undefined && t.assignee !== a.assigneA) {
    // Désigner QUELQU'UN D'AUTRE est réservé aux admins : sans cette limite, n'importe qui
    // pourrait se décharger d'une alerte sur un collègue absent.
    if (t.assignee && t.assignee !== userId && !estAdmin) {
      return echec(403, "Seul un administrateur peut attribuer une alerte à quelqu'un d'autre.")
    }
    // Et reprendre une alerte déjà prise par un autre est le même acte : un gestionnaire ne
    // prend la main que sur ce qui est libre.
    if (a.assigneA && a.assigneA !== userId && !estAdmin) {
      const porteur = await nomDe(a.assigneA)
      return echec(409, `Cette alerte est déjà prise en charge par ${porteur}. Un administrateur peut la réattribuer.`)
    }
    valeurs.assigneA = t.assignee
    if (!t.assignee) lignes.push(`Prise en charge retirée (${await nomDe(a.assigneA)}).`)
    else if (t.assignee === userId) lignes.push(`Prise en charge par ${await nomDe(userId)}.`)
    else lignes.push(`Attribuée à ${await nomDe(t.assignee)} par ${await nomDe(userId)}.`)
  }

  if (!Object.keys(valeurs).length) return { alerte: a, inchangee: true as const }

  const [maj] = await db.update(A).set(valeurs).where(eq(A.id, id)).returning()
  for (const ligne of lignes) await journaliser(id, 'statut', ligne, userId)
  if (valeurs.statut === 'ecartee') {
    await dispatchWebhooksSansIncident(EVENEMENT_ALERTE_ECARTEE,
      `Alerte ${id} écartée — ${t.dismissReason}`, { alerte: pourApi(maj!) })
  }
  return { alerte: maj!, inchangee: false as const }
}

export type Escalade = {
  type: TypeIncident
  severity?: Severite
  perimeter?: (typeof mainSchema.incidentPerimeter.enumValues)[number]
  attachToIncidentId?: string | null
}

/**
 * Escalade — manuelle, toujours.
 *
 * `knowledgeAt` vaut la PREMIÈRE vue, jamais l'heure de l'escalade : les délais réglementaires
 * courent depuis la détection. Sur un rattachement, la date de connaissance de l'incident
 * RECULE si l'alerte est antérieure.
 */
export async function escaladerAlerte(id: string, e: Escalade, userId?: string) {
  const A = alertesSchema.alerte
  const [a] = await db.select().from(A).where(eq(A.id, id)).limit(1)
  if (!a) return echec(404, 'Alerte introuvable.')
  if (a.statut === 'escaladee') return echec(409, `Alerte déjà escaladée vers l'incident ${a.incidentId}.`)

  const gravite = e.severity ?? gravitePourNiveau(a.niveau)
  let incidentId = e.attachToIncidentId ?? null

  if (incidentId) {
    const [inc] = await db.select().from(mainSchema.incident).where(eq(mainSchema.incident.id, incidentId)).limit(1)
    if (!inc) return echec(404, `Incident ${incidentId} introuvable.`)
    if (!inc.knowledgeAt || a.premiereVue < inc.knowledgeAt) {
      await db.update(mainSchema.incident)
        .set({ knowledgeAt: a.premiereVue, knowledgeEstimated: false })
        .where(eq(mainSchema.incident.id, incidentId))
    }
    await createLog(incidentId, 'update', userId, undefined,
      `Alerte ${a.id} rattachée — ${a.regleLibelle} sur ${a.machine}, ${a.occurrences} occurrence(s).`)
  }
  else {
    const [cree] = await db.insert(mainSchema.incident).values({
      type: e.type,
      severity: gravite,
      status: 'open',
      description: `${a.regleLibelle} — ${a.machine}`,
      source: `Alerte ${a.source} — règle ${a.regleId}`,
      perimeter: e.perimeter ?? 'inconnu',
      knowledgeAt: a.premiereVue,
      knowledgeEstimated: false,
    } as typeof mainSchema.incident.$inferInsert).returning()
    incidentId = cree!.id

    // Les champs techniques suivent l'alerte : sans eux, l'incident perdrait ce qui permet
    // de retrouver la détection d'origine.
    await db.insert(mainSchema.incidentExtension).values({
      incidentId,
      customType: 'alerte',
      tags: a.mitre,
      customFields: {
        alerte: a.id,
        regle_source: `${a.regleId} — ${a.regleLibelle}`,
        niveau_source: String(a.niveau),
        machine_alerte: a.machine,
        ...(a.ipsSource.length ? { ips_source: a.ipsSource.join(', ') } : {}),
        ...(a.compte ? { compte_alerte: a.compte } : {}),
        ...(a.urlTableauDeBord ? { url_tableau_de_bord: a.urlTableauDeBord } : {}),
        occurrences: String(a.occurrences),
      },
    } as typeof mainSchema.incidentExtension.$inferInsert)

    await createLog(incidentId, 'created', userId, undefined,
      `Incident ouvert depuis l'alerte ${a.id} — ${a.regleLibelle} sur ${a.machine}. Date de connaissance : première détection.`)
  }

  const [maj] = await db.update(A)
    .set({ statut: 'escaladee', incidentId })
    .where(eq(A.id, id)).returning()
  await journaliser(id, 'escalade', `Escaladée vers l'incident ${incidentId}.`, userId)
  await dispatchWebhooksSansIncident(EVENEMENT_ALERTE_ESCALADEE,
    `Alerte ${id} escaladée vers l'incident ${incidentId}`, { alerte: pourApi(maj!), incidentId })
  return { alerte: maj!, incidentId }
}

export type FiltresAlertes = {
  status?: Statut[]
  level_min?: number
  machine?: string
  ruleId?: string
  assignee?: string
  since?: string
  limit?: number
  offset?: number
}

/** La file, filtrée. Tri : gravité décroissante — donc niveau —, puis dernière vue. */
export async function listerAlertes(f: FiltresAlertes) {
  const A = alertesSchema.alerte
  const depuis = f.since ? new Date(f.since) : null
  const conditions = [
    f.status?.length ? inArray(A.statut, f.status) : undefined,
    f.level_min !== undefined ? gte(A.niveau, f.level_min) : undefined,
    f.machine ? eq(A.machine, f.machine) : undefined,
    f.ruleId ? eq(A.regleId, f.ruleId) : undefined,
    f.assignee ? eq(A.assigneA, f.assignee) : undefined,
    depuis && !Number.isNaN(depuis.getTime()) ? gte(A.derniereVue, depuis) : undefined,
  ].filter(Boolean)
  const filtre = conditions.length ? and(...conditions) : undefined

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(A).where(filtre)
  const resultats = await db.select().from(A).where(filtre)
    .orderBy(desc(A.niveau), desc(A.derniereVue))
    .limit(Math.min(f.limit ?? 50, 200))
    .offset(f.offset ?? 0)

  // Réécriture à la lecture : les alertes reçues avant qu'une adresse soit configurée
  // portent celle de l'émetteur, que personne ne joint. Pas de migration pour autant.
  const base = await baseTableauDeBord()
  const noms = await nomsDe(resultats.map(a => a.assigneA))
  return {
    total,
    resultats: resultats.map(a => ({
      ...pourApi(a),
      dashboardUrl: urlTableauDeBordSaine(a.urlTableauDeBord, base),
      assigneeNom: a.assigneA ? noms.get(a.assigneA) ?? null : null,
    })),
  }
}

/** Ce qui a déjà été décidé pour cette règle — « qu'avons-nous fait la dernière fois ? ».
 *  Les alertes purgées comptent, leur agrégat gardant le décompte. */
export async function precedentsDe(regleId: string, machine: string) {
  const A = alertesSchema.alerte
  const G = alertesSchema.alerteAgregat

  const recents = await db.select({ statut: A.statut, motif: A.motifEcart, n: count() })
    .from(A).where(eq(A.regleId, regleId)).groupBy(A.statut, A.motifEcart)
  const anciens = await db.select({ statut: G.statut, motif: G.motifEcart, n: sql<number>`sum(${G.alertes})::int` })
    .from(G).where(eq(G.regleId, regleId)).groupBy(G.statut, G.motifEcart)

  const parDecision = new Map<string, number>()
  for (const l of [...recents, ...anciens]) {
    const cle = l.statut === 'ecartee' ? `ecartee:${l.motif ?? 'sans motif'}` : l.statut
    parDecision.set(cle, (parDecision.get(cle) ?? 0) + Number(l.n))
  }

  const [surCetteMachine] = await db.select({ n: count() }).from(A)
    .where(and(eq(A.regleId, regleId), eq(A.machine, machine)))

  const total = [...parDecision.values()].reduce((a, b) => a + b, 0)
  return {
    total,
    surCetteMachine: Number(surCetteMachine?.n ?? 0),
    decisions: [...parDecision.entries()]
      .map(([decision, n]) => ({ decision, n }))
      .sort((a, b) => b.n - a.n),
  }
}

type Precedents = Awaited<ReturnType<typeof precedentsDe>>

/** Ce que la cellule sait de cette machine et de cette règle. Attaché à la machine ou à la
 *  règle, jamais à l'alerte : sinon ce qu'on apprend au modèle est reperdu le lendemain. */
export async function connaissancesDe(machine: string, regleId: string) {
  const K = alertesSchema.connaissanceLocale
  return await db.select().from(K).where(or(
    and(eq(K.portee, 'machine'), eq(K.valeur, machine)),
    and(eq(K.portee, 'regle'), eq(K.valeur, regleId)),
  ))
}

export async function poserConnaissance(portee: 'machine' | 'regle', valeur: string, note: string, userId?: string) {
  const propre = texte(note, 1000)
  const cible = texte(valeur, 200)
  if (!propre || !cible) return echec(422, 'La note et sa cible sont obligatoires.')
  const K = alertesSchema.connaissanceLocale
  const [pose] = await db.insert(K)
    .values({ portee, valeur: cible, note: propre, creePar: userId ?? null })
    .onConflictDoUpdate({ target: [K.portee, K.valeur], set: { note: propre, creePar: userId ?? null } })
    .returning()
  return { connaissance: pose! }
}

export async function retirerConnaissance(id: string) {
  const K = alertesSchema.connaissanceLocale
  const [retire] = await db.delete(K).where(eq(K.id, id)).returning()
  if (!retire) return echec(404, 'Note introuvable.')
  return { retire: retire.id }
}

/** Ce qu'on donne à lire au modèle. Les faits de l'alerte, et rien d'inventé autour. */
function blocAlerte(a: Alerte, precedents: Precedents, connaissances: { portee: string, valeur: string, note: string }[] = []): string {
  return [
    `Règle ${a.regleId} — ${a.regleLibelle}`,
    `Niveau de la source : ${a.niveau} (gravité ${gravitePourNiveauLibelle(a.niveau)})`,
    `Machine : ${a.machine}`,
    a.ipsSource.length ? `Adresses à l'origine : ${a.ipsSource.join(', ')}` : null,
    a.compte ? `Compte : ${a.compte}` : null,
    a.mitre.length ? `ATT&CK : ${a.mitre.join(', ')}` : null,
    `Occurrences : ${a.occurrences}, du ${a.premiereVue.toISOString()} au ${a.derniereVue.toISOString()}`,
    Object.keys(a.contexte).length ? `Contexte : ${Object.entries(a.contexte).map(([c, v]) => `${c}=${v}`).join(' · ')}` : null,
    a.logBrut ? `Log brut :\n${a.logBrut}` : null,
    precedents.total > 1
      ? `Précédents sur cette règle : ${precedents.decisions.map(d => `${d.decision} ×${d.n}`).join(', ')}`
      : 'Aucun précédent sur cette règle.',
    // Donné comme un fait établi, et dit comme tel : c'est la cellule qui connaît son
    // infrastructure, et le modèle n'a aucun moyen de la deviner.
    connaissances.length
      ? `Ce que la cellule sait (faits établis, à ne pas contredire) :\n${connaissances.map(k => `- ${k.portee === 'machine' ? `machine ${k.valeur}` : `règle ${k.valeur}`} : ${k.note}`).join('\n')}`
      : null,
  ].filter(Boolean).join('\n')
}

/**
 * Avis du modèle local sur une alerte — une aide à la décision, jamais la décision.
 *
 * À la demande : un avis par alerte sur une file de centaines de lignes coûte du calcul pour
 * une valeur qui décroît. Le log brut est transmis comme pièce, pas comme consigne — il peut
 * contenir ce qu'un attaquant y a écrit, et le cadre système du modèle le dit.
 */
export async function demanderAvis(id: string, userId?: string) {
  const A = alertesSchema.alerte
  const [a] = await db.select().from(A).where(eq(A.id, id)).limit(1)
  if (!a) return echec(404, 'Alerte introuvable.')

  const cfg = await lireConfigIA()
  if (!cfg) return echec(409, "L'assistance n'est pas configurée : réglages → Assistance.")

  const precedents = await precedentsDe(a.regleId, a.machine)
  const texte = blocAlerte(a, precedents, await connaissancesDe(a.machine, a.regleId))

  try {
    const avis = await avisAlerte(cfg, texte)
    const [enregistre] = await db.insert(alertesSchema.alerteAvis).values({
      alerteId: id, contenu: avis, modele: cfg.modele, versionPrompt: VERSION_PROMPT, creePar: userId ?? null,
    }).returning()
    // Journalisé : on doit pouvoir montrer qu'un avis existait au moment de la décision,
    // sans jamais le confondre avec elle.
    await journaliser(id, 'avis', 'Avis du modèle demandé.', userId)
    return { avis: enregistre! }
  }
  catch (e) {
    return echec(409, `Le modèle n'a pas répondu : ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Poursuivre avec le modèle en lui apportant ce que l'alerte ne dit pas. Le fil est PARTAGÉ :
 * ce qu'on apprend au modèle vaut pour toute la cellule. Aucune réponse n'écrit dans l'alerte.
 */
export async function converserSurAlerte(id: string, question: string, userId?: string) {
  const propre = question.trim()
  if (!propre) return echec(422, 'Question vide.')

  const A = alertesSchema.alerte
  const [a] = await db.select().from(A).where(eq(A.id, id)).limit(1)
  if (!a) return echec(404, 'Alerte introuvable.')

  const cfg = await lireConfigIA()
  if (!cfg) return echec(409, "L'assistance n'est pas configurée : réglages → Assistance.")

  const C = alertesSchema.alerteChat
  const historique = await db.select().from(C).where(eq(C.alerteId, id)).orderBy(asc(C.creeLe))
  const precedents = await precedentsDe(a.regleId, a.machine)

  // Son avis précédent lui est rendu : sans lui, « ce que ça change » n'a rien à changer.
  const [dernierAvis] = await db.select().from(alertesSchema.alerteAvis)
    .where(eq(alertesSchema.alerteAvis.alerteId, id))
    .orderBy(desc(alertesSchema.alerteAvis.creeLe)).limit(1)
  const avisTexte = dernierAvis
    ? (() => {
        const c = dernierAvis.contenu as { lecture?: string, pourEcarter?: string[], pourApprofondir?: string[] }
        return [
          c.lecture,
          c.pourEcarter?.length ? `Plaidait pour écarter : ${c.pourEcarter.join(' ; ')}` : null,
          c.pourApprofondir?.length ? `Plaidait pour approfondir : ${c.pourApprofondir.join(' ; ')}` : null,
        ].filter(Boolean).join('\n')
      })()
    : null

  try {
    const reponse = await poursuivreSurAlerte(
      cfg, blocAlerte(a, precedents, await connaissancesDe(a.machine, a.regleId)), avisTexte,
      historique.map(m => ({ role: m.role as 'user' | 'assistant', contenu: m.contenu })),
      propre.slice(0, 2000),
    )
    await db.insert(C).values([
      { alerteId: id, role: 'user', contenu: propre.slice(0, 2000), auteur: userId ?? null },
      { alerteId: id, role: 'assistant', contenu: reponse, modele: cfg.modele },
    ])
    return { reponse, modele: cfg.modele }
  }
  catch (e) {
    return echec(409, `Le modèle n'a pas répondu : ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Une alerte, son journal de triage, ses précédents, l'avis du modèle et le fil. */
export async function lireAlerte(id: string) {
  const [a] = await db.select().from(alertesSchema.alerte).where(eq(alertesSchema.alerte.id, id)).limit(1)
  if (!a) return null
  const journal = await db.select().from(alertesSchema.alerteJournal)
    .where(eq(alertesSchema.alerteJournal.alerteId, id))
    .orderBy(asc(alertesSchema.alerteJournal.creeLe))
  const base = await baseTableauDeBord()
  const precedents = await precedentsDe(a.regleId, a.machine)
  const [avis] = await db.select().from(alertesSchema.alerteAvis)
    .where(eq(alertesSchema.alerteAvis.alerteId, id))
    .orderBy(desc(alertesSchema.alerteAvis.creeLe)).limit(1)
  const connaissances = await connaissancesDe(a.machine, a.regleId)
  const noms = await nomsDe([a.assigneA, ...journal.map(j => j.parUtilisateur), ...connaissances.map(k => k.creePar)])
  const conversation = await db.select().from(alertesSchema.alerteChat)
    .where(eq(alertesSchema.alerteChat.alerteId, id))
    .orderBy(asc(alertesSchema.alerteChat.creeLe))
  return {
    ...pourApi(a),
    dashboardUrl: urlTableauDeBordSaine(a.urlTableauDeBord, base),
    assigneeNom: a.assigneA ? noms.get(a.assigneA) ?? null : null,
    journal: journal.map(j => ({ ...j, parNom: j.parUtilisateur ? noms.get(j.parUtilisateur) ?? null : null })),
    precedents,
    connaissances: connaissances.map(k => ({ ...k, parNom: k.creePar ? noms.get(k.creePar) ?? null : null })),
    avis: avis ?? null,
    conversation: conversation.map(m => ({ ...m, auteurNom: m.auteur ? noms.get(m.auteur) ?? null : null })),
  }
}

/** De quoi dire si le dispositif VIT : l'ingestion étant poussée, « aucune alerte » et « plus
 *  personne n'envoie » doivent se distinguer. */
export async function etatFile() {
  const A = alertesSchema.alerte
  const parStatut = await db.select({ statut: A.statut, n: count() }).from(A).groupBy(A.statut)
  const [plusAncienne] = await db.select({ le: A.premiereVue }).from(A)
    .where(eq(A.statut, 'nouvelle')).orderBy(asc(A.premiereVue)).limit(1)
  const [derniere] = await db.select({ le: A.derniereVue }).from(A).orderBy(desc(A.derniereVue)).limit(1)

  const compte = (s: Statut) => parStatut.find(p => p.statut === s)?.n ?? 0
  const reglages = await lireConfigAlertes()
  return {
    tableauDeBord: await baseTableauDeBord(),
    nouvelles: compte('nouvelle'),
    enCours: compte('en_cours'),
    ecartees: compte('ecartee'),
    escaladees: compte('escaladee'),
    plusAncienneNonTriee: plusAncienne?.le?.toISOString() ?? null,
    derniereRecue: derniere?.le?.toISOString() ?? null,
    seuilIngestion: reglages.seuil,
    retentionJours: reglages.retentionJours,
    niveauNotification: reglages.niveauNotification,
  }
}

/** Décompte pour la pastille de l'onglet : ce qui attend un regard. */
export async function compterATrier(): Promise<number> {
  const A = alertesSchema.alerte
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(A)
    .where(inArray(A.statut, ['nouvelle', 'en_cours'] as Statut[]))
  return Number(n)
}

/** Garde-fou de débit, en mémoire : une source qui s'emballe ne doit pas noyer la base. */
const compteurs = new Map<string, { debut: number, n: number }>()
const FENETRE_DEBIT_MS = 60_000
export const DEBIT_MAX_PAR_MINUTE = 300

export function debitDepasse(cle: string, maintenant = Date.now()): boolean {
  const c = compteurs.get(cle)
  if (!c || maintenant - c.debut > FENETRE_DEBIT_MS) {
    compteurs.set(cle, { debut: maintenant, n: 1 })
    return false
  }
  c.n++
  return c.n > DEBIT_MAX_PAR_MINUTE
}

// --- Silences : faire taire une série, jusqu'à une échéance. ---

/** Le silence qui couvre cette série, s'il y en a un. Posé sur la règle seule, il couvre
 *  toutes les machines ; posé avec une machine, il ne couvre qu'elle. */
export async function silenceApplicable(source: string, regleId: string, machine: string, le: Date) {
  const S = alertesSchema.silenceAlerte
  const candidats = await db.select().from(S).where(and(
    eq(S.etat, 'active'),
    eq(S.source, source as never),
    eq(S.regleId, regleId),
    gte(S.echeance, le),
  ))
  const m = machine.trim().toLowerCase()
  // Le plus précis d'abord : un silence sur la machine prime sur un silence global.
  return candidats.find(s => s.machine?.trim().toLowerCase() === m) ?? candidats.find(s => !s.machine) ?? null
}

export type NouveauSilence = {
  ruleId: string
  machine?: string | null
  dismissReason: MotifEcart
  note?: string
  echeance: string
  source?: string
  /** Écarter du même coup ce qui attend déjà dans la file pour cette série. */
  ecarterLaFile?: boolean
}

export async function poserSilence(n: NouveauSilence, userId?: string) {
  const S = alertesSchema.silenceAlerte
  const regleId = texte(n.ruleId, 100)
  if (!regleId) return echec(422, 'La règle est obligatoire.')
  const echeance = new Date(n.echeance)
  if (Number.isNaN(echeance.getTime())) return echec(422, 'Échéance invalide.')
  if (echeance.getTime() <= Date.now()) {
    return echec(422, "L'échéance doit être dans le futur : un silence déjà échu ne fait rien taire.")
  }

  const source = (['wazuh', 'n8n', 'manuel'] as const).find(x => x === n.source) ?? 'wazuh'
  const machine = texte(n.machine, 200)

  const [deja] = await db.select({ id: S.id }).from(S).where(and(
    eq(S.etat, 'active'), eq(S.source, source), eq(S.regleId, regleId),
    machine ? eq(S.machine, machine) : sql`${S.machine} IS NULL`,
  )).limit(1)
  if (deja) return echec(409, `Cette série porte déjà un silence actif (${deja.id}).`)

  const [cree] = await db.insert(S).values({
    source, regleId, machine, motif: n.dismissReason, note: texte(n.note, 1000), echeance, creePar: userId ?? null,
  }).returning()

  // Ce qui attend déjà dans la file pour cette série : on l'écarte avec le même motif,
  // sinon le silence ne vaudrait que pour demain.
  let ecartees = 0
  if (n.ecarterLaFile) {
    const A = alertesSchema.alerte
    const enFile = await db.select().from(A).where(and(
      eq(A.source, source), eq(A.regleId, regleId),
      inArray(A.statut, ['nouvelle', 'en_cours'] as Statut[]),
      ...(machine ? [eq(A.machine, machine)] : []),
    ))
    for (const a of enFile) {
      await db.update(A).set({
        statut: 'ecartee', motifEcart: n.dismissReason, silenceId: cree!.id,
        noteEcart: `Série faite taire jusqu'au ${echeance.toLocaleDateString('fr-FR', { timeZone: FUSEAU })}`,
      }).where(eq(A.id, a.id))
      await journaliser(a.id, 'silence', `Écartée par le silence ${cree!.id} posé sur la série.`, userId)
      ecartees++
    }
  }
  return { silence: cree!, ecartees }
}

export async function leverSilence(id: string, motif: string | undefined, userId?: string) {
  const S = alertesSchema.silenceAlerte
  const [s] = await db.select().from(S).where(eq(S.id, id)).limit(1)
  if (!s) return echec(404, 'Silence introuvable.')
  if (s.etat === 'levee') return echec(409, 'Ce silence est déjà levé.')
  const propre = texte(motif, 500)
  if (!propre) return echec(422, 'Dites pourquoi le silence est levé : la série reviendra dans la file.')

  const [maj] = await db.update(S)
    .set({ etat: 'levee', leveeLe: new Date(), leveePar: userId ?? null, motifLevee: propre })
    .where(eq(S.id, id)).returning()
  return { silence: maj! }
}

export async function listerSilences(etat?: 'active' | 'levee') {
  const S = alertesSchema.silenceAlerte
  return await db.select().from(S)
    .where(etat ? eq(S.etat, etat) : undefined)
    .orderBy(asc(S.echeance))
}

// --- Écartement en masse, et son annulation. ---

/** Écarter d'un coup ce qu'une règle en vrille a déversé. Réversible dix secondes depuis
 *  l'interface : sans retour en arrière, personne ne lance l'action. */
export async function ecarterEnMasse(ids: string[], motif: MotifEcart, note: string | undefined, userId?: string) {
  if (!ids.length) return echec(422, 'Aucune alerte désignée.')
  const A = alertesSchema.alerte
  const concernees = await db.select().from(A).where(and(
    inArray(A.id, ids), inArray(A.statut, ['nouvelle', 'en_cours'] as Statut[]),
  ))
  for (const a of concernees) {
    await db.update(A).set({ statut: 'ecartee', motifEcart: motif, noteEcart: texte(note, 1000) }).where(eq(A.id, a.id))
    await journaliser(a.id, 'statut', `Écartée en masse — ${motif}.`, userId)
  }
  return { ecartees: concernees.map(a => a.id) }
}

/** Annulation d'un écartement en masse : les alertes retournent dans la file. */
export async function rouvrirEnMasse(ids: string[], userId?: string) {
  if (!ids.length) return echec(422, 'Aucune alerte désignée.')
  const A = alertesSchema.alerte
  const concernees = await db.select().from(A).where(and(inArray(A.id, ids), eq(A.statut, 'ecartee')))
  for (const a of concernees) {
    await db.update(A).set({ statut: 'nouvelle', motifEcart: null, noteEcart: null, silenceId: null }).where(eq(A.id, a.id))
    await journaliser(a.id, 'statut', 'Écartement annulé : retour dans la file.', userId)
  }
  return { rouvertes: concernees.map(a => a.id) }
}

// --- Ce que la file apprend : statistiques, rétention, agrégat. ---

/** Ce qui sert au réglage des règles. Le délai de triage se mesure de la PREMIÈRE vue à la
 *  première décision : une alerte reçue trois jours après sa détection a déjà trois jours de retard. */
export async function statistiquesAlertes(jours = 30) {
  const depuis = new Date(Date.now() - jours * 86_400_000)
  const A = alertesSchema.alerte

  const parStatut = await db.select({ statut: A.statut, n: count() }).from(A)
    .where(gte(A.premiereVue, depuis)).groupBy(A.statut)

  const ecarteesParRegle = (await db.execute(sql`
    SELECT a.regle_id AS regle, a.regle_libelle AS libelle, a.motif_ecart AS motif,
           count(*)::int AS alertes, sum(a.occurrences)::int AS occurrences
    FROM alerte a
    WHERE a.statut = 'ecartee' AND a.premiere_vue >= ${depuis.toISOString()}
    GROUP BY a.regle_id, a.regle_libelle, a.motif_ecart
    ORDER BY occurrences DESC
    LIMIT 10
  `)).rows as { regle: string, libelle: string, motif: string, alertes: number, occurrences: number }[]

  const parMachine = (await db.execute(sql`
    SELECT a.machine, count(*)::int AS alertes, sum(a.occurrences)::int AS occurrences
    FROM alerte a WHERE a.premiere_vue >= ${depuis.toISOString()}
    GROUP BY a.machine ORDER BY occurrences DESC LIMIT 10
  `)).rows as { machine: string, alertes: number, occurrences: number }[]

  // Médiane, et non moyenne : une seule alerte oubliée trois semaines déplacerait la moyenne
  // au point de la rendre ininterprétable.
  const [delai] = (await db.execute(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (d.premiere_decision - a.premiere_vue)) / 3600
    ) AS heures
    FROM alerte a
    JOIN (
      SELECT alerte_id, min(cree_le) AS premiere_decision
      FROM alerte_journal WHERE genre IN ('statut', 'escalade') GROUP BY alerte_id
    ) d ON d.alerte_id = a.id
    WHERE a.premiere_vue >= ${depuis.toISOString()}
  `)).rows as { heures: number | null }[]

  const total = parStatut.reduce((n, p) => n + Number(p.n), 0)
  const escaladees = Number(parStatut.find(p => p.statut === 'escaladee')?.n ?? 0)

  return {
    periodeJours: jours,
    total,
    parStatut: Object.fromEntries(parStatut.map(p => [p.statut, Number(p.n)])),
    tauxEscalade: total ? Math.round((escaladees / total) * 100) : 0,
    delaiMedianTriageHeures: delai?.heures === null || delai?.heures === undefined ? null : Math.round(Number(delai.heures) * 10) / 10,
    reglesEcartees: ecarteesParRegle,
    machines: parMachine,
  }
}

/** Mois d'`Europe/Paris` d'un instant, pour l'agrégat. */
export const moisParis = (d: Date) => jourParis(d).slice(0, 7)

/**
 * Rétention des alertes non escaladées : les lignes partent, leur décompte reste. Les alertes
 * écartées sont la matière du réglage des règles — les effacer rendrait le palmarès aveugle.
 * Les escaladées suivent la rétention de leur incident.
 */
export async function purgerAlertes(jours?: number): Promise<{ agregees: number, purgees: number }> {
  jours = jours ?? (await lireConfigAlertes()).retentionJours
  const A = alertesSchema.alerte
  const G = alertesSchema.alerteAgregat
  const limite = new Date(Date.now() - jours * 86_400_000)

  const vieilles = await db.select().from(A).where(and(
    sql`${A.statut} <> 'escaladee'`,
    sql`${A.derniereVue} < ${limite.toISOString()}`,
  ))
  if (!vieilles.length) return { agregees: 0, purgees: 0 }

  for (const a of vieilles) {
    await db.insert(G).values({
      mois: moisParis(a.premiereVue), source: a.source, regleId: a.regleId, machine: a.machine,
      statut: a.statut, motifEcart: a.motifEcart, alertes: 1, occurrences: a.occurrences,
    }).onConflictDoUpdate({
      target: [G.mois, G.source, G.regleId, G.machine, G.statut, G.motifEcart],
      set: { alertes: sql`${G.alertes} + 1`, occurrences: sql`${G.occurrences} + ${a.occurrences}` },
    })
  }
  await db.delete(A).where(inArray(A.id, vieilles.map(a => a.id)))
  console.log(`🧹 Alertes : ${vieilles.length} purgée(s) au-delà de ${jours} jours, décomptes conservés.`)
  return { agregees: vieilles.length, purgees: vieilles.length }
}

const VERROU_PURGE = 4837205
const INTERVALLE_PURGE_MS = 24 * 60 * 60 * 1000

export async function purgerAlertesVerrouille(): Promise<void> {
  const [verrou] = (await db.execute(sql`SELECT pg_try_advisory_lock(${VERROU_PURGE}) AS obtenu`)).rows as { obtenu: boolean }[]
  if (!verrou?.obtenu) return
  try {
    await purgerAlertes()
  }
  finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${VERROU_PURGE})`)
  }
}

/** Démarre la purge quotidienne. Appelée une fois au démarrage du serveur. */
export function demarrerPurgeAlertes(): void {
  purgerAlertesVerrouille().catch(e => console.error('❌ Purge des alertes (démarrage) :', e))
  const minuteur = setInterval(() => {
    purgerAlertesVerrouille().catch(e => console.error('❌ Purge des alertes (périodique) :', e))
  }, INTERVALLE_PURGE_MS)
  minuteur.unref?.()
}
