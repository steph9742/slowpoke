import { checkServerIdentity, type PeerCertificate } from 'node:tls'
import { db } from '@slowpoke/database'
import { settingsSchema } from '@slowpoke/database/tables'
import { inArray } from 'drizzle-orm'
import { dechiffrer } from './secrets'
import { appelerExterne } from './sortie'

// JOURNAUX D'AUTHENTIFICATION — lus dans les archives de Wazuh, en lecture seule.
//
// Le puits de logs remonte dans Wazuh, et l'index des archives garde chaque ligne, décodée
// ou non. Slowpoke y cherche un compte sur une période et reconnaît lui-même trois sources :
// Zimbra (audit.log), OpenLDAP (slapd) et LemonLDAP::NG. La recherche est construite ici,
// jamais reçue : aucune requête libre ne traverse ce module.

export const CLE_WAZUH_URL = 'wazuh.url'
export const CLE_WAZUH_UTILISATEUR = 'wazuh.utilisateur'
export const CLE_WAZUH_MOT_DE_PASSE = 'wazuh.mot_de_passe'
export const CLE_WAZUH_INDEX = 'wazuh.index'
export const CLE_WAZUH_CA = 'wazuh.ca'
export const CLE_WAZUH_ACCES = 'wazuh.acces'
export const CLE_WAZUH_NOM_CERTIFICAT = 'wazuh.nom_certificat'
export const CLES_WAZUH = [CLE_WAZUH_URL, CLE_WAZUH_UTILISATEUR, CLE_WAZUH_MOT_DE_PASSE, CLE_WAZUH_INDEX, CLE_WAZUH_CA, CLE_WAZUH_ACCES, CLE_WAZUH_NOM_CERTIFICAT]

/**
 * `indexeur` : l'API de l'indexeur, port 9200. `tableau_de_bord` : le relais de la console du
 * tableau de bord, quand lui seul est joignable ; il transmet la requête à l'indexeur avec les
 * identifiants du compte, donc avec le même rôle et les mêmes limites.
 */
export type AccesWazuh = 'indexeur' | 'tableau_de_bord'

export const INDEX_WAZUH_DEFAUT = 'wazuh-archives-*'
/** Lignes lues au plus par recherche. Au-delà, le résultat le dit. */
export const PLAFOND_WAZUH = 1000
/** Liaisons LDAP dont on va chercher le résultat. Les suivantes restent « indéterminé ». */
const PLAFOND_LIAISONS = 200

export type ConfigWazuh = {
    url: string
    utilisateur: string
    motDePasse: string
    index: string
    ca: string | null
    acces: AccesWazuh
    /** Nom ou IP que doit porter le certificat, quand l'adresse jointe est une adresse traduite. */
    nomCertificat: string | null
}

/** Une adresse en clair ferait circuler le mot de passe du compte de lecture. */
export function connexionChiffreeWazuh(cfg: { url: string }): boolean {
    return cfg.url.trim().toLowerCase().startsWith('https://')
}

/** Un seul motif d'index, sans virgule ni index système : le compte ne doit rien viser d'autre. */
export function indexValide(index: string): boolean {
    return /^[a-z0-9][a-z0-9._-]*\*?$/.test(index)
}

export function certificatValide(pem: string): boolean {
    return /^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(pem.trim())
}

export function nomCertificatValide(nom: string): boolean {
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(nom) || /^[0-9a-f:]+:[0-9a-f:]*$/i.test(nom)
}

export async function lireConfigWazuh(): Promise<ConfigWazuh | null> {
    const lignes = await db.select().from(settingsSchema.appSetting)
        .where(inArray(settingsSchema.appSetting.key, CLES_WAZUH))
    const v = Object.fromEntries(lignes.map(l => [l.key, l.value ?? '']))
    const url = v[CLE_WAZUH_URL]?.trim()
    const utilisateur = v[CLE_WAZUH_UTILISATEUR]?.trim()
    // Le mot de passe n'est pas rogné : une espace peut en faire partie.
    const motDePasse = dechiffrer(v[CLE_WAZUH_MOT_DE_PASSE])
    const index = v[CLE_WAZUH_INDEX]?.trim() || INDEX_WAZUH_DEFAUT
    const nomCertificat = v[CLE_WAZUH_NOM_CERTIFICAT]?.trim() || null
    if (!url || !utilisateur || !motDePasse || !indexValide(index)) return null
    if (nomCertificat && !nomCertificatValide(nomCertificat)) return null
    return {
        url, utilisateur, motDePasse, index, nomCertificat,
        ca: v[CLE_WAZUH_CA]?.trim() || null,
        acces: v[CLE_WAZUH_ACCES] === 'tableau_de_bord' ? 'tableau_de_bord' : 'indexeur',
    }
}

