import { Elysia } from "elysia";
import { auth } from "@slowpoke/auth"
import { adresseClient, enregistrerEchec, enregistrerSucces } from "./limiteurConnexion"

// Enveloppe du handler better-auth : c'est le SEUL endroit où le statut réel d'une
// tentative de connexion est visible. Les hooks de sortie d'Elysia (`onAfterResponse`)
// ne se déclenchent pas sur un handler monté via `.mount()` — vérifié — donc le comptage
// des échecs de mot de passe doit se faire ici, autour de l'appel.
const handlerAvecComptage = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const estConnexionMotDePasse = request.method === 'POST'
        && url.pathname.includes('/sign-in/email')

    // Le corps n'est lisible qu'une fois : on le clone AVANT de passer la main.
    let email = ''
    if (estConnexionMotDePasse) {
        try {
            const corps = await request.clone().json() as { email?: string }
            email = typeof corps.email === 'string' ? corps.email : ''
        }
        catch { /* corps illisible : seul le comptage par IP s'appliquera */ }
    }

    const reponse = await auth.handler(request)

    if (estConnexionMotDePasse) {
        const ip = adresseClient(request)
        if (reponse.status >= 200 && reponse.status < 300) enregistrerSucces(ip, email)
        else enregistrerEchec(ip, email)
    }

    return reponse
}

// Rôles applicatifs. Attribution auto (SSO) : admin (groupe `admins`) ou user.
// Attribution manuelle par un admin : lecteur (lecture) et gestionnaire (écriture incidents + gestion users).
type Role = 'user' | 'lecteur' | 'gestionnaire' | 'admin'
type Allowed = Role | 'svc'

// Scopes des comptes de service (cf. `scopesStatement` dans @slowpoke/auth).
type Scope = 'read' | 'write' | 'delete' | 'admin'

// Scope exigé, déduit du verbe HTTP : lire ≠ écrire ≠ supprimer.
// Toutes les routes ouvertes aux comptes de service respectent cette correspondance.
const scopeForMethod = (method: string | undefined): Scope => {
    switch (String(method ?? '').toUpperCase()) {
        case 'GET':
        case 'HEAD':
        case 'OPTIONS':
            return 'read'
        case 'DELETE':
            return 'delete'
        default:
            return 'write'
    }
}

const getServiceKeyFromHeaders = (headers: Headers | undefined | null) => {
    const serviceKey = headers?.get("x-service-key")?.trim();
    if (serviceKey) return serviceKey;

    const authorization = headers?.get("authorization")?.trim();
    if (!authorization) return null;

    if (!authorization.toLowerCase().startsWith("bearer ")) return null;

    const bearerToken = authorization.slice(7).trim();
    return bearerToken.length > 0 ? bearerToken : null;
}

export const betterAuth = new Elysia({ name: 'better-auth' })
    .mount(handlerAvecComptage)
    .macro({
        auth: (allowed: Allowed[]) => ({
            async resolve({ status, request: { headers, method } }) {
                // Compte de service (n8n…) : autorisé uniquement si 'svc' figure dans la liste
                if (getServiceKeyFromHeaders(headers) && allowed.includes('svc')) {
                    const svc = await auth.api.getServiceAccountFromRequest({ headers })
                    if (!svc) return status(401)

                    // Les scopes du compte sont opposables : une clé « Lecture » ne peut pas écrire.
                    // Le scope 'admin' vaut passe-partout.
                    const granted = (svc.service_account?.scopes ?? []) as string[]
                    const required = scopeForMethod(method)
                    if (!granted.includes('admin') && !granted.includes(required)) return status(403)

                    return svc
                }

                const session = await auth.api.getSession({ headers })
                if (!session) return status(401)

                // Sémantique OU : au moins un rôle de l'utilisateur doit figurer dans la liste autorisée.
                // (better-auth admin autorise plusieurs rôles séparés par des virgules.)
                const roles = String(session.user.role ?? 'user').split(',').map(r => r.trim())
                if (!roles.some(r => (allowed as string[]).includes(r))) return status(403)

                return {
                    user: session.user,
                    session: session.session,
                };
            }
        })
    })