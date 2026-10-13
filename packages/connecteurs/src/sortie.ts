// POINT DE SORTIE RÉSEAU UNIQUE DU SERVEUR.
//
// Le serveur ne parle à un système externe que par ici. Ce qui passe par ce point peut être
// tracé et, plus tard, déplacé dans un conteneur à part sans toucher aux appelants. La règle
// est tenue par le lint : `fetch` est interdit ailleurs dans le serveur, sauf exemptions
// nommées.

/** Systèmes joignables. En ajouter un est un acte visible, relu en merge request. */
export type Systeme = 'harfanglab' | 'glpi' | 'advens' | 'gitlab' | 'ldap' | 'wazuh'

export type Appel = {
    systeme: Systeme
    /** Méthode et chemin, sans paramètres ni en-têtes : ce qui peut s'écrire dans une trace. */
    methode: string
    chemin: string
    statut: number | null
    dureeMs: number
    erreur: string | null
}

type Observateur = (appel: Appel) => void | Promise<void>
const observateurs: Observateur[] = []

/** Branche un observateur sur chaque appel sortant — le journal d'audit, notamment. */
export function observerAppels(o: Observateur): void {
    observateurs.push(o)
}

/**
 * Signale un appel qui ne passe pas par `fetch` — une recherche dans l'annuaire, par exemple.
 * Les observateurs le reçoivent comme les autres ; un observateur défaillant n'interrompt
 * jamais l'appel qu'il observe.
 */
export function signalerAppel(appel: Appel): void {
    for (const o of observateurs) {
        Promise.resolve().then(() => o(appel)).catch(() => {})
    }
}

/**
 * `fetch`, pour un système nommé. Ne touche ni la requête ni la réponse : l'appelant garde
 * l'authentification et l'analyse. Seuls la méthode, le chemin, le statut et la durée sont
 * retenus — jamais l'URL complète ni les en-têtes, qui portent les jetons.
 */
export async function appelerExterne(systeme: Systeme, url: string, init?: BunFetchRequestInit): Promise<Response> {
    const debut = performance.now()
    const methode = (init?.method ?? 'GET').toUpperCase()
    let chemin = url
    try { chemin = new URL(url).pathname } catch { /* URL relative : gardée telle quelle */ }

    const noter = (statut: number | null, erreur: string | null) =>
        signalerAppel({ systeme, methode, chemin, statut, dureeMs: Math.round(performance.now() - debut), erreur })

    try {
        const r = await fetch(url, init)
        noter(r.status, null)
        return r
    }
    catch (e) {
        noter(null, e instanceof Error ? e.message.slice(0, 200) : String(e))
        throw e
    }
}