type SourceIndexee = { timestamp?: string, full_log?: string, location?: string, predecoder?: { hostname?: string } }
type Agregat = { value: number | null, value_as_string?: string }
type ReponseRecherche = {
    _shards?: { total: number }
    hits: { total?: { value: number }, hits: { _source?: SourceIndexee }[] }
    aggregations?: { premier?: Agregat, dernier?: Agregat, tout?: { premier?: Agregat, dernier?: Agregat } }
}

async function appeler<T>(cfg: ConfigWazuh, chemin: string, corps?: unknown): Promise<T> {
    if (!connexionChiffreeWazuh(cfg)) {
        throw new Error("Connexion non chiffrée refusée : l'adresse doit commencer par https://.")
    }
    const base = cfg.url.trim().replace(/\/+$/, '')
    const methode = corps === undefined ? 'GET' : 'POST'
    const relais = cfg.acces === 'tableau_de_bord'
    const cible = relais ? 'Le tableau de bord' : "L'indexeur"
    const tls = {
        // Certificat signé par une autorité interne : on la fournit plutôt que de couper la vérification.
        ...(cfg.ca ? { ca: cfg.ca } : {}),
        // Adresse traduite : le certificat est vérifié contre le nom attendu, pas contre l'adresse jointe.
        ...(cfg.nomCertificat
            ? { checkServerIdentity: (_hote: string, cert: PeerCertificate) => checkServerIdentity(cfg.nomCertificat!, cert) }
            : {}),
    }

    const r = await appelerExterne('wazuh', relais ? `${base}/api/console/proxy?path=${encodeURIComponent(`/${chemin}`)}&method=${methode}` : `${base}/${chemin}`, {
        method: relais ? 'POST' : methode,
        headers: {
            'authorization': `Basic ${Buffer.from(`${cfg.utilisateur}:${cfg.motDePasse}`).toString('base64')}`,
            ...(corps === undefined ? {} : { 'content-type': 'application/json' }),
            ...(relais ? { 'osd-xsrf': 'true' } : {}),
        },
        body: corps === undefined ? undefined : JSON.stringify(corps),
        signal: AbortSignal.timeout(30_000),
        // Une redirection mène à la page de connexion : c'est un refus, pas une réponse.
        redirect: 'manual',
        ...(Object.keys(tls).length ? { tls } : {}),
    })
    if (r.status >= 300 && r.status < 400) {
        throw new Error(`${cible} a répondu par une redirection (${r.status}) : authentification refusée, ou adresse qui ne mène pas à l'API.`)
    }
    if (!r.ok) {
        const corpsErreur = await r.json().catch(() => null) as { error?: string | { reason?: string }, message?: string } | null
        const raison = typeof corpsErreur?.error === 'string'
            ? corpsErreur.message ?? corpsErreur.error
            : corpsErreur?.error?.reason ?? corpsErreur?.message
        throw new Error(`${cible} a répondu ${r.status}${raison ? ` : ${raison.slice(0, 200)}` : ''}`)
    }
    try {
        return await r.json() as T
    }
    catch {
        throw new Error(`${cible} a renvoyé autre chose que du JSON : l'adresse ou le mode d'accès ne sont sans doute pas les bons.`)
    }
}

/** « 2026-09-14T10:11:12.345+0000 » : le décalage sans deux-points n'est pas lu partout. */
export function dateIndexee(v: string | undefined | null): string | null {
    if (!v) return null
    const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const dateAgregat = (a?: Agregat): string | null =>
    a?.value === null || a?.value === undefined ? null : new Date(a.value).toISOString()

// ---------------------------------------------------------------------------------------
// Lecture des lignes.
// ---------------------------------------------------------------------------------------

export type SourceJournal = 'zimbra' | 'lemonldap' | 'ldap'
export type Issue = 'succes' | 'echec' | 'compte_inconnu' | 'mot_de_passe' | 'indetermine'
export type Evenement = {
    source: SourceJournal
    compte: string
    issue: Issue
    ip: string | null
    protocole: string | null
    le: string
    hote: string | null
}
type Lu = Pick<Evenement, 'source' | 'compte' | 'issue' | 'ip' | 'protocole'>

const adresseIp = (v: string | undefined): string | null =>
    v && /^[0-9a-f.:]+$/i.test(v) && /[.:]/.test(v) ? v : null

const CMD_AUTH = new Set(['Auth', 'AuthRequest', 'PreAuth'])
const CMD_MDP = new Set(['ChangePassword', 'SetPassword'])

/** audit.log de Zimbra. L'adresse du client est `oip` quand un proxy est devant, `ip` sinon. */
export function lireZimbra(ligne: string, identifiants: Set<string>): Lu | null {
    const cmd = ligne.match(/\bsecurity - cmd=(\w+);/)?.[1]
    if (!cmd || (!CMD_AUTH.has(cmd) && !CMD_MDP.has(cmd))) return null
    const compte = ligne.match(/\baccount=([^;\s]+);/)?.[1]?.toLowerCase()
    if (!compte || !identifiants.has(compte)) return null
    const erreur = ligne.match(/\berror=([^;]*);/)?.[1]
    const issue: Issue = erreur
        ? (/account not found|no such account/i.test(erreur) ? 'compte_inconnu' : 'echec')
        : CMD_AUTH.has(cmd) ? 'succes' : 'mot_de_passe'
    const ip = adresseIp(ligne.match(/\boip=([^;\]\s,]+)/)?.[1]) ?? adresseIp(ligne.match(/[[;]ip=([^;\]\s,]+)/)?.[1])
    return { source: 'zimbra', compte, issue, ip, protocole: ligne.match(/\bprotocol=([^;\s]+);/)?.[1] ?? cmd }
}

/** Journal des usagers de LemonLDAP::NG : l'adresse du client finit le message, entre parenthèses. */
export function lireLemonldap(ligne: string, identifiants: Set<string>): Lu | null {
    const motifs: [RegExp, Issue][] = [
        [/\bUser (\S+) connected from .+? \(([^)]+)\)/, 'succes'],
        [/\bUser (\S+) successfully authenticated at level \d+/, 'succes'],
        [/\bBad password for (\S+)(?: \(([^)]+)\))?/, 'echec'],
        [/(?:^|\s)(\S+) was not found in .+?(?: \(([^)]+)\))?\s*$/, 'compte_inconnu'],
    ]
    for (const [motif, issue] of motifs) {
        const m = ligne.match(motif)
        if (!m) continue
        const compte = m[1]!.toLowerCase()
        if (!identifiants.has(compte)) return null
        return { source: 'lemonldap', compte, issue, ip: adresseIp(m[2]), protocole: null }
    }
    return null
}

type Liaison = { hote: string | null, champHote: string, conn: string, op: string, compte: string, le: string }

const dnNormalise = (dn: string) => dn.toLowerCase().replace(/\s*,\s*/g, ',').trim()

/**
 * Tentative de liaison slapd. Son issue est sur une autre ligne (`RESULT tag=97`), et
 * l'adresse sur une troisième (`ACCEPT`) : les trois ne sont reliées que par `conn=` et `op=`.
 */
export function lireLiaison(ligne: string, identifiants: Set<string>, dns: Set<string>): Omit<Liaison, 'hote' | 'champHote' | 'le'> | null {
    const m = ligne.match(/\bconn=(\d+) op=(\d+) BIND dn="([^"]*)" method=\d+/)
    if (!m) return null
    const dn = dnNormalise(m[3]!)
    const rdn = dn.match(/^[a-z]+=([^,]+)/)?.[1]
    if (!dns.has(dn) && !(rdn && identifiants.has(rdn))) return null
    return { conn: m[1]!, op: m[2]!, compte: rdn ?? dn }
}

/** Même lecture que l'indexeur (analyseur standard) : `=`, `-` et les espaces séparent les mots. */
const MARQUEURS = [
    'security cmd=Auth', 'security cmd=AuthRequest', 'security cmd=PreAuth', 'security cmd=ChangePassword', 'security cmd=SetPassword',
    'successfully authenticated at level', 'connected from', 'Bad password for', 'was not found in',
    'BIND dn',
]

const phrases = (valeurs: string[]) => ({
    bool: { should: valeurs.map(v => ({ match_phrase: { full_log: v } })), minimum_should_match: 1 },
})

export type Recherche = { identifiants: string[], dns: string[], debut: string, fin: string }
export type Lecture = {
    evenements: Evenement[]
    lues: number
    total: number
    couverture: { premier: string | null, dernier: string | null }
}

const decaler = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString()

