import { db } from "@slowpoke/database";
import { mainSchema, incidentsSchema, settingsSchema, glpiSchema } from "@slowpoke/database/tables";
import { appelerExterne } from "@slowpoke/connecteurs/sortie";
import { eq, inArray, like, sql } from "drizzle-orm";
import { createLog } from "./log";
import { dechiffrer } from "@slowpoke/connecteurs/secrets";
import { apparierMachine, apparierDansTexte } from "./glpi";
import { noterSucces, noterEchec } from "@slowpoke/connecteurs/synchro";
import { PERIMETRE_PAR_ENTITE } from "@slowpoke/database/organisation";

// Import des tickets du SOC (Advens), tiré à intervalle régulier.
//
// La correspondance vit avec les énumérations qu'elle alimente : ajouter une valeur à
// `incident_type` sans traiter le cas ici devient une erreur de compilation.

const INTERVALLE_MS = 30 * 60 * 1000

// Verrou consultatif propre à cette tâche : deux tâches distinctes ne doivent pas s'exclure.
const VERROU = 4837202

// Fenêtre glissante plutôt qu'un curseur mémorisé : aucun état à stocker, et un serveur
// arrêté rattrape seul au redémarrage. L'idempotence vient d'`external_id`.
const FENETRE_JOURS = 30

// Au-delà de cet âge, un ticket importé est de l'historique : journalisé sans notifier,
// sinon le premier passage réveille tout le monde d'un coup.
const SEUIL_NOTIFICATION_JOURS = 7

// La borne haute de `range` est EXCLUSIVE : `0-100` rend 100 éléments, pas 101. La
// documentation d'Advens affirme l'inverse ; la suivre fait sauter un ticket par page.
const TAILLE_PAGE = 100

/** Garde-fou : au-delà, on arrête de paginer et on le dit, plutôt que de boucler sans fin. */
const PAGES_MAX = 50

export type ConfigAdvens = { base: string, client: string, cle: string }

/** Clés de réglage dans `app_setting`. */
export const CLE_BASE = 'advens.base_url'
export const CLE_CLIENT = 'advens.customer'
export const CLE_JETON = 'advens.token'

/**
 * Configuration, relue en base à chaque passage : elle se règle depuis l'interface, donc
 * sans accès au serveur. `null` tant que les trois valeurs ne sont pas renseignées.
 */
export async function lireConfigAdvens(): Promise<ConfigAdvens | null> {
    const lignes = await db.select().from(settingsSchema.appSetting)
        .where(inArray(settingsSchema.appSetting.key, [CLE_BASE, CLE_CLIENT, CLE_JETON]))
    const v = Object.fromEntries(lignes.map(l => [l.key, l.value?.trim() ?? '']))
    // La barre finale se glisse facilement dans un copier-coller d'URL.
    const base = v[CLE_BASE]?.replace(/\/+$/, '')
    const client = v[CLE_CLIENT]
    const cle = dechiffrer(v[CLE_JETON])
    if (!base || !client || !cle) return null
    return { base, client, cle }
}

// --- Ce que renvoie l'API : seuls les champs utilisés sont déclarés. ---

type TicketAdvens = {
    id: string
    reference?: string | null
    title?: string | null
    details_text?: string | null
    details_md?: string | null
    synthesis_text?: string | null
    synthesis_md?: string | null
    recommendation_text?: string | null
    recommendation_md?: string | null
    status: string
    closing_reason?: string | null
    priority?: number | null
    etsi?: string | null
    kill_chain?: string | null
    correction?: string | null
    impact?: string | null
    exploitation?: string | null
    deadline?: string | null
    kibana_url?: string | null
    date_create?: string | null
    date_update?: string | null
    date_closure?: string | null
    handler?: string | null
    // Type de tag propre au tenant, absent du schéma générique : lu s'il est là, sans en dépendre.
    tags?: Record<string, string[]> | null
}

