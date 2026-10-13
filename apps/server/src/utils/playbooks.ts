import { db } from "@slowpoke/database";
import { settingsSchema, playbooksSchema, enquetesSchema } from "@slowpoke/database/tables";
import { appelerExterne } from "@slowpoke/connecteurs/sortie";
import { eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { dechiffrer } from "@slowpoke/connecteurs/secrets";
import { noterSucces, noterEchec } from "@slowpoke/connecteurs/synchro";

// PROCÉDURES — synchronisation depuis le dépôt de documentation.
//
// Les fiches et checklists vivent dans Git et y restent : Slowpoke en est lecteur, pas éditeur.
// La copie locale sert à consulter sans dépendre du réseau au moment où l'on ouvre un
// incident, et à savoir quelle VERSION d'une procédure était en vigueur ce jour-là.

const INTERVALLE_MS = 6 * 60 * 60 * 1000

// Identifiant du verrou consultatif, distinct de la surveillance (4837201) et de
// l'import SOC (4837202).
const VERROU = 4837203

/** Défaut si le réglage est vide. Le reste d'un dépôt de doc ne sert pas ici. */
const DOSSIERS_DEFAUT = ['incidents', 'annexes']

/** La case à cocher du corpus : U+2610 BALLOT BOX. */
const CASE = '☐'

export const CLE_GITLAB_URL = 'gitlab.base_url'
export const CLE_GITLAB_PROJET = 'gitlab.project'
export const CLE_GITLAB_JETON = 'gitlab.token'
export const CLE_GITLAB_REF = 'gitlab.ref'
export const CLE_GITLAB_DOSSIERS = 'gitlab.dossiers'

export type ConfigGitLab = { base: string, projet: string, jeton: string, ref: string, dossiers: string[] }

export async function lireConfigGitLab(): Promise<ConfigGitLab | null> {
    const lignes = await db.select().from(settingsSchema.appSetting)
        .where(inArray(settingsSchema.appSetting.key, [CLE_GITLAB_URL, CLE_GITLAB_PROJET, CLE_GITLAB_JETON, CLE_GITLAB_REF, CLE_GITLAB_DOSSIERS]))
    const v = Object.fromEntries(lignes.map(l => [l.key, l.value?.trim() ?? '']))
    const base = v[CLE_GITLAB_URL]?.replace(/\/+$/, '')
    const projet = v[CLE_GITLAB_PROJET]
    const jeton = dechiffrer(v[CLE_GITLAB_JETON])
    if (!base || !projet || !jeton) return null
    const dossiers = (v[CLE_GITLAB_DOSSIERS] ?? '').split(',').map(d => d.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean)
    return {
        base, projet, jeton,
        ref: v[CLE_GITLAB_REF] || 'main',
        dossiers: dossiers.length ? dossiers : DOSSIERS_DEFAUT,
    }
}

// ---------------------------------------------------------------------------------------
// Lecture du dépôt.
// ---------------------------------------------------------------------------------------

async function appelerGitLab<T>(cfg: ConfigGitLab, chemin: string, brut = false): Promise<T> {
    const projet = encodeURIComponent(cfg.projet)
    const r = await appelerExterne('gitlab', `${cfg.base}/api/v4/projects/${projet}/${chemin}`, {
        headers: { 'PRIVATE-TOKEN': cfg.jeton },
        signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) throw new Error(`GitLab ${r.status} sur ${chemin} : ${(await r.text()).slice(0, 200)}`)
    return (brut ? await r.text() : await r.json()) as T
}

type EntreeArbre = { name: string, path: string, type: string }

async function listerFichiers(cfg: ConfigGitLab, dossier: string): Promise<EntreeArbre[]> {
    const entrees = await appelerGitLab<EntreeArbre[]>(
        cfg, `repository/tree?ref=${encodeURIComponent(cfg.ref)}&path=${encodeURIComponent(dossier)}&per_page=100`,
    )
    return entrees.filter(e => e.type === 'blob' && e.name.endsWith('.md'))
}

function lireFichier(cfg: ConfigGitLab, chemin: string): Promise<string> {
    return appelerGitLab<string>(
        cfg, `repository/files/${encodeURIComponent(chemin)}/raw?ref=${encodeURIComponent(cfg.ref)}`, true,
    )
}

// ---------------------------------------------------------------------------------------
// Analyse d'une fiche.
// ---------------------------------------------------------------------------------------

export type EnTete = Record<string, string | string[]>

/**
 * En-tête YAML d'une fiche. Volontairement minimal : les en-têtes du dépôt n'emploient que
 * des chaînes et des listes courtes (`niveau_p: [P1, P2]`). Porter un analyseur YAML complet
 * pour cela serait une dépendance de plus pour six lignes d'un format connu.
 */
export function analyserEnTete(source: string): { entete: EnTete, corps: string } {
    const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!m) return { entete: {}, corps: source.trim() }

    const entete: EnTete = {}
    for (const ligne of m[1]!.split(/\r?\n/)) {
        const paire = ligne.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
        if (!paire) continue
        const v = paire[2]!.trim()
        entete[paire[1]!] = v.startsWith('[') && v.endsWith(']')
            ? v.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean)
            : v
    }
    return { entete, corps: (m[2] ?? '').trim() }
}