/** Authentifications d'un compte dans les archives, sur une période. */
export async function lireAuthentifications(cfg: ConfigWazuh, r: Recherche): Promise<Lecture> {
    const identifiants = new Set(r.identifiants.map(i => i.trim().toLowerCase()).filter(Boolean))
    const dns = new Set(r.dns.map(dnNormalise))
    if (!identifiants.size) return { evenements: [], lues: 0, total: 0, couverture: { premier: null, dernier: null } }

    const reponse = await appeler<ReponseRecherche>(cfg, `${cfg.index}/_search`, {
        size: PLAFOND_WAZUH,
        sort: [{ timestamp: { order: 'desc' } }],
        track_total_hits: true,
        _source: ['timestamp', 'full_log', 'location', 'predecoder.hostname'],
        query: {
            bool: {
                filter: [
                    { range: { timestamp: { gte: r.debut, lte: r.fin } } },
                    phrases([...identifiants]),
                    phrases(MARQUEURS),
                ],
            },
        },
        // Ce que l'index couvre, toutes lignes confondues : une période plus ancienne que la
        // rétention ne doit pas se lire comme « rien trouvé ».
        aggs: { tout: { global: {}, aggs: { premier: { min: { field: 'timestamp' } }, dernier: { max: { field: 'timestamp' } } } } },
    })

    const evenements: Evenement[] = []
    const liaisons: Liaison[] = []
    for (const { _source: s } of reponse.hits.hits) {
        const ligne = s?.full_log ?? ''
        const le = dateIndexee(s?.timestamp)
        if (!le) continue
        const hote = s?.predecoder?.hostname ?? s?.location ?? null
        const lu = lireZimbra(ligne, identifiants) ?? lireLemonldap(ligne, identifiants)
        if (lu) {
            evenements.push({ ...lu, le, hote })
            continue
        }
        const liaison = lireLiaison(ligne, identifiants, dns)
        if (liaison) liaisons.push({ ...liaison, le, hote, champHote: s?.predecoder?.hostname ? 'predecoder.hostname' : 'location' })
    }

    evenements.push(...await issuesDesLiaisons(cfg, liaisons))
    evenements.sort((a, b) => a.le.localeCompare(b.le))

    return {
        evenements,
        lues: reponse.hits.hits.length,
        total: reponse.hits.total?.value ?? reponse.hits.hits.length,
        couverture: { premier: dateAgregat(reponse.aggregations?.tout?.premier), dernier: dateAgregat(reponse.aggregations?.tout?.dernier) },
    }
}

async function issuesDesLiaisons(cfg: ConfigWazuh, liaisons: Liaison[]): Promise<Evenement[]> {
    if (!liaisons.length) return []
    const suivies = liaisons.slice(0, PLAFOND_LIAISONS)

    // Une connexion par hôte : ses numéros repartent de zéro au redémarrage de slapd, d'où
    // une fenêtre serrée autour des liaisons qu'elle porte.
    const connexions = new Map<string, { hote: string | null, champHote: string, conn: string, debut: string, fin: string }>()
    for (const l of suivies) {
        const cle = `${l.hote}|${l.conn}`
        const c = connexions.get(cle)
        if (!c) connexions.set(cle, { hote: l.hote, champHote: l.champHote, conn: l.conn, debut: l.le, fin: l.le })
        else {
            if (l.le < c.debut) c.debut = l.le
            if (l.le > c.fin) c.fin = l.le
        }
    }

    const reponse = await appeler<ReponseRecherche>(cfg, `${cfg.index}/_search`, {
        size: PLAFOND_WAZUH,
        sort: [{ timestamp: { order: 'asc' } }],
        _source: ['timestamp', 'full_log', 'location', 'predecoder.hostname'],
        query: {
            bool: {
                filter: [phrases(['RESULT tag=97', 'ACCEPT from IP'])],
                should: [...connexions.values()].map(c => ({
                    bool: {
                        filter: [
                            ...(c.hote ? [{ term: { [c.champHote]: c.hote } }] : []),
                            { match_phrase: { full_log: `conn=${c.conn}` } },
                            { range: { timestamp: { gte: decaler(c.debut, -3_600_000), lte: decaler(c.fin, 300_000) } } },
                        ],
                    },
                })),
                minimum_should_match: 1,
            },
        },
    })

    const resultats: { hote: string | null, conn: string, op: string, err: number, le: string }[] = []
    const acceptes: { hote: string | null, conn: string, ip: string | null, le: string }[] = []
    for (const { _source: s } of reponse.hits.hits) {
        const ligne = s?.full_log ?? ''
        const le = dateIndexee(s?.timestamp)
        if (!le) continue
        const hote = s?.predecoder?.hostname ?? s?.location ?? null
        const res = ligne.match(/\bconn=(\d+) op=(\d+) RESULT tag=97 err=(\d+)/)
        if (res) {
            resultats.push({ hote, conn: res[1]!, op: res[2]!, err: Number(res[3]), le })
            continue
        }
        const acc = ligne.match(/\bconn=(\d+) fd=\d+ ACCEPT from IP=\[?([0-9a-f.:]+?)\]?:\d+\s/i)
        if (acc) acceptes.push({ hote, conn: acc[1]!, ip: adresseIp(acc[2]), le })
    }

    return liaisons.map((l, i): Evenement => {
        const suivie = i < PLAFOND_LIAISONS
        const res = suivie ? resultats.find(x => x.hote === l.hote && x.conn === l.conn && x.op === l.op && x.le >= l.le) : undefined
        const avant = suivie ? acceptes.filter(x => x.hote === l.hote && x.conn === l.conn && x.le <= l.le) : []
        const acc = avant[avant.length - 1]
        const issue: Issue = !res ? 'indetermine' : res.err === 0 ? 'succes' : res.err === 49 ? 'echec' : res.err === 32 ? 'compte_inconnu' : 'indetermine'
        return { source: 'ldap', compte: l.compte, issue, ip: acc?.ip ?? null, protocole: 'bind', le: l.le, hote: l.hote }
    })
}

