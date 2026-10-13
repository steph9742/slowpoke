import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@slowpoke/database"
import { serviceAccounts } from "@slowpoke/better-auth-plugins/service-accounts";
import { admin, createAccessControl, genericOAuth } from "better-auth/plugins";

// ANCIEN NOMMAGE DES VARIABLES DU SSO, lu en secours.
//
// Ces variables s'appelaient `OUATE_*`, du nom du fournisseur d'identité d'origine. Les deux
// écritures sont acceptées, `OIDC_*` d'abord : une installation en service monte de version
// sans toucher à son `.env`, où un renommage oublié ferait disparaître le SSO en silence.
// Compatibilité ascendante, à retirer quand plus aucune installation n'emploie l'ancien nom.
export function lireVariableOidc(suffixe: string): string | undefined {
  return process.env[`OIDC_${suffixe}`]?.trim() || process.env[`OUATE_${suffixe}`]?.trim() || undefined
}

/** Vrai si l'installation configure encore le SSO sous l'ancien nommage. */
const ancienNommage = Boolean(!process.env.OIDC_CLIENT_ID?.trim() && process.env.OUATE_CLIENT_ID?.trim())

// Le fournisseur OIDC n'est déclaré que s'il est configuré : déclaré à vide, better-auth
// tente la découverte au démarrage et le serveur ne démarre pas — y compris quand on cherche
// à se connecter en secours parce que le SSO est tombé.
const oidcConfigure = Boolean(
  lireVariableOidc('CLIENT_ID')
  && lireVariableOidc('CLIENT_SECRET')
  && lireVariableOidc('DISCOVERY_URL'),
)

if (!oidcConfigure) {
  console.warn("⚠️  SSO OIDC non configuré : seule la connexion par mot de passe est disponible.")
}
else if (ancienNommage) {
  console.warn("ℹ️  SSO configuré sous l'ancien nommage `OUATE_*`, encore accepté. Renommer en `OIDC_*` à l'occasion.")
}

/** Groupe du fournisseur d'identité dont les membres sont créés administrateurs. */
const GROUPE_ADMIN = lireVariableOidc('ADMIN_GROUP') || 'admins'

/**
 * Modèle d'URL d'avatar, `{id}` étant l'identifiant du compte. Vide : aucun avatar.
 *
 * L'ancien `OUATE_NC_URL` portait la BASE d'un Nextcloud, dont le chemin d'avatar était figé
 * dans le code : on le reconstruit tel quel pour ne pas perdre les avatars au passage.
 */
const MODELE_AVATAR = process.env.OIDC_AVATAR_URL_TEMPLATE?.trim()
  || (process.env.OUATE_NC_URL?.trim() ? `${process.env.OUATE_NC_URL.trim().replace(/\/$/, '')}/avatar/{id}/512` : undefined)

const scopesStatement = {
    permissions: ["read", "write", "delete", "admin"]
} as const; 

export const scopes = createAccessControl(scopesStatement);

const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    emailAndPassword: {
        enabled: true,
        domain: process.env.AUTH_DOMAIN! || undefined,
    },
    advanced: {
        crossSubDomainCookies: {
            enabled: true
        },
        cookiePrefix: "slowpoke",
    },
    plugins: [
        serviceAccounts({
            scopes,
            // Seuls les admins gèrent (créent / listent / suppriment) les comptes de service
            allowUserToManageServiceAccounts: (user) =>
                String((user as { role?: string | null }).role ?? '').split(',').map(r => r.trim()).includes('admin'),
        }),
        genericOAuth({
            // Liste vide plutôt que greffon absent : le tableau `plugins` doit rester
            // littéral, faute de quoi better-auth cesse d'inférer le type de la session et
            // `user.role` — dont dépend tout le contrôle d'accès — disparaît du typage.
            config: oidcConfigure ? [
                {
                    providerId: "oidc",
                    clientId: lireVariableOidc('CLIENT_ID')!,
                    clientSecret: lireVariableOidc('CLIENT_SECRET')!,
                    discoveryUrl: lireVariableOidc('DISCOVERY_URL')!,
                    // `federated:id` n'est demandé d'office que sous l'ancien nommage : son IdP
                    // l'exige, et une montée de version ne doit pas retirer un scope en place.
                    scopes: (lireVariableOidc('SCOPES')
                        || (ancienNommage ? 'openid profile email groups federated:id' : 'openid profile email groups')
                    ).split(/[\s,]+/).filter(Boolean),
                    // ⚠️ `role` n'est retenu ici QUE jusqu'à better-auth 1.6.11 incluse :
                    // à partir de 1.6.12, la création d'un compte OAuth ignore les champs non
                    // déclarés inscriptibles, et le greffon `admin()` déclare `role` en
                    // `input: false`. Tout le contrôle d'accès lisant cette colonne, un
                    // administrateur serait alors créé en `user`, sans erreur ni trace.
                    // better-auth est épinglé pour cette raison.
                    mapProfileToUser(profile) {
                        const identifiant = profile.federated_claims?.user_id ?? profile.sub
                        return {
                            email: profile.email,
                            role: profile.groups?.includes(GROUPE_ADMIN) ? 'admin' : 'user',
                            ...(MODELE_AVATAR && identifiant
                                ? { image: MODELE_AVATAR.replace('{id}', String(identifiant)) }
                                : {}),
                        }
                    },
                }
            ] : []
        }),
        admin()
    ],
    trustedOrigins: process.env.TRUSTED_ORIGINS?.split(",") || [],
})

export { auth }