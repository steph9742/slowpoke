import { Client } from 'ldapts'
import { db } from '@slowpoke/database'
import { settingsSchema } from '@slowpoke/database/tables'
import { inArray } from 'drizzle-orm'
import { dechiffrer } from './secrets'
import { signalerAppel } from './sortie'

// ANNUAIRE LDAP — en lecture seule.
//
// Sert l'enquête « compte compromis » : dernier changement de mot de passe, MFA, groupes. Le
// compte de liaison n'a besoin d'aucun droit d'écriture et ne doit pas en avoir.

export const CLE_LDAP_URL = 'ldap.url'
export const CLE_LDAP_BIND_DN = 'ldap.bind_dn'
export const CLE_LDAP_MOT_DE_PASSE = 'ldap.mot_de_passe'
export const CLE_LDAP_BASE = 'ldap.base'
export const CLE_LDAP_ATTR_MDP = 'ldap.attr_mot_de_passe'
export const CLE_LDAP_ATTR_MFA = 'ldap.attr_mfa'
export const CLES_LDAP = [CLE_LDAP_URL, CLE_LDAP_BIND_DN, CLE_LDAP_MOT_DE_PASSE, CLE_LDAP_BASE, CLE_LDAP_ATTR_MDP, CLE_LDAP_ATTR_MFA]

/** Attribut du dernier changement de mot de passe, faute de réglage. */
export const ATTR_MDP_DEFAUT = 'pwdChangedTime'
/** Attribut MFA que le Catalogue lit déjà sur l'annuaire de l'établissement. */
export const ATTR_MFA_DEFAUT = 'ufcMailPersoMFA'

export type ConfigLdap = { url: string, bindDn: string, motDePasse: string, base: string, attrMotDePasse: string, attrMfa: string }

export async function lireConfigLdap(): Promise<ConfigLdap | null> {
    const lignes = await db.select().from(settingsSchema.appSetting)
        .where(inArray(settingsSchema.appSetting.key, CLES_LDAP))
    const v = Object.fromEntries(lignes.map(l => [l.key, l.value ?? '']))
    const url = v[CLE_LDAP_URL]?.trim()
    const bindDn = v[CLE_LDAP_BIND_DN]?.trim()
    // Le mot de passe n'est pas rogné : une espace peut en faire partie.
    const motDePasse = dechiffrer(v[CLE_LDAP_MOT_DE_PASSE])
    const base = v[CLE_LDAP_BASE]?.trim()
    if (!url || !bindDn || !motDePasse || !base) return null
    return {
        url, bindDn, motDePasse, base,
        attrMotDePasse: v[CLE_LDAP_ATTR_MDP]?.trim() || ATTR_MDP_DEFAUT,
        attrMfa: v[CLE_LDAP_ATTR_MFA]?.trim() || ATTR_MFA_DEFAUT,
    }
}

/** Une liaison non chiffrée ferait circuler le mot de passe du compte de liaison en clair. */
export function connexionChiffree(cfg: { url: string }): boolean {
    return cfg.url.trim().toLowerCase().startsWith('ldaps://')
}

/** Échappement RFC 4515 : une adresse saisie ne doit pas pouvoir élargir le filtre de recherche. */
export function echapperFiltre(v: string): string {
    return v.replace(/[\\*()\0]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'))
}

/** « 20260914101112Z » (pwdChangedTime) ou un nombre de jours (shadowLastChange), en ISO. Sinon la valeur brute. */
export function dateAnnuaire(v: string | null): string | null {
    if (!v) return null
    const g = v.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/)
    if (g) return new Date(Date.UTC(+g[1]!, +g[2]! - 1, +g[3]!, +g[4]!, +g[5]!, +g[6]!)).toISOString()
    if (/^\d{1,6}$/.test(v)) return new Date(Number(v) * 86_400_000).toISOString()
    return v
}

export type EtatCompte = {
    mail: string
    trouve: boolean
    dn: string | null
    uid: string | null
    motDePasseChangeLe: string | null
    mfa: string | null
    groupes: string[]
}

const premier = (v: unknown): string | null => {
    const x = Array.isArray(v) ? v[0] : v
    return x === undefined || x === null ? null : String(x)
}
const tous = (v: unknown): string[] =>
    (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String)

async function avecClient<T>(cfg: ConfigLdap, operation: string, travail: (c: Client) => Promise<T>): Promise<T> {
    if (!connexionChiffree(cfg)) {
        throw new Error("Liaison non chiffrée refusée : l'adresse de l'annuaire doit commencer par ldaps://.")
    }
    const client = new Client({ url: cfg.url, timeout: 10_000, connectTimeout: 10_000 })
    const debut = performance.now()
    const signaler = (erreur: string | null) => signalerAppel({
        systeme: 'ldap', methode: operation, chemin: cfg.base, statut: null,
        dureeMs: Math.round(performance.now() - debut), erreur,
    })
    try {
        await client.bind(cfg.bindDn, cfg.motDePasse)
        const r = await travail(client)
        signaler(null)
        return r
    }
    catch (e) {
        signaler(e instanceof Error ? e.message.slice(0, 200) : String(e))
        throw e
    }
    finally {
        await client.unbind().catch(() => {})
    }
}

/** État de chaque compte, cherché par son adresse. Un compte absent est rendu comme tel, jamais omis. */
export async function lireEtatComptes(cfg: ConfigLdap, mails: string[]): Promise<EtatCompte[]> {
    return avecClient(cfg, 'SEARCH', async (client) => {
        const etats: EtatCompte[] = []
        for (const mail of mails) {
            const { searchEntries } = await client.search(cfg.base, {
                scope: 'sub',
                filter: `(mail=${echapperFiltre(mail)})`,
                attributes: ['uid', cfg.attrMotDePasse, cfg.attrMfa, 'memberOf'],
                sizeLimit: 2,
            })
            const e = searchEntries[0] as (Record<string, unknown> & { dn: string }) | undefined
            etats.push(e
                ? {
                    mail, trouve: true, dn: e.dn, uid: premier(e.uid),
                    motDePasseChangeLe: dateAnnuaire(premier(e[cfg.attrMotDePasse])),
                    mfa: premier(e[cfg.attrMfa]),
                    groupes: tous(e.memberOf),
                }
                : { mail, trouve: false, dn: null, uid: null, motDePasseChangeLe: null, mfa: null, groupes: [] })
        }
        return etats
    })
}

export async function testerLdap(cfg: ConfigLdap): Promise<{ ok: true, base: string } | { ok: false, message: string }> {
    try {
        await avecClient(cfg, 'BIND', async (client) => {
            await client.search(cfg.base, { scope: 'base', attributes: ['1.1'], sizeLimit: 1 })
        })
        return { ok: true, base: cfg.base }
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
}