const texte = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' ? (v || null) : null

const liste = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : []

export type CaseChecklist = { cle: string, texte: string, section: string }

/** Cases d'une checklist, avec la section qui les porte. La clé est l'empreinte du TEXTE, pas
 *  le rang : une case insérée plus haut ne décale pas l'état des autres. Une case dont le texte
 *  change perd son état — elle ne dit plus la même chose, et la cocher à nouveau est un acte. */
export function analyserCases(corps: string): CaseChecklist[] {
    const cases: CaseChecklist[] = []
    const motif = new RegExp(`^\\s*${CASE}\\s*(.+)$`)
    let section = ''
    const vues = new Set<string>()

    for (const ligne of corps.split(/\r?\n/)) {
        const titre = ligne.match(/^#{2,3}\s+(.*)$/)
        if (titre) { section = titre[1]!.trim(); continue }

        const item = ligne.match(motif)
        if (!item) continue

        const t = item[1]!.trim()
        let cle = createHash('sha256').update(t).digest('hex').slice(0, 16)
        // Deux cases au libellé identique dans deux sections : on désambiguïse, sinon
        // cocher l'une cocherait l'autre.
        if (vues.has(cle)) cle = createHash('sha256').update(`${section} ${t}`).digest('hex').slice(0, 16)
        vues.add(cle)

        cases.push({ cle, texte: t, section })
    }
    return cases
}

const listeCrochets = (v?: string): string[] =>
    (v ?? '').trim().replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean)

export type BlocEnquete = { requete: string, parametres: string[], verdicts: string[], siTrouve: string | null }
export type EtapeBloc = { cle: string, caseCle: string, bloc: BlocEnquete }

/**
 * Blocs ```enquete d'une checklist, rattachés à la case qu'ils outillent.
 *
 * Le bloc suit immédiatement sa case ou un autre bloc de la même case, lignes vides admises ;
 * séparé de sa case par du texte, il est ignoré plutôt que rattaché au jugé. Une étape est
 * identifiée par sa case ET sa requête : ajouter une source ne déplace pas les verdicts rendus.
 */
export function analyserEnquetes(corps: string): EtapeBloc[] {
    const etapes: EtapeBloc[] = []
    const vues = new Set<string>()
    const cases = analyserCases(corps)
    const motif = new RegExp(`^\\s*${CASE}\\s*(.+)$`)
    const lignes = corps.split(/\r?\n/)
    let rang = -1
    let caseCourante: string | null = null

    for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i]!
        if (/^#{2,3}\s+/.test(ligne)) { caseCourante = null; continue }
        if (motif.test(ligne)) { rang++; caseCourante = cases[rang]?.cle ?? null; continue }
        if (ligne.trim() !== '```enquete') {
            if (ligne.trim()) caseCourante = null
            continue
        }

        const champs: Record<string, string> = {}
        let j = i + 1
        for (; j < lignes.length && lignes[j]!.trim() !== '```'; j++) {
            const m = lignes[j]!.trim().match(/^([a-z_]+):\s*(.*)$/)
            if (m) champs[m[1]!] = m[2]!.trim()
        }
        i = j
        if (!caseCourante || !champs.requete) continue
        const cle = `${caseCourante}.${champs.requete}`
        // La même requête deux fois sous une case : la première compte.
        if (vues.has(cle)) continue
        vues.add(cle)
        etapes.push({
            cle,
            caseCle: caseCourante,
            bloc: {
                requete: champs.requete,
                parametres: listeCrochets(champs.parametres),
                verdicts: listeCrochets(champs.verdict),
                siTrouve: champs.si_trouve || null,
            },
        })
    }
    return etapes
}

