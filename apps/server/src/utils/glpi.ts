import { db } from "@slowpoke/database";
import { settingsSchema, glpiSchema } from "@slowpoke/database/tables";
import { appelerExterne } from "@slowpoke/connecteurs/sortie";
import { and, asc, desc, eq, ilike, inArray, lt, sql } from "drizzle-orm";
import { dechiffrer } from "@slowpoke/connecteurs/secrets";
import { noterSucces, noterEchec } from "@slowpoke/connecteurs/synchro";

// Recherche de machines dans GLPI.
//
// Auth GLPI : App-Token (jeton applicatif) + user_token (compte dédié). `initSession`
// rend un Session-Token à passer sur chaque appel.
//
// La session est MISE EN CACHE : la recherche se déclenche à la frappe, et ouvrir une
// session par requête saturerait GLPI en quelques secondes de saisie.

export const CLE_GLPI_URL = 'glpi.url'
export const CLE_GLPI_APP = 'glpi.app_token'
export const CLE_GLPI_USER = 'glpi.user_token'
export const CLE_GLPI_GROUPE_CRITIQUE = 'glpi.groupe_critique'
// GLPI expose plusieurs champs de groupe (groupe, groupe technique…). Lequel porte le
// rattachement varie d'une installation à l'autre : on laisse le choix plutôt que de deviner.
export const CLE_GLPI_CHAMP_GROUPE = 'glpi.champ_groupe'

export type ConfigGlpi = { url: string, appToken: string, userToken: string, groupeCritique: string, champGroupe: number | null }

export async function lireConfigGlpi(): Promise<ConfigGlpi | null> {
    const lignes = await db.select().from(settingsSchema.appSetting)
        .where(inArray(settingsSchema.appSetting.key,
            [CLE_GLPI_URL, CLE_GLPI_APP, CLE_GLPI_USER, CLE_GLPI_GROUPE_CRITIQUE, CLE_GLPI_CHAMP_GROUPE]))
    const v = Object.fromEntries(lignes.map(l => [l.key, l.value?.trim() ?? '']))
    const url = v[CLE_GLPI_URL]?.replace(/\/+$/, '')
    const appToken = dechiffrer(v[CLE_GLPI_APP])
    const userToken = dechiffrer(v[CLE_GLPI_USER])
    if (!url || !appToken || !userToken) return null
    const champ = Number(v[CLE_GLPI_CHAMP_GROUPE])
    return {
        url, appToken, userToken,
        groupeCritique: v[CLE_GLPI_GROUPE_CRITIQUE] ?? '',
        champGroupe: Number.isFinite(champ) && champ > 0 ? champ : null,
    }
}

const base = (url: string) => url.replace(/\/apirest\.php\/?$/, '') + '/apirest.php'

// --- Session ---------------------------------------------------------------------------

// GLPI expire les sessions de son côté ; on renouvelle avant, sans attendre l'erreur.
const DUREE_SESSION_MS = 20 * 60 * 1000
let session: { jeton: string, expire: number, url: string } | null = null