type AssetAdvens = {
    asset_name?: string | null
    hostname?: string | null
    ipv4?: string | null
    ipv6?: string | null
    url?: string | null
    status?: string | null
}

type Enveloppe<T> = { total: number | null, data: T[] | null }

// --- Correspondances : ce qui est propre au référentiel, en un seul endroit. ---

type TypeIncident = 'phishing' | 'malware' | 'ransomware' | 'data_breach' | 'ddos' | 'network_intrusion' | 'other'
type Severite = 'low' | 'medium' | 'high' | 'critical'
type Statut = 'open' | 'investigating' | 'in_progress' | 'surveillance' | 'resolved' | 'closed'
// Dérivé de l'enum : une valeur retirée devient une erreur de compilation.
type Resolution = (typeof mainSchema.incidentResolution.enumValues)[number]
type Perimetre = 'composante' | 'laboratoire' | 'service_central' | 'infrastructure' | 'etablissement_raccorde' | 'inconnu'

/**
 * Codes ETSI GS ISI 001-1, par famille. `IWH_UKN.1` signifie « incident non catégorisé » :
 * le faire tomber en `other` est la traduction fidèle, d'où l'usage de `dreaded_event` et
 * `kill_chain` en renfort.
 */
const TYPE_PAR_FAMILLE_ETSI: Record<string, TypeIncident> = {
    IEX_PHI: 'phishing',
    // Usurpation de domaine ou de marque : le prélude d'une campagne, pas un incident à part.
    IEX_FGY: 'phishing',
    IEX_MLW: 'malware',
    IEX_DOS: 'ddos',
    IEX_INT: 'network_intrusion',
    // Défigurer un site suppose d'avoir compromis le serveur.
    IEX_DFC: 'network_intrusion',
    IWH_VNP: 'network_intrusion',
    IWH_VCN: 'network_intrusion',
}

/** Étapes de la chaîne d'attaque, en renfort quand le code ETSI ne catégorise rien. */
const TYPE_PAR_KILL_CHAIN: Record<string, TypeIncident> = {
    // Un canal de commande suppose un implant qui l'ouvre.
    'command and control': 'malware',
    exfiltration: 'data_breach',
    'credential access': 'network_intrusion',
    'initial access': 'network_intrusion',
    'lateral movement': 'network_intrusion',
    exploitation: 'network_intrusion',
    installation: 'malware',
    delivery: 'phishing',
}

/** Libellés ETSI. Seules les familles dont l'intitulé est établi : à défaut, le code brut. */
const LIBELLE_FAMILLE_ETSI: Record<string, string> = {
    IEX_PHI: 'Hameçonnage',
    IEX_FGY: 'Usurpation de site ou de marque',
    IEX_MLW: 'Code malveillant',
    IEX_DOS: 'Déni de service',
    IEX_INT: 'Intrusion',
    IEX_DFC: 'Défiguration de site',
    IEX_SPM: 'Courrier non sollicité',
    IEX_MIS: 'Détournement de ressources',
    IEX_PHY: 'Intrusion ou action physique',
    IWH_UKN: 'Incident non catégorisé',
    IWH_VNP: 'Exploitation d\'une vulnérabilité non corrigée',
    IWH_VCN: 'Exploitation d\'un défaut de configuration',
    IDB_RGH: 'Abus de droits ou élévation de privilèges',
    IDB_UID: 'Usurpation d\'identité',
    IDB_IAC: 'Accès Internet illicite',
    IMF_BRE: 'Panne ou dysfonctionnement accidentel',
    IMF_MDL: 'Erreur de destinataire',
}

/** Événements redoutés (tag du tenant). Prioritaires : c'est le SOC qui qualifie. */
const TYPE_PAR_EVENEMENT_REDOUTE: Record<string, TypeIncident> = {
    phishing: 'phishing',
    malware: 'malware',
    ransomware: 'ransomware',
    'data breach': 'data_breach',
    'data leak': 'data_breach',
    ddos: 'ddos',
    intrusion: 'network_intrusion',
}