// ---------------------------------------------------------------------------------------
// Bibliothèque des requêtes d'enquête.
// ---------------------------------------------------------------------------------------

/** À la racine du dépôt de procédures, à côté des dossiers de fiches. */
export const DOSSIER_REQUETES = '_requetes'
const SOURCES_REQUETE = new Set(['slowpoke', 'ldap', 'glpi', 'harfanglab', 'wazuh', 'guidee'])

/** YAML minimal des requêtes : clés plates, listes [a, b] et blocs `|`. Même format que le contrôle du dépôt. */
export function lireYamlSimple(texte: string): Record<string, string> {
    const d: Record<string, string> = {}
    let cleBloc: string | null = null
    let bloc: string[] = []
    const fermer = () => {
        if (cleBloc !== null) d[cleBloc] = bloc.join('\n').trim()
        cleBloc = null
        bloc = []
    }
    for (const ligne of texte.split(/\r?\n/)) {
        if (cleBloc !== null) {
            if (ligne.startsWith('  ') || !ligne.trim()) {
                bloc.push(ligne.startsWith('  ') ? ligne.slice(2) : '')
                continue
            }
            fermer()
        }
        if (!ligne.trim() || ligne.trimStart().startsWith('#')) continue
        const m = ligne.match(/^([a-z_]+):\s*(.*)$/)
        if (!m) continue
        if (m[2]!.trim() === '|') { cleBloc = m[1]!; bloc = [] }
        else d[m[1]!] = m[2]!.trim()
    }
    fermer()
    return d
}

type FichierGitLab = { content: string, encoding: string, last_commit_id: string }

/** Recopie `_requetes/*.yml`, lue par l'API des fichiers et non en brut : c'est elle qui rend
 *  `last_commit_id`, la version exacte à inscrire dans chaque étape lancée. Une requête non
 *  conforme est ignorée avec un avertissement, plutôt qu'exécutée. */
async function synchroniserRequetes(cfg: ConfigGitLab): Promise<{ ecrites: number, ignorees: number }> {
    let entrees: EntreeArbre[]
    try {
        entrees = await appelerGitLab<EntreeArbre[]>(
            cfg, `repository/tree?ref=${encodeURIComponent(cfg.ref)}&path=${encodeURIComponent(DOSSIER_REQUETES)}&per_page=100`,
        )
    }
    catch (e) {
        // Pas encore de bibliothèque dans le dépôt : ce n'est pas une panne de synchronisation.
        console.warn(`⚠️ Enquêtes : dossier ${DOSSIER_REQUETES}/ illisible —`, e instanceof Error ? e.message : e)
        return { ecrites: 0, ignorees: 0 }
    }

    let ecrites = 0
    let ignorees = 0
    for (const f of entrees.filter(e => e.type === 'blob' && e.name.endsWith('.yml'))) {
        try {
            const fichier = await appelerGitLab<FichierGitLab>(
                cfg, `repository/files/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(cfg.ref)}`,
            )
            const source = Buffer.from(fichier.content, fichier.encoding === 'base64' ? 'base64' : 'utf-8').toString('utf-8')
            const d = lireYamlSimple(source)
            if (!d.id || `${d.id}.yml` !== f.name || !SOURCES_REQUETE.has(d.source ?? '') || d.lecture_seule !== 'true' || !d.titre) {
                console.warn(`⚠️ Enquêtes : ${f.path} ignorée (id, titre, source ou lecture_seule non conformes).`)
                ignorees++
                continue
            }
            const valeurs = {
                chemin: f.path,
                titre: d.titre,
                source: d.source!,
                parametres: listeCrochets(d.parametres),
                pourquoi: d.pourquoi || null,
                lireLeResultat: d.lire_le_resultat || null,
                commande: d.commande || null,
                commit: fichier.last_commit_id || null,
                empreinte: createHash('sha256').update(source).digest('hex'),
                synchroniseLe: new Date(),
            }
            await db.insert(enquetesSchema.enqueteRequete)
                .values({ id: d.id, ...valeurs })
                .onConflictDoUpdate({ target: enquetesSchema.enqueteRequete.id, set: valeurs })
            ecrites++
        }
        catch (e) {
            ignorees++
            console.error(`❌ Enquêtes : ${f.path} non reprise :`, e)
        }
    }
    return { ecrites, ignorees }
}

