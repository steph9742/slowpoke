import { db } from "@slowpoke/database";
import { settingsSchema, harfanglabSchema } from "@slowpoke/database/tables";
import { appelerExterne } from "@slowpoke/connecteurs/sortie";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { dechiffrer } from "@slowpoke/connecteurs/secrets";
import { noterSucces, noterEchec } from "@slowpoke/connecteurs/synchro";

// Règles de liste blanche de l'EDR, en LECTURE SEULE : Slowpoke constate ce qui s'y trouve et
// le rapproche des exclusions consignées. Une exclusion posée dans la console sans être
// enregistrée est un angle mort ; ce module la rend visible, il ne la comble pas.

const INTERVALLE_MS = 6 * 60 * 60 * 1000

// 4837201 surveillance, 4837202 import SOC, 4837203 procédures, 4837204 inventaire.
const VERROU = 4837205

const TAILLE_PAGE = 200
const PAGES_MAX = 100

export const CLE_HFL_URL = 'harfanglab.url'
export const CLE_HFL_JETON = 'harfanglab.token'

export type ConfigHfl = { url: string, jeton: string }

/**
 * Jeton tel que l'EDR l'attend : sans schéma, sans aucun espace.
 *
 * Collé depuis l'interface de l'outil, il arrive souvent précédé de son schéma (« Token abc… »)
 * ou coupé d'un retour à la ligne, et l'en-tête devenait « Token Token abc… ». Un jeton ne
 * contient jamais d'espace, tous peuvent donc être retirés.
 */
export function normaliserJetonHfl(brut: string | null | undefined): string {
    return (brut ?? '').trim().replace(/^(token|bearer)\s+/i, '').replace(/\s+/g, '')
}

export async function lireConfigHfl(): Promise<ConfigHfl | null> {
    const lignes = await db.select().from(settingsSchema.appSetting)
        .where(inArray(settingsSchema.appSetting.key, [CLE_HFL_URL, CLE_HFL_JETON]))
    const v = Object.fromEntries(lignes.map(l => [l.key, l.value?.trim() ?? '']))
    const url = v[CLE_HFL_URL]?.replace(/\/+$/, '')
    const jeton = normaliserJetonHfl(dechiffrer(v[CLE_HFL_JETON]))
    return url && jeton ? { url, jeton } : null
}

// `Authorization: Token <clé>` — vérifié au curl sur l'instance. `Bearer` reste tenté en
// second : la documentation ne fixe pas le schéma, et une montée de version pourrait le
// changer. La forme retenue est mémorisée, et réessayée depuis zéro sur un 401.
const SCHEMAS = ['Token', 'Bearer'] as const
let schemaRetenu: string | null = null

const CHEMIN_REGLES = '/api/data/threat_intelligence/WhitelistRule/'

/** Ce qu'un schéma d'authentification s'est vu répondre. */
export type Refus = { schema: string, statut: number, corps: string }

/** Chaque refus est conservé AVEC son schéma : sinon un double 401 n'expose que le dernier
 *  essai, et « credentials were not provided » masque ce que l'autre schéma avait dit —
 *  « Invalid token », par exemple, qui désigne une tout autre cause. */
async function appelerDetaille(cfg: ConfigHfl, chemin: string): Promise<{ r: Response, refus: Refus[] }> {
    const essayer = (schema: string) => appelerExterne('harfanglab', `${cfg.url}${chemin}`, {
        headers: { Accept: 'application/json', Authorization: `${schema} ${cfg.jeton}` },
        signal: AbortSignal.timeout(30_000),
    })

    if (schemaRetenu) {
        const r = await essayer(schemaRetenu)
        if (r.status !== 401) return { r, refus: [] }
        schemaRetenu = null
    }

    const refus: Refus[] = []
    let derniere: Response | null = null
    for (const schema of SCHEMAS) {
        const r = await essayer(schema)
        if (r.status !== 401) { schemaRetenu = schema; return { r, refus } }
        refus.push({ schema, statut: r.status, corps: (await r.text()).slice(0, 200) })
        derniere = r
    }
    return { r: derniere!, refus }
}

/** Une redirection vers une autre origine fait perdre l'en-tête `Authorization` : `fetch` le
 *  retire par sécurité, et l'outil répond « credentials were not provided » sans que le jeton
 *  soit en cause. Adresse saisie en `http://` sur une instance qui force `https://`, le plus souvent. */
function origineChangee(cfg: ConfigHfl, r: Response): string | null {
    if (!r.redirected) return null
    try {
        const depart = new URL(cfg.url).origin
        const arrivee = new URL(r.url).origin
        return depart === arrivee ? null : `${depart} → ${arrivee}`
    }
    catch { return null }
}

/**
 * Une cause lisible, la même pour l'essai manuel et pour la synchronisation périodique :
 * ce qui s'affiche dans les réglages doit se retrouver dans le témoin d'activité.
 */
async function decrire(cfg: ConfigHfl, r: Response, refus: Refus[]): Promise<string> {
    const saut = origineChangee(cfg, r)
    if (saut) return `EDR : l'adresse redirige (${saut}), le jeton est perdu en route.`
    if (refus.length) return `EDR ${refus.map(x => `${x.schema} → ${x.statut} ${x.corps}`).join(' | ')}`
    return `EDR ${r.status} : ${(await r.text()).slice(0, 200)}`
}

type RegleHfl = {
    id: string
    comment?: string | null
    criteria_list?: string[] | null
    target?: string | null
    enabled?: boolean
    provided_by_hlab?: boolean
    creation_date?: string | null
    // Aucun champ de tag n'est documenté sur WhitelistRule : on accepte les formes
    // plausibles plutôt que d'en supposer une.
    [autre: string]: unknown
}