// ---------------------------------------------------------------------------------------
// Synthèse.
// ---------------------------------------------------------------------------------------

export type LigneAuth = {
    source: SourceJournal
    compte: string
    issue: Issue
    ip: string | null
    protocole: string | null
    nombre: number
    premier: string
    dernier: string
}

const ORDRE_SOURCES: SourceJournal[] = ['zimbra', 'lemonldap', 'ldap']

/**
 * Une ligne par source, compte, issue, adresse et protocole. Selon sa version, LemonLDAP
 * écrit une connexion réussie deux fois, avec et sans adresse : la seconde est écartée.
 */
export function agregerAuthentifications(evenements: Evenement[]): LigneAuth[] {
    const doublon = (e: Evenement) => e.source === 'lemonldap' && e.issue === 'succes' && !e.ip
        && evenements.some(x => x !== e && x.source === 'lemonldap' && x.issue === 'succes' && x.ip && x.compte === e.compte
            && x.hote === e.hote && Math.abs(new Date(x.le).getTime() - new Date(e.le).getTime()) <= 5_000)

    const groupes = new Map<string, LigneAuth>()
    for (const e of evenements) {
        if (doublon(e)) continue
        const cle = [e.source, e.compte, e.issue, e.ip, e.protocole].join('|')
        const g = groupes.get(cle)
        if (!g) {
            groupes.set(cle, { source: e.source, compte: e.compte, issue: e.issue, ip: e.ip, protocole: e.protocole, nombre: 1, premier: e.le, dernier: e.le })
            continue
        }
        g.nombre++
        if (e.le < g.premier) g.premier = e.le
        if (e.le > g.dernier) g.dernier = e.le
    }
    return [...groupes.values()].sort((a, b) =>
        ORDRE_SOURCES.indexOf(a.source) - ORDRE_SOURCES.indexOf(b.source) || a.premier.localeCompare(b.premier))
}

// ---------------------------------------------------------------------------------------
// Essai depuis les réglages.
// ---------------------------------------------------------------------------------------

export type EssaiWazuh =
    | { ok: true, index: string, premier: string | null, dernier: string | null, typesFullLog: string[] }
    | { ok: false, message: string }

/** Lit ce que l'index couvre et comment `full_log` est indexé : une recherche par phrase exige du texte. */
export async function testerWazuh(cfg: ConfigWazuh): Promise<EssaiWazuh> {
    try {
        const r = await appeler<ReponseRecherche>(cfg, `${cfg.index}/_search`, {
            size: 0,
            aggs: { premier: { min: { field: 'timestamp' } }, dernier: { max: { field: 'timestamp' } } },
        })
        if (!r._shards?.total) return { ok: false, message: `Aucun index ne correspond à « ${cfg.index} », ou le compte ne peut en lire aucun.` }
        type Correspondance = Record<string, { mappings?: { full_log?: { mapping?: { full_log?: { type?: string } } } } }>
        const m = await appeler<Correspondance>(cfg, `${cfg.index}/_mapping/field/full_log`)
        const types = [...new Set(Object.values(m).map(x => x.mappings?.full_log?.mapping?.full_log?.type).filter((t): t is string => Boolean(t)))]
        return { ok: true, index: cfg.index, premier: dateAgregat(r.aggregations?.premier), dernier: dateAgregat(r.aggregations?.dernier), typesFullLog: types }
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
}