/** P1 est le plus grave, comme dans Slowpoke : la correspondance est un simple index. */
const SEVERITE_PAR_PRIORITE: Record<number, Severite> = {
    1: 'critical', 2: 'high', 3: 'medium', 4: 'low',
}

const STATUT_PAR_STATUT: Record<string, Statut> = {
    active: 'open',
    pending: 'open',
    in_progress: 'in_progress',
    awaiting_closure: 'resolved',
    closed: 'closed',
}

const RESOLUTION_PAR_MOTIF: Record<string, Resolution> = {
    solved: 'true_positive',
    // Incident réel dont le risque est assumé : une décision de pilotage, pas un vrai positif.
    risk_accepted: 'risk_accepted',
    false_positive: 'false_positive',
    // Activité de test autorisée : légitime, pas une erreur de détection.
    pentest: 'legitimate',
}

/**
 * Motifs qui ne concluent rien ici : ils décrivent la clôture DU SOC, pas notre jugement.
 * Un ticket clos « sans risque de sécurité » parce que la machine avait été éteinte n'est
 * pas « bénin ». Le motif est conservé et affiché ; la résolution reste à poser.
 */
const MOTIFS_SANS_CONCLUSION = new Set(['no_security_risk', 'no_longer_applicable'])


// --- Filtre : ce qui mérite une fiche. ---

/** Les cinq familles `V*` décrivent des VULNÉRABILITÉS, `IMP_` des mesures d'impact. */
function estUnIncident(etsi?: string | null): boolean {
    if (!etsi) return true
    return !/^(V[A-Z]{2}_|IMP_)/.test(etsi)
}

function evenementsRedoutes(t: TicketAdvens): string[] {
    return t.tags?.dreaded_event ?? []
}

/**
 * Un ticket entre si le SOC ne l'a pas rangé « sans risque de sécurité », OU s'il porte un
 * événement redouté quel qu'en soit le classement — un phishing avéré peut être clos en
 * `no_security_risk` une fois traité côté SOC, et serait perdu sans cette seconde branche.
 */
export function meriteUneFiche(t: TicketAdvens): boolean {
    if (!estUnIncident(t.etsi)) return false
    if (evenementsRedoutes(t).length > 0) return true
    return t.closing_reason !== 'no_security_risk'
}

// --- Client. ---