async function jetonSession(cfg: ConfigGlpi): Promise<string> {
    // L'URL fait partie de la clé : changer de serveur dans les réglages doit invalider
    // la session en cache, pas la réutiliser contre le nouveau.
    if (session && session.expire > Date.now() && session.url === cfg.url) return session.jeton
    // Nouvelle session : les champs découverts peuvent dater d'une autre configuration.
    champsDecouverts = null

    const r = await appelerExterne('glpi', `${base(cfg.url)}/initSession`, {
        headers: { 'App-Token': cfg.appToken, Authorization: `user_token ${cfg.userToken}` },
        signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) throw new Error(`GLPI initSession ${r.status} : ${(await r.text()).slice(0, 200)}`)

    const j = await r.json() as { session_token?: string }
    if (!j.session_token) throw new Error('GLPI n\'a pas renvoyé de session_token.')

    session = { jeton: j.session_token, expire: Date.now() + DUREE_SESSION_MS, url: cfg.url }
    return j.session_token
}

async function appeler(cfg: ConfigGlpi, chemin: string): Promise<Response> {
    const jeton = await jetonSession(cfg)
    const faire = (s: string) => appelerExterne('glpi', `${base(cfg.url)}${chemin}`, {
        headers: { 'App-Token': cfg.appToken, 'Session-Token': s },
        signal: AbortSignal.timeout(20_000),
    })

    let r = await faire(jeton)
    // Session invalidée côté GLPI avant son expiration prévue : on en reprend une, une fois.
    if (r.status === 401) {
        session = null
        r = await faire(await jetonSession(cfg))
    }
    return r
}

// --- Champs de recherche -----------------------------------------------------------------

/**
 * Les identifiants de champs GLPI varient d'une installation à l'autre selon les plugins.
 * On les découvre plutôt que de les coder en dur — sauf le nom et l'identifiant, stables.
 */
const CHAMPS_FIXES = { NOM: 1, ID: 2 } as const

let champsDecouverts: { groupe?: number, entite?: number, lieu?: number, type?: number, os?: number, serie?: number } | null = null

/** Toutes les options de recherche pointant vers une table de groupes. */
export type ChampGroupe = { id: number, nom: string, champ: string }

export async function champsGroupe(cfg: ConfigGlpi): Promise<ChampGroupe[]> {
    const r = await appeler(cfg, '/listSearchOptions/Computer')
    if (!r.ok) return []
    const options = await r.json() as Record<string, { name?: string, field?: string, table?: string }>
    const trouves: ChampGroupe[] = []
    for (const [id, o] of Object.entries(options)) {
        if (!/^\d+$/.test(id) || typeof o !== 'object' || o === null) continue
        if (o.table === 'glpi_groups') trouves.push({ id: Number(id), nom: o.name ?? '', champ: o.field ?? '' })
    }
    return trouves
}

async function champs(cfg: ConfigGlpi) {
    if (champsDecouverts) return champsDecouverts

    const r = await appeler(cfg, '/listSearchOptions/Computer')
    if (!r.ok) {
        console.warn(`⚠️ GLPI : options de recherche indisponibles (${r.status}), seuls le nom et l'identifiant seront lus.`)
        champsDecouverts = {}
        return champsDecouverts
    }

    const options = await r.json() as Record<string, { name?: string, field?: string, table?: string }>
    const trouver = (predicat: (o: { name?: string, field?: string, table?: string }) => boolean) => {
        for (const [id, o] of Object.entries(options)) {
            if (!/^\d+$/.test(id) || typeof o !== 'object' || o === null) continue
            if (predicat(o)) return Number(id)
        }
        return undefined
    }

    champsDecouverts = {
        // `groups_id` et non `groups_id_tech` : le groupe de rattachement, pas le groupe
        // technique chargé de la maintenance.
        // Le réglage prime : plusieurs options pointent vers la table des groupes, et
        // seule l'installation sait laquelle porte le rattachement des machines.
        groupe: cfg.champGroupe
            ?? trouver(o => o.table === 'glpi_groups' && o.field === 'completename')
            ?? trouver(o => /^groupe$/i.test(o.name ?? '')),
        entite: trouver(o => o.table === 'glpi_entities'),
        lieu: trouver(o => o.table === 'glpi_locations'),
        type: trouver(o => o.table === 'glpi_computertypes'),
        os: trouver(o => o.table === 'glpi_operatingsystems'),
        serie: trouver(o => o.field === 'serial' && o.table === 'glpi_computers'),
    }
    return champsDecouverts
}

// --- Synchronisation ---------------------------------------------------------------------

const INTERVALLE_MS = 12 * 60 * 60 * 1000
const VERROU = 4837204
const TAILLE_PAGE = 200
const PAGES_MAX = 200

/** GLPI rend les valeurs sous la clé numérique du champ, parfois en tableau. */
function valeur(ligne: Record<string, unknown>, id?: number): string | null {
    if (!id) return null
    const v = ligne[String(id)]
    if (Array.isArray(v)) return v.length ? String(v[0]).trim() || null : null
    return v === null || v === undefined || v === '' ? null : String(v).trim()
}

/** « Établissement > DSI > Proximité » → « Proximité ». Le nom seul pour l'affichage courant. */
const feuille = (complet: string | null): string | null =>
    complet ? complet.split('>').pop()!.trim() || complet : null

export type BilanGlpi = { vues: number, ecrites: number, disparues: number }

export async function synchroniserGlpi(): Promise<BilanGlpi> {
    const vide: BilanGlpi = { vues: 0, ecrites: 0, disparues: 0 }
    const cfg = await lireConfigGlpi()
    if (!cfg) return vide

    const [verrou] = (await db.execute(sql`SELECT pg_try_advisory_lock(${VERROU}) AS obtenu`)).rows as { obtenu: boolean }[]
    if (!verrou?.obtenu) return vide

    try {
        const c = await champs(cfg)
        const aAfficher = [CHAMPS_FIXES.ID, CHAMPS_FIXES.NOM, c.groupe, c.entite, c.lieu, c.type, c.os, c.serie]
            .filter((x): x is number => typeof x === 'number')
        const forced = aAfficher.map((f, i) => `forcedisplay[${i}]=${f}`).join('&')
        const critique = cfg.groupeCritique.trim().toLowerCase()
        const debutSync = new Date()
        const bilan = { ...vide }

        for (let page = 0; page < PAGES_MAX; page++) {
            const debut = page * TAILLE_PAGE
            const r = await appeler(cfg, `/search/Computer?${forced}&range=${debut}-${debut + TAILLE_PAGE - 1}&order=ASC`)
            if (!r.ok && r.status !== 206) throw new Error(`GLPI recherche ${r.status} : ${(await r.text()).slice(0, 200)}`)

            const lot = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? []
            if (!lot.length) break

            for (const ligne of lot) {
                const glpiId = valeur(ligne, CHAMPS_FIXES.ID)
                const nom = valeur(ligne, CHAMPS_FIXES.NOM)
                if (!glpiId || !nom) continue
                bilan.vues++

                const groupeComplet = valeur(ligne, c.groupe)
                const entiteComplet = valeur(ligne, c.entite)
                const lieuComplet = valeur(ligne, c.lieu)
                const valeurs = {
                    nom,
                    entite: feuille(entiteComplet), entiteComplet,
                    lieu: feuille(lieuComplet), lieuComplet,
                    groupe: feuille(groupeComplet), groupeComplet,
                    type: valeur(ligne, c.type),
                    os: valeur(ligne, c.os),
                    numeroSerie: valeur(ligne, c.serie),
                    // Sur le nom COMPLET : un groupe critique peut être un sous-groupe.
                    critique: Boolean(critique && groupeComplet && groupeComplet.toLowerCase().includes(critique)),
                    presente: true,
                    synchroniseLe: debutSync,
                }

                await db.insert(glpiSchema.glpiMachine).values({ glpiId, ...valeurs })
                    .onConflictDoUpdate({ target: glpiSchema.glpiMachine.glpiId, set: valeurs })
                bilan.ecrites++
            }
            if (lot.length < TAILLE_PAGE) break
        }

        // Non revenues : marquées absentes, jamais supprimées — un incident peut les citer.
        const disparues = await db.update(glpiSchema.glpiMachine)
            .set({ presente: false })
            .where(and(eq(glpiSchema.glpiMachine.presente, true), lt(glpiSchema.glpiMachine.synchroniseLe, debutSync)))
            .returning({ id: glpiSchema.glpiMachine.glpiId })
        bilan.disparues = disparues.length

        await noterSucces('glpi', `${bilan.ecrites} machine(s), ${bilan.disparues} disparue(s)`)
        console.log(`✅ GLPI : ${bilan.ecrites} machine(s) à jour, ${bilan.disparues} disparue(s) de l'inventaire.`)
        return bilan
    }
    catch (e) {
        await noterEchec('glpi', e)
        throw e
    }
    finally {
        await db.execute(sql`SELECT pg_advisory_unlock(${VERROU})`)
    }
}

export function demarrerSyncGlpi(): void {
    synchroniserGlpi().catch(e => console.error('❌ GLPI (démarrage) :', e))
    const minuteur = setInterval(() => {
        synchroniserGlpi().catch(e => console.error('❌ GLPI (périodique) :', e))
    }, INTERVALLE_MS)
    ;(minuteur as unknown as { unref?: () => void }).unref?.()
}

// --- Recherche locale --------------------------------------------------------------------

export type MachineTrouvee = {
    glpiId: string, nom: string, groupe: string | null, entite: string | null,
    lieu: string | null, type: string | null, os: string | null,
    critique: boolean, presente: boolean, url: string | null
}

/**
 * Cherche dans la copie locale, jamais dans GLPI : instantané, et disponible même quand
 * GLPI ne l'est pas — c'est-à-dire au pire moment, celui où l'on saisit un incident.
 */
export async function chercherMachines(texte: string, limite = 12): Promise<MachineTrouvee[]> {
    const q = texte.trim()
    if (q.length < 2) return []

    const cfg = await lireConfigGlpi()
    const motif = `%${q.replace(/[%_]/g, m => `\\${m}`)}%`

    const lignes = await db.select().from(glpiSchema.glpiMachine)
        .where(ilike(glpiSchema.glpiMachine.nom, motif))
        // Présentes d'abord, puis celles dont le nom COMMENCE par la recherche. Trier par
        // « critique » remontait les 793 critiques en tête et, sous la limite, masquait
        // toutes les autres — on ne trouvait plus que des machines critiques.
        .orderBy(
            desc(glpiSchema.glpiMachine.presente),
            sql`(lower(${glpiSchema.glpiMachine.nom}) LIKE ${q.toLowerCase() + '%'}) DESC`,
            asc(glpiSchema.glpiMachine.nom),
        )
        .limit(limite)

    return lignes.map(m => ({
        glpiId: m.glpiId,
        nom: m.nom,
        groupe: m.groupeComplet ?? m.groupe,
        entite: m.entiteComplet ?? m.entite,
        lieu: m.lieuComplet ?? m.lieu,
        type: m.type,
        os: m.os,
        critique: m.critique,
        presente: m.presente,
        url: cfg ? `${cfg.url}/front/computer.form.php?id=${m.glpiId}` : null,
    }))
}

/**
 * Apparie un nom venu d'une source externe avec l'inventaire.
 *
 * EXACT uniquement, casse ignorée, et sur le nom court en second recours (« srv02 » pour
 * « srv02.exemple.fr »). Aucune correspondance approchante : rattacher un incident à la
 * mauvaise machine est pire que ne rien rattacher, et une distance d'édition confond srv01 et
 * srv02. Une ambiguïté — deux machines pour le même nom court — ne se tranche pas non plus.
 */
export async function apparierMachine(nom: string): Promise<string | null> {
    const n = nom.trim().toLowerCase()
    if (!n) return null

    // GLPI accumule des entrées périmées : 219 doublons de nom constatés sur 8 859
    // machines. Refuser toute ambiguïté ferait donc échouer des rattachements légitimes.
    // Parmi des homonymes, on retient celui qui est ENCORE À L'INVENTAIRE — les autres
    // sont des reliquats. Si plusieurs le sont, on n'arbitre pas.
    const exact = await db.select({ glpiId: glpiSchema.glpiMachine.glpiId, presente: glpiSchema.glpiMachine.presente })
        .from(glpiSchema.glpiMachine)
        .where(sql`lower(${glpiSchema.glpiMachine.nom}) = ${n}`)
        .limit(10)
    const retenu = (lignes: { glpiId: string, presente: boolean }[]) => {
        if (lignes.length === 1) return lignes[0]!.glpiId
        const vivantes = lignes.filter(l => l.presente)
        return vivantes.length === 1 ? vivantes[0]!.glpiId : null
    }
    if (exact.length) return retenu(exact)

    // Second recours : le nom court des deux côtés — « srv02 » et « srv02.exemple.fr »
    // désignent la même machine, et les sources ne s'accordent pas sur le domaine.
    const court = n.split('.')[0]!
    const parCourt = await db.select({ glpiId: glpiSchema.glpiMachine.glpiId, presente: glpiSchema.glpiMachine.presente })
        .from(glpiSchema.glpiMachine)
        .where(sql`lower(split_part(${glpiSchema.glpiMachine.nom}, '.', 1)) = ${court}`)
        .limit(10)
    return retenu(parCourt)
}

/**
 * Relève les machines de l'inventaire citées dans un texte libre : une source décrit souvent
 * la machine dans son rapport sans la déclarer en actif.
 *
 * On ne cherche QUE des noms connus de l'inventaire — jamais un motif de nom d'hôte, qui
 * ramasserait des domaines d'attaquant et des chemins de fichiers. Deux garde-fous : une
 * longueur minimale, et une correspondance délimitée pour que « srv02 » ne soit pas trouvé
 * dans « srv020 ». Le point est interdit AVANT le nom — sinon « corp » serait trouvé dans le
 * domaine « cb2.corp.top » — mais autorisé APRÈS, le rapport citant souvent le nom qualifié.
 */
const LONGUEUR_MIN_NOM = 6

/**
 * Un nom d'inventaire fait aussi parfois un mot courant — « action », « bureau » — et un
 * rapport les emploie tous : cherché tel quel, « action » ressort de « Action EDR : Détectée ».
 *
 * On n'accepte donc que ce qui ressemble à un IDENTIFIANT : un chiffre, un tiret ou un point.
 * Un nom de lettres seules reste apparié quand la source déclare l'actif, sans ambiguïté.
 */
const RESSEMBLE_A_UN_IDENTIFIANT = /[0-9._-]/

export async function apparierDansTexte(texte: string, limite = 10): Promise<{ nom: string, glpiId: string }[]> {
    const t = texte.trim()
    if (t.length < LONGUEUR_MIN_NOM) return []

    // Filtrage grossier en SQL, avec `position` et non une expression rationnelle : le nom
    // vient de la base et devrait sinon être échappé côté SQL, ce qui est fragile. La
    // précision est faite juste après, en mémoire, sur un lot déjà réduit.
    const candidats = await db.select({ glpiId: glpiSchema.glpiMachine.glpiId, nom: glpiSchema.glpiMachine.nom })
        .from(glpiSchema.glpiMachine)
        .where(sql`length(${glpiSchema.glpiMachine.nom}) >= ${LONGUEUR_MIN_NOM}
            AND position(lower(${glpiSchema.glpiMachine.nom}) in lower(${t})) > 0`)
        .orderBy(desc(glpiSchema.glpiMachine.presente))
        .limit(200)

    const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

    return candidats
        // Délimitation : « srv02 » ne doit pas ressortir de « srv020 ». Le point est
        // interdit AVANT — sinon « makisecorp » sortirait de « cb2.makisecorp.top » — mais
        // autorisé APRÈS, le rapport citant souvent le nom pleinement qualifié.
        .filter(c => RESSEMBLE_A_UN_IDENTIFIANT.test(c.nom))
        .filter(c => new RegExp(`(^|[^A-Za-z0-9_.-])${echappe(c.nom)}([^A-Za-z0-9_-]|$)`, 'i').test(t))
        .slice(0, limite)
}

export async function testerGlpi(cfg: ConfigGlpi): Promise<
    { ok: true, groupes: string[], champsGroupe: ChampGroupe[], champGroupeRetenu: number | null }
    | { ok: false, message: string }
> {
    try {
        session = null
        champsDecouverts = null
        await jetonSession(cfg)
        const c = await champs(cfg)
        // La liste des groupes évite de saisir « groupe critique » au libellé approximatif.
        const r = await appeler(cfg, '/Group?range=0-99')
        const groupes = r.ok || r.status === 206
            ? (await r.json() as { completename?: string, name?: string }[])
                .map(g => g.completename ?? g.name ?? '').filter(Boolean)
            : []
        if (!c.groupe) console.warn('⚠️ GLPI : champ « groupe » introuvable dans les options de recherche.')
        return { ok: true, groupes, champsGroupe: await champsGroupe(cfg), champGroupeRetenu: c.groupe ?? null }
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
}
