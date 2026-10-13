import { db } from "@slowpoke/database";
import { synchroSchema } from "@slowpoke/database/tables";
import { eq, sql } from "drizzle-orm";

// Témoin d'activité des synchronisations.
//
// Une liste vide doit dire LAQUELLE des deux choses elle signifie : « rien à signaler » ou
// « la dernière lecture a échoué ». Sans cette distinction, une panne ressemble à une
// situation saine.

export type CleSynchro = 'advens' | 'playbooks' | 'glpi' | 'harfanglab' | 'alertes'

export type EtatSynchro = {
    cle: string
    dernierSucces: string | null
    dernierEssai: string | null
    dernierOk: boolean
    derniereErreur: string | null
    echecsConsecutifs: number
    dernierBilan: string | null
}

/** Après un succès. `dernierSucces` avance : c'est de ce moment que datent les données. */
export async function noterSucces(cle: CleSynchro, bilan?: string): Promise<void> {
    const maintenant = new Date()
    const valeurs = {
        dernierSucces: maintenant,
        dernierEssai: maintenant,
        dernierOk: true,
        derniereErreur: null,
        echecsConsecutifs: 0,
        dernierBilan: bilan ?? null,
    }
    await db.insert(synchroSchema.synchroEtat).values({ cle, ...valeurs })
        .onConflictDoUpdate({ target: synchroSchema.synchroEtat.cle, set: valeurs })
}

/**
 * Après un échec. `dernierSucces` n'est PAS touché : ce qui est affiché date toujours de
 * ce dernier passage réussi, et c'est cette date qu'il faut montrer.
 */
export async function noterEchec(cle: CleSynchro, erreur: unknown): Promise<void> {
    const message = (erreur instanceof Error ? erreur.message : String(erreur)).slice(0, 500)
    await db.insert(synchroSchema.synchroEtat)
        .values({ cle, dernierEssai: new Date(), dernierOk: false, derniereErreur: message, echecsConsecutifs: 1 })
        .onConflictDoUpdate({
            target: synchroSchema.synchroEtat.cle,
            set: {
                dernierEssai: new Date(),
                dernierOk: false,
                derniereErreur: message,
                echecsConsecutifs: sql`${synchroSchema.synchroEtat.echecsConsecutifs} + 1`,
            },
        })
}

export async function lireEtat(cle: CleSynchro): Promise<EtatSynchro | null> {
    const [e] = await db.select().from(synchroSchema.synchroEtat)
        .where(eq(synchroSchema.synchroEtat.cle, cle)).limit(1)
    if (!e) return null
    return {
        cle: e.cle,
        dernierSucces: e.dernierSucces?.toISOString() ?? null,
        dernierEssai: e.dernierEssai?.toISOString() ?? null,
        dernierOk: e.dernierOk,
        derniereErreur: e.derniereErreur,
        echecsConsecutifs: e.echecsConsecutifs,
        dernierBilan: e.dernierBilan,
    }
}

export async function lireEtats(): Promise<EtatSynchro[]> {
    const lignes = await db.select().from(synchroSchema.synchroEtat)
    return lignes.map(e => ({
        cle: e.cle,
        dernierSucces: e.dernierSucces?.toISOString() ?? null,
        dernierEssai: e.dernierEssai?.toISOString() ?? null,
        dernierOk: e.dernierOk,
        derniereErreur: e.derniereErreur,
        echecsConsecutifs: e.echecsConsecutifs,
        dernierBilan: e.dernierBilan,
    }))
}