// Champs susceptibles de porter les étiquettes, du plus structuré au moins. `comment` n'en
// fait volontairement pas partie : c'est du texte libre, et y chercher un marqueur ferait
// passer une phrase pour une étiquette. Il est exposé tel quel, à part.
const CHAMPS_TAGS = ['tags', 'labels', 'categories', 'category'] as const

/**
 * Relève les étiquettes et NOMME le champ qui a répondu.
 *
 * Le swagger de l'EDR n'en documente aucun : deviner lequel porte le marqueur produirait une
 * donnée invérifiable. `champ` à `null` signifie qu'aucun n'existe — on le saura, au lieu
 * d'avoir supposé.
 */
function releverTags(regle: RegleHfl): { tags: string[] | null, champ: string | null } {
    for (const champ of CHAMPS_TAGS) {
        const brut = regle[champ]
        const valeurs = Array.isArray(brut)
            ? brut
            : typeof brut === 'string' && brut.trim()
                ? [brut]
                : []
        const tags = valeurs.map(v => String(v).trim()).filter(Boolean)
        if (tags.length) return { tags, champ }
    }
    return { tags: null, champ: null }
}

export type BilanHfl = { vues: number, ecrites: number, disparues: number }

export async function synchroniserHfl(): Promise<BilanHfl> {
    const vide: BilanHfl = { vues: 0, ecrites: 0, disparues: 0 }
    const cfg = await lireConfigHfl()
    if (!cfg) return vide

    const [verrou] = (await db.execute(sql`SELECT pg_try_advisory_lock(${VERROU}) AS obtenu`)).rows as { obtenu: boolean }[]
    if (!verrou?.obtenu) return vide

    try {
        const debutSync = new Date()
        const bilan = { ...vide }
        // Quels champs ont réellement porté des étiquettes : c'est la réponse à la question
        // que le swagger laisse ouverte, et elle doit se lire dans le bilan.
        const champsVus = new Set<string>()

        for (let page = 0; page < PAGES_MAX; page++) {
            const { r, refus } = await appelerDetaille(cfg, `${CHEMIN_REGLES}?limit=${TAILLE_PAGE}&offset=${page * TAILLE_PAGE}`)
            if (!r.ok) throw new Error(await decrire(cfg, r, refus))

            const j = await r.json() as { count?: number, results?: RegleHfl[] }
            const lot = j.results ?? []
            if (!lot.length) break

            for (const regle of lot) {
                if (!regle.id) continue
                bilan.vues++
                const etiquettes = releverTags(regle)
                if (etiquettes.champ) champsVus.add(etiquettes.champ)
                const valeurs = {
                    libelle: regle.comment?.trim() || null,
                    criteres: regle.criteria_list ?? [],
                    cible: regle.target ?? null,
                    active: regle.enabled !== false,
                    fourniParEditeur: regle.provided_by_hlab === true,
                    creeeLe: regle.creation_date ? new Date(regle.creation_date) : null,
                    presente: true,
                    tags: etiquettes.tags,
                    champTags: etiquettes.champ,
                    synchroniseLe: debutSync,
                }
                await db.insert(harfanglabSchema.harfanglabRule).values({ ref: regle.id, ...valeurs })
                    .onConflictDoUpdate({ target: harfanglabSchema.harfanglabRule.ref, set: valeurs })
                bilan.ecrites++
            }

            if (lot.length < TAILLE_PAGE) break
            if (page === PAGES_MAX - 1) {
                console.warn(`⚠️ EDR : ${PAGES_MAX} pages atteintes, des règles peuvent manquer du rapprochement.`)
            }
        }

        // Non revenues : marquées absentes, jamais supprimées — une exclusion peut les citer.
        const disparues = await db.update(harfanglabSchema.harfanglabRule)
            .set({ presente: false })
            .where(and(
                eq(harfanglabSchema.harfanglabRule.presente, true),
                lt(harfanglabSchema.harfanglabRule.synchroniseLe, debutSync),
            ))
            .returning({ ref: harfanglabSchema.harfanglabRule.ref })
        bilan.disparues = disparues.length

        const mentionTags = champsVus.size
            ? `étiquettes dans ${[...champsVus].join(', ')}`
            : 'aucun champ d\'étiquettes'
        await noterSucces('harfanglab', `${bilan.ecrites} règle(s), ${bilan.disparues} disparue(s), ${mentionTags}`)
        return bilan
    }
    catch (e) {
        // Tracé AVANT de relancer : une vue de rapprochement doit pouvoir dire que la
        // dernière lecture a échoué, au lieu d'afficher zéro écart.
        await noterEchec('harfanglab', e)
        throw e
    }
    finally {
        await db.execute(sql`SELECT pg_advisory_unlock(${VERROU})`)
    }
}

export function demarrerSyncHfl(): void {
    synchroniserHfl().catch(e => console.error('❌ EDR (démarrage) :', e))
    const minuteur = setInterval(() => {
        synchroniserHfl().catch(e => console.error('❌ EDR (périodique) :', e))
    }, INTERVALLE_MS)
    ;(minuteur as unknown as { unref?: () => void }).unref?.()
}

export async function testerHfl(cfg: ConfigHfl): Promise<{ ok: true, regles: number, schema: string } | { ok: false, message: string }> {
    try {
        schemaRetenu = null
        const { r, refus } = await appelerDetaille(cfg, `${CHEMIN_REGLES}?limit=1`)

        if (!r.ok) return { ok: false, message: await decrire(cfg, r, refus) }

        const j = await r.json() as { count?: number }
        return { ok: true, regles: j.count ?? 0, schema: schemaRetenu ?? '?' }
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
}
