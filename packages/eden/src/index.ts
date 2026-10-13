import { treaty, type Treaty } from "@elysiajs/eden";
import type { App } from "@slowpoke/server"

// AUCUNE instance au chargement du module — et ce n'est pas une simplification.
//
// Une instance partagée lisant `process.env.NUXT_PUBLIC_SERVER_BASE_URL` valait `undefined`
// côté navigateur, où `process.env` est vide : eden retombait alors sur son domaine de repli,
// un tiers, en gardant `credentials: 'include'`.
//
// Toute instance se construit donc via `createEden`, avec une URL fournie par l'appelant.
const createEden = (baseURL: string, headers: Record<string, string>) => treaty<App>(baseURL, {
    fetch: {
        credentials: 'include',
    },
    headers
})

/** Type du client, pour les annotations : `Eden['api']['timeline']['get']`, etc. */
type Eden = ReturnType<typeof createEden>

export { createEden, type Eden, type Treaty }