// ---------------------------------------------------------------------------------------
// Synchronisation.
// ---------------------------------------------------------------------------------------

export type BilanSync = { vues: number, ecrites: number, inchangees: number, echecs: number }

export async function synchroniserPlaybooks(): Promise<BilanSync> {
    const vide: BilanSync = { vues: 0, ecrites: 0, inchangees: 0, echecs: 0 }
    const cfg = await lireConfigGitLab()
    if (!cfg) return vide

    const [verrou] = (await db.execute(sql`SELECT pg_try_advisory_lock(${VERROU}) AS obtenu`)).rows as { obtenu: boolean }[]
    if (!verrou?.obtenu) return vide

    try {
        const bilan = { ...vide }
        for (const dossier of cfg.dossiers) {
            const fichiers = await listerFichiers(cfg, dossier)
            for (const f of fichiers) {
                bilan.vues++
                // Chaque fiche est isolée : une seule illisible ne doit pas priver la
                // cellule de toutes les autres.
                try {
                    const source = await lireFichier(cfg, f.path)
                    const { entete, corps } = analyserEnTete(source)
                    const reference = texte(entete.reference)
                    if (!reference) {
                        console.warn(`⚠️ Procédures : ${f.path} sans référence en en-tête, ignorée.`)
                        continue
                    }

                    const empreinte = createHash('sha256').update(corps).digest('hex')
                    const [existant] = await db.select({ empreinte: playbooksSchema.playbook.empreinte })
                        .from(playbooksSchema.playbook)
                        .where(eq(playbooksSchema.playbook.reference, reference)).limit(1)

                    // Rien n'a bougé : ne pas réécrire, sinon `synchronise_le` cesserait de
                    // dire quand la procédure a changé pour dire quand on l'a relue.
                    if (existant?.empreinte === empreinte) { bilan.inchangees++; continue }

                    const revision = texte(entete.date_revision)
                    const valeurs = {
                        chemin: f.path,
                        titre: texte(entete.titre) ?? f.name,
                        version: texte(entete.version),
                        statut: texte(entete.statut),
                        niveaux: liste(entete.niveau_p),
                        corps,
                        empreinte,
                        dateRevision: revision ? new Date(revision) : null,
                        synchroniseLe: new Date(),
                    }

                    await db.insert(playbooksSchema.playbook)
                        .values({ reference, ...valeurs })
                        .onConflictDoUpdate({ target: playbooksSchema.playbook.reference, set: valeurs })
                    bilan.ecrites++
                }
                catch (e) {
                    bilan.echecs++
                    console.error(`❌ Procédures : ${f.path} non reprise :`, e)
                }
            }
        }

        const requetes = await synchroniserRequetes(cfg)
        await noterSucces('playbooks', `${bilan.ecrites} mise(s) à jour, ${bilan.inchangees} inchangée(s), ${requetes.ecrites} requête(s) d'enquête`)

        if (bilan.ecrites || bilan.echecs) {
            console.log(`✅ Procédures : ${bilan.ecrites} mise(s) à jour, ${bilan.inchangees} inchangée(s), ${bilan.echecs} en échec, sur ${bilan.vues} vue(s).`)
        }
        return bilan
    }
    catch (e) {
        await noterEchec('playbooks', e)
        throw e
    }
    finally {
        await db.execute(sql`SELECT pg_advisory_unlock(${VERROU})`)
    }
}

/** Démarre la synchronisation périodique. Appelée une fois au démarrage du serveur. */
export function demarrerSyncPlaybooks(): void {
    // Le minuteur tourne même sans configuration : elle se pose depuis l'interface, à chaud.
    synchroniserPlaybooks().catch(e => console.error('❌ Procédures (démarrage) :', e))

    const minuteur = setInterval(() => {
        synchroniserPlaybooks().catch(e => console.error('❌ Procédures (périodique) :', e))
    }, INTERVALLE_MS)

    ;(minuteur as unknown as { unref?: () => void }).unref?.()
}