async function appeler<T>(cfg: ConfigAdvens, chemin: string, params: URLSearchParams): Promise<Enveloppe<T>> {
    const url = `${cfg.base}/${cfg.client}/v1/${chemin}?${params}`
    const r = await appelerExterne('advens', url, {
        headers: { accept: 'application/json', Authorization: `Bearer ${cfg.cle}` },
        signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) {
        // Le corps porte le détail de la validation ; l'URL peut contenir des paramètres,
        // jamais la clé — elle est dans l'en-tête.
        throw new Error(`Advens ${r.status} sur ${chemin} : ${(await r.text()).slice(0, 300)}`)
    }
    return await r.json() as Enveloppe<T>
}

/** Tickets modifiés depuis `depuis`, toutes pages confondues. */
async function listerTickets(cfg: ConfigAdvens, depuis: Date | null): Promise<TicketAdvens[]> {
    const tickets: TicketAdvens[] = []
    for (let page = 0; page < PAGES_MAX; page++) {
        const debut = page * TAILLE_PAGE
        const params = new URLSearchParams({
            sort: 'date_update',
            range: `${debut}-${debut + TAILLE_PAGE}`,
        })
        // Sans millisecondes ni « Z » : c'est la forme que la validation d'Advens accepte.
        if (depuis) params.set('search', `date_update__gt=${depuis.toISOString().slice(0, 19)}`)
        const { data } = await appeler<TicketAdvens>(cfg, 'tickets', params)
        const lot = data ?? []
        tickets.push(...lot)
        if (lot.length < TAILLE_PAGE) return tickets
    }
    console.warn(`⚠️ Advens : ${PAGES_MAX} pages atteintes, des tickets peuvent manquer.`)
    return tickets
}

/** Actifs concernés par un ticket. Un échec ici ne doit pas faire perdre l'incident. */
async function listerActifs(cfg: ConfigAdvens, ticketId: string): Promise<AssetAdvens[]> {
    try {
        const params = new URLSearchParams({ range: `0-${TAILLE_PAGE}` })
        const { data } = await appeler<AssetAdvens>(cfg, `tickets/${ticketId}/assets`, params)
        return data ?? []
    }
    catch (e) {
        console.error(`❌ Advens : actifs du ticket ${ticketId} :`, e)
        return []
    }
}

/** Désignations exploitables d'un actif : nom d'hôte et adresse séparés, la corrélation
 *  d'un incident à l'autre pouvant porter sur l'un ou sur l'autre. */
function designations(actifs: AssetAdvens[]): string[] {
    const vues = new Set<string>()
    for (const a of actifs) {
        for (const v of [a.hostname, a.asset_name, a.ipv4, a.ipv6, a.url]) {
            const s = v?.trim()
            if (s) vues.add(s)
        }
    }
    return [...vues]
}

// --- Correspondance ticket → incident. ---

export function typeDe(t: TicketAdvens): TypeIncident {
    for (const e of evenementsRedoutes(t)) {
        const trouve = TYPE_PAR_EVENEMENT_REDOUTE[e.trim().toLowerCase()]
        if (trouve) return trouve
    }
    const famille = t.etsi?.split('.')[0]
    if (famille && TYPE_PAR_FAMILLE_ETSI[famille]) return TYPE_PAR_FAMILLE_ETSI[famille]!

    const etape = t.kill_chain?.trim().toLowerCase()
    if (etape && TYPE_PAR_KILL_CHAIN[etape]) return TYPE_PAR_KILL_CHAIN[etape]!
    if (etape) console.warn(`⚠️ Advens : étape « ${t.kill_chain} » inconnue, incident classé « autre ».`)

    return 'other'
}

function perimetreDe(t: TicketAdvens): Perimetre {
    const entite = t.tags?.perimeter?.[0] ?? t.handler
    // Le champ `perimeter` à la racine du ticket vaut la chaîne « perimeter », pas le nom
    // de l'entité : c'est le tag qu'il faut lire.
    if (!entite) return 'inconnu'
    const trouve = PERIMETRE_PAR_ENTITE[entite.trim()]
    if (!trouve) console.warn(`⚠️ Advens : périmètre « ${entite} » inconnu, classé « inconnu ».`)
    return trouve ?? 'inconnu'
}

function resolutionDe(t: TicketAdvens): Resolution | null {
    if (!t.closing_reason) return null
    if (MOTIFS_SANS_CONCLUSION.has(t.closing_reason)) return null
    const trouve = RESOLUTION_PAR_MOTIF[t.closing_reason]
    if (!trouve) console.warn(`⚠️ Advens : motif de clôture « ${t.closing_reason} » inconnu.`)
    return trouve ?? null
}

/**
 * Choisit la meilleure variante d'un champ riche : Advens rend chaque texte en HTML, texte
 * brut et Markdown. Le Markdown conserve listes et titres, sans le risque d'injection du HTML.
 */
function texteRiche(md?: string | null, texte?: string | null): string | null {
    return md?.trim() || texte?.trim() || null
}

/**
 * La description COURTE, celle de la liste : c'est `title`, et rien d'autre.
 *
 * La « synthèse » d'Advens n'est pas un résumé mais le rapport complet (journaux, IOC,
 * commande d'exploitation) — plus de mille caractères. Synthèse, détails et recommandations
 * ont chacun leur bloc sur la fiche.
 */
export function descriptionDe(t: TicketAdvens): string {
    const titre = t.title?.trim()
    if (titre) return titre
    // Sans titre, on se rabat sur le début de la synthèse plutôt que de laisser un incident
    // muet dans la liste — tronqué, parce que c'est un résumé qu'on attend ici.
    const repli = texteRiche(t.synthesis_md, t.synthesis_text) ?? texteRiche(t.details_md, t.details_text)
    if (!repli) return ''
    return repli.length > 200 ? repli.slice(0, 200).trimEnd() + '…' : repli
}

/** Échelles qualitatives d'Advens, rendues dans la langue du reste de l'application. */
const ECHELLE: Record<string, string> = {
    easy: 'Facile', medium: 'Moyenne', hard: 'Difficile',
    low: 'Faible', moderate: 'Modéré', high: 'Élevé', critical: 'Critique',
}
const traduire = (v: string | null | undefined) => (v ? ECHELLE[v.trim().toLowerCase()] ?? v : v)

/** Métadonnées structurées du ticket. Les clés sont humanisées à l'affichage. */
export function champsDe(t: TicketAdvens): Record<string, string> {
    const famille = t.etsi?.split('.')[0]
    const champs: Record<string, string> = {}
    const poser = (cle: string, valeur: string | number | null | undefined) => {
        const s = valeur === null || valeur === undefined ? '' : String(valeur).trim()
        if (s) champs[cle] = s
    }

    poser('reference_soc', t.reference)
    // Le statut et le motif du SOC, tels quels. Ce sont SES mots, gardés sans traduction :
    // la résolution de Slowpoke, elle, est le jugement de la cellule.
    poser('statut_soc', t.status)
    poser('motif_cloture_soc', t.closing_reason)
    poser('code_etsi', t.etsi)
    poser('libelle_etsi', famille ? LIBELLE_FAMILLE_ETSI[famille] : null)
    poser('chaine_attaque', t.kill_chain)
    poser('priorite_soc', t.priority ? `P${t.priority}` : null)
    poser('entite_concernee', t.tags?.perimeter?.[0] ?? t.handler)
    // La date d'échéance du SOC : une contrainte de leur côté, pas celle de la cellule.
    poser('echeance_soc', t.deadline?.slice(0, 10))
    poser('facilite_correction', traduire(t.correction))
    poser('impact_soc', traduire(t.impact))
    poser('facilite_exploitation', traduire(t.exploitation))
    poser('kibana_url', t.kibana_url)
    return champs
}

/** Textes longs et postes concernés : rendus en blocs sur la fiche, pas en tableau. */
export function blocsDe(t: TicketAdvens, postes: string[]): Record<string, string> {
    const blocs: Record<string, string> = {}
    const synthese = texteRiche(t.synthesis_md, t.synthesis_text)
    const details = texteRiche(t.details_md, t.details_text)
    const recommandation = texteRiche(t.recommendation_md, t.recommendation_text)
    // La synthèse est reprise en bloc dès qu'elle DIFFÈRE de la description : comparer, plutôt
    // que se fier à la présence d'un titre, sinon un ticket sans titre perd ce qui dépassait.
    if (synthese && synthese !== descriptionDe(t)) blocs.synthese_soc = synthese
    if (details) blocs.details_soc = details
    if (recommandation) blocs.recommandation_soc = recommandation
    // Les postes figurent ici pour être visibles quel que soit le type d'incident : les
    // champs `machines` n'existent que sur malware, ransomware et intrusion.
    if (postes.length) blocs.postes_concernes = postes.join('\n')
    return blocs
}

// --- Import. ---

export type BilanImport = { crees: number, clos: number, ignores: number, examines: number, echecs: number }

/**
 * Rapatrie les tickets modifiés récemment et crée les fiches manquantes.
 *
 * Idempotent par `external_id`. Une fiche existante n'est JAMAIS écrasée — sauf sa clôture,
 * qui appartient au SOC. Pilote, gravité ajustée et commentaires restent à la cellule.
 */
export async function importerTicketsAdvens(): Promise<BilanImport> {
    const vide: BilanImport = { crees: 0, clos: 0, ignores: 0, examines: 0, echecs: 0 }
    const cfg = await lireConfigAdvens()
    if (!cfg) return vide

    // Verrou consultatif : si l'application est répliquée un jour, une seule instance
    // interroge le SOC. `pg_try_advisory_lock` rend la main immédiatement.
    const [verrou] = (await db.execute(sql`SELECT pg_try_advisory_lock(${VERROU}) AS obtenu`)).rows as { obtenu: boolean }[]
    if (!verrou?.obtenu) return vide

    try {
        // Premier passage : tout l'historique est reprise, la fenêtre glissante ne suffisant qu'ensuite.
        // Sans cette exception, brancher le SOC ne remonterait qu'un mois sans que rien ne le dise.
        const [deja] = await db.select({ id: mainSchema.incident.id }).from(mainSchema.incident)
            .where(like(mainSchema.incident.externalId, 'advens:%')).limit(1)
        const depuis = deja ? new Date(Date.now() - FENETRE_JOURS * 24 * 60 * 60 * 1000) : null
        if (!depuis) console.log('ℹ️ Advens : premier passage, reprise de tout l\'historique.')

        const tickets = await listerTickets(cfg, depuis)
        const bilan: BilanImport = { ...vide, examines: tickets.length }

        for (const t of tickets) {
            // Chaque ticket est isolé : sans cela, un seul en défaut interromprait la
            // boucle et tous les suivants resteraient invisibles — un import « qui ne
            // remonte presque rien » sans que rien ne dise pourquoi.
            try {
                const externalId = `advens:${t.id}`
                const [existant] = await db.select().from(mainSchema.incident)
                    .where(eq(mainSchema.incident.externalId, externalId)).limit(1)

                if (existant) {
                    await rafraichirChampsSoc(existant, t)
                    if (await cloturerSiFerme(existant, t)) bilan.clos++
                    continue
                }

                // LE FILTRE NE GOUVERNE QUE LA CRÉATION : un ticket écarté n'ouvre pas de fiche, mais s'il
                // en existe déjà une, elle doit se fermer avec lui — sinon elle reste ouverte pour toujours.
                if (!meriteUneFiche(t)) { bilan.ignores++; continue }

                await creer(cfg, t, externalId)
                bilan.crees++
            }
            catch (e) {
                bilan.echecs++
                console.error(`❌ Advens : ticket ${t.reference ?? t.id} non importé :`, e)
            }
        }

        await noterSucces('advens', `${bilan.crees} créé(s), ${bilan.clos} clos, ${bilan.ignores} écarté(s)`)

        if (bilan.crees || bilan.clos || bilan.echecs) {
            console.log(`✅ Advens : ${bilan.crees} créé(s), ${bilan.clos} clos, ${bilan.ignores} écarté(s), ${bilan.echecs} en échec, sur ${bilan.examines} examiné(s).`)
        }
        return bilan
    }
    catch (e) {
        await noterEchec('advens', e)
        throw e
    }
    finally {
        await db.execute(sql`SELECT pg_advisory_unlock(${VERROU})`)
    }
}

/**
 * Rafraîchit les champs qui appartiennent au SOC, et journalise un changement de motif.
 * Les figer à la création les rendait faux dès que le SOC rectifiait son classement.
 */
async function rafraichirChampsSoc(
    existant: typeof mainSchema.incident.$inferSelect,
    t: TicketAdvens,
): Promise<boolean> {
    const E = mainSchema.incidentExtension
    const [ext] = await db.select().from(E).where(eq(E.incidentId, existant.id)).limit(1)
    if (!ext) return false

    const champs = { ...(ext.customFields as Record<string, string> | null ?? {}) }
    const avant = champs.motif_cloture_soc ?? null
    const apres = t.closing_reason ?? null
    if (avant === apres && (champs.statut_soc ?? null) === t.status) return false

    if (apres) champs.motif_cloture_soc = apres
    else delete champs.motif_cloture_soc
    champs.statut_soc = t.status
    await db.update(E).set({ customFields: champs }).where(eq(E.incidentId, existant.id))

    // Journalisé seulement quand le SOC CHANGE d'avis : la première inscription du motif
    // n'est pas un événement, et le premier passage après cette évolution les aurait tous
    // annoncés d'un coup.
    if (avant && apres && avant !== apres) {
        await createLog(existant.id, 'update', undefined, undefined,
            `Motif de clôture chez Advens : ${avant} → ${apres}.`)
    }
    return true
}

/** Le SOC décide de la clôture. Renvoie `true` si la fiche a été fermée par ce passage. */
async function cloturerSiFerme(
    existant: typeof mainSchema.incident.$inferSelect,
    t: TicketAdvens,
): Promise<boolean> {
    if (t.status !== 'closed') return false
    if (existant.status === 'closed') return false

    const resolution = resolutionDe(t)
    await db.update(mainSchema.incident)
        .set({
            status: 'closed',
            // La résolution déjà posée par la cellule prime : elle a vu le dossier.
            ...(existant.resolution ? {} : resolution ? { resolution } : {}),
            updatedAt: new Date(),
        })
        .where(eq(mainSchema.incident.id, existant.id))

    try {
        await createLog(
            existant.id, 'status_change', undefined, undefined,
            `Clôturé chez Advens${t.closing_reason ? ` — motif : ${t.closing_reason}` : ''}.`,
        )
    }
    catch (e) {
        console.error(`❌ Advens : incident ${existant.id} clos, mais sa journalisation a échoué :`, e)
    }
    return true
}

async function creer(cfg: ConfigAdvens, t: TicketAdvens, externalId: string): Promise<void> {
    const type = typeDe(t)
    const creeLe = t.date_create ? new Date(t.date_create) : null
    // Les dates d'Advens portent toujours un fuseau explicite (« +00:00 ») : pas de
    // réinterprétation à faire, contrairement aux sources internes.
    const machines: string[] = designations(await listerActifs(cfg, t.id))

    const incidentId = await db.transaction(async (tx) => {
        const [incident] = await tx.insert(mainSchema.incident).values({
            type,
            severity: SEVERITE_PAR_PRIORITE[t.priority ?? 4] ?? 'low',
            status: STATUT_PAR_STATUT[t.status] ?? 'open',
            resolution: resolutionDe(t) ?? undefined,
            description: descriptionDe(t) || undefined,
            source: `SOC Advens${t.reference ? ` — ${t.reference}` : ''}`,
            externalId,
            perimeter: perimetreDe(t),
            // Le SOC a détecté : c'est notre date de connaissance, et elle n'est pas estimée.
            knowledgeAt: creeLe ?? undefined,
            knowledgeEstimated: false,
            ...(creeLe ? { createdAt: creeLe, updatedAt: creeLe, referredAt: creeLe } : {}),
        }).returning()

        if (!incident) throw new Error('Advens : création de l\'incident impossible')

        // Métadonnées structurées, chargées pour TOUS les types d'incident : c'est le seul véhicule
        // qui marche partout, `additional_info` manquant à certaines tables de détail.
        const champs = { ...champsDe(t), ...blocsDe(t, machines) }
        const etiquettes = [...evenementsRedoutes(t), ...(t.kill_chain?.trim() ? [t.kill_chain.trim()] : [])]
        if (Object.keys(champs).length) {
            await tx.insert(mainSchema.incidentExtension).values({
                incidentId: incident.id,
                // Valeur stable : la colonne est indexée, et elle sert à retrouver
                // l'origine d'une fiche.
                customType: 'Ticket SOC Advens',
                tags: etiquettes,
                customFields: champs,
            })
        }

        // Le volet technique est créé même sans machine : la fiche l'attend pour ce type, et son
        // absence faisait échouer l'affichage.
        if (type === 'malware' || type === 'ransomware') {
            await tx.insert(incidentsSchema.malwareIncident)
                .values({ incidentId: incident.id, machines, detectedAt: creeLe ?? undefined })
        }
        else if (type === 'network_intrusion') {
            await tx.insert(incidentsSchema.intrusionIncident)
                .values({ incidentId: incident.id, machines, detectedAt: creeLe ?? undefined })
        }

        return incident.id
    })

    // Le SOC ne déclare pas toujours d'actif : la machine est alors seulement citée dans
    // le rapport. On relève donc aussi les noms de l'inventaire présents dans le texte.
    const citees = await apparierDansTexte([descriptionDe(t), ...Object.values(blocsDe(t, []))].join('\n'))
        .catch((e) => {
            console.error(`❌ Advens : lecture des machines dans le texte de ${t.id} :`, e)
            return [] as { nom: string, glpiId: string }[]
        })

    const dejaVues = new Set(machines.map(m => m.toLowerCase()))
    for (const c of citees) {
        if (!dejaVues.has(c.nom.toLowerCase())) machines.push(c.nom)
    }

    // Machines appariées à l'inventaire quand le nom correspond sans ambiguïté ; sinon le nom
    // est conservé tel quel, cas normal pour une machine hors inventaire.
    for (const nom of machines) {
        try {
            const glpiId = await apparierMachine(nom)
            await db.insert(glpiSchema.incidentMachine)
                .values({ incidentId, nom, glpiId })
                .onConflictDoUpdate({
                    target: [glpiSchema.incidentMachine.incidentId, glpiSchema.incidentMachine.nom],
                    set: { glpiId },
                })
        }
        catch (e) {
            console.error(`❌ Advens : machine « ${nom} » non rattachée à ${incidentId} :`, e)
        }
    }

    // Un import de rattrapage ne doit pas déclencher une avalanche de notifications ;
    // un ticket récent, si — c'est tout l'intérêt de la récupération automatique.
    const ageJours = creeLe ? (Date.now() - creeLe.getTime()) / 86_400_000 : 0
    const silencieux = ageJours > SEUIL_NOTIFICATION_JOURS

    // `createLog` attend l'envoi des notifications et des webhooks : un VAPID mal réglé ou un
    // webhook injoignable ferait échouer un import pourtant réussi.
    try {
        await createLog(
            incidentId, 'created', undefined, undefined,
            `Importé du SOC Advens${t.reference ? ` (${t.reference})` : ''}.`,
            undefined, { silent: silencieux },
        )
    }
    catch (e) {
        console.error(`❌ Advens : incident ${incidentId} créé, mais sa journalisation a échoué :`, e)
    }

}

/** Démarre la récupération périodique. Appelée une fois au démarrage du serveur. */
export function demarrerImportAdvens(): void {
    // Le minuteur tourne même sans configuration : elle se pose depuis l'interface, à chaud.

    // Un passage au démarrage : après un arrêt prolongé, on ne veut pas attendre une
    // demi-heure de plus pour rattraper ce qui s'est ouvert entre-temps.
    importerTicketsAdvens().catch(e => console.error('❌ Advens (démarrage) :', e))

    const minuteur = setInterval(() => {
        importerTicketsAdvens().catch(e => console.error('❌ Advens (périodique) :', e))
    }, INTERVALLE_MS)

    // Ne pas retenir le processus en vie pour ce seul minuteur.
    ;(minuteur as unknown as { unref?: () => void }).unref?.()
}

export type ResultatTest =
    | { ok: true, tickets: number, retenus: number }
    | { ok: false, message: string }

/**
 * Vérifie que les trois réglages permettent réellement d'interroger le SOC : une page est
 * demandée et ce qui passerait le filtre est rapporté, au lieu de le découvrir une
 * demi-heure plus tard dans les journaux.
 */
export async function testerConnexionAdvens(cfg: ConfigAdvens): Promise<ResultatTest> {
    try {
        const params = new URLSearchParams({ range: `0-${TAILLE_PAGE}`, sort: 'date_update', desc: 'date_update' })
        const { total, data } = await appeler<TicketAdvens>(cfg, 'tickets', params)
        const lot = data ?? []
        return { ok: true, tickets: total ?? lot.length, retenus: lot.filter(meriteUneFiche).length }
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
}
