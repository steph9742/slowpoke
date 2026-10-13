import { db } from "@slowpoke/database";
import { exclusionsSchema, harfanglabSchema, mainSchema } from "@slowpoke/database/tables";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { lireEtat, type EtatSynchro } from "@slowpoke/connecteurs/synchro";

// Rapprochement entre les exclusions consignées et les règles réellement présentes dans
// l'EDR. On AFFICHE l'écart, on ne le comble pas : une exclusion ne se crée qu'avec un
// motif et une date de revue, qui ne peuvent venir que d'un humain.

export type RegleNonEnregistree = {
    ref: string
    libelle: string | null
    criteres: string[]
    cible: string | null
    creeeLe: string | null
}

export type ExclusionDisparue = {
    id: string
    incidentId: string
    scope: string
    outilRef: string
    reviewDate: string
}

export type ExclusionNonRapprochee = {
    id: string
    incidentId: string
    scope: string
    reviewDate: string
}

export type IncidentLegitimeSansExclusion = {
    id: string
    type: string
    severity: string
    closDepuis: string
}

export type Rapprochement = {
    nonEnregistrees: RegleNonEnregistree[]
    /** Total des règles de l'EDR et part écartée de l'affichage, pour situer le décompte. */
    volume: { total: number, editeur: number }
    legitimesSansExclusion: IncidentLegitimeSansExclusion[]
    disparues: ExclusionDisparue[]
    nonRapprochees: ExclusionNonRapprochee[]
    /** Sans lui, une vue vide ne dit pas si tout va bien ou si la lecture a échoué. */
    etat: EtatSynchro | null
    configure: boolean
}

export async function rapprocher(): Promise<Rapprochement> {
    const R = harfanglabSchema.harfanglabRule
    const E = exclusionsSchema.exclusion

    // Combien de règles l'EDR porte ENCORE, et combien viennent de l'éditeur. Sans ce
    // dénominateur, l'écran laisse croire que l'outil ne contient que les règles listées —
    // et la comparaison avec la console HarfangLab devient incompréhensible.
    const [volumeBrut] = await db.select({
        total: sql<number>`count(*)::int`,
        editeur: sql<number>`count(*) FILTER (WHERE ${R.fourniParEditeur})::int`,
    }).from(R).where(eq(R.presente, true))
    const volume = { total: volumeBrut?.total ?? 0, editeur: volumeBrut?.editeur ?? 0 }

    // 1. Règles de l'EDR sans exclusion consignée.
    //
    // Les règles fournies par l'éditeur sont écartées : elles ne relèvent d'aucune décision
    // de la cellule, et les signaler noierait l'écart réel sous des centaines de lignes.
    const nonEnregistrees = await db.select({
        ref: R.ref, libelle: R.libelle, criteres: R.criteres, cible: R.cible, creeeLe: R.creeeLe,
    })
        .from(R)
        .where(and(
            eq(R.presente, true),
            eq(R.fourniParEditeur, false),
            sql`NOT EXISTS (SELECT 1 FROM ${E} WHERE ${E.outilRef} = ${R.ref} AND ${E.state} = 'active')`,
        ))
        .orderBy(R.creeeLe)

    // 2. Exclusions APPARIÉES dont la règle a disparu de l'EDR. Uniquement celles qui portent une
    // référence : sans elle on ne peut rien affirmer (c'est le cas 3), et les confondre
    // signalerait comme disparues toutes les exclusions antérieures au rapprochement.
    const disparues = await db.select({
        id: E.id, incidentId: E.incidentId, scope: E.scope, outilRef: E.outilRef, reviewDate: E.reviewDate,
    })
        .from(E)
        .where(and(
            eq(E.state, 'active'),
            eq(E.tool, 'harfanglab'),
            isNotNull(E.outilRef),
            sql`NOT EXISTS (SELECT 1 FROM ${R} WHERE ${R.ref} = ${E.outilRef} AND ${R.presente} = true)`,
        ))
        .orderBy(E.reviewDate)

    // 3. Exclusions actives jamais rapprochées. Ni un écart ni une anomalie : du travail
    //    d'appariement en attente, qu'il faut montrer pour ne pas le confondre avec le reste.
    const nonRapprochees = await db.select({
        id: E.id, incidentId: E.incidentId, scope: E.scope, reviewDate: E.reviewDate,
    })
        .from(E)
        .where(and(eq(E.state, 'active'), eq(E.tool, 'harfanglab'), isNull(E.outilRef)))
        .orderBy(E.reviewDate)

    // 4. Incidents clos en `legitimate` sans aucune exclusion enregistrée.
    //
    // Classer un incident « légitime » signifie qu'on a décidé de ne plus le voir, et cette
    // décision doit exister quelque part. Cet écart ne dépend pas de l'EDR : il se voit même sans
    // connecteur.
    const I = mainSchema.incident
    const legitimes = await db.select({
        id: I.id, type: I.type, severity: I.severity, closDepuis: I.updatedAt,
    })
        .from(I)
        .where(and(
            eq(I.resolution, 'legitimate'),
            sql`NOT EXISTS (SELECT 1 FROM ${E} WHERE ${E.incidentId} = ${I.id})`,
        ))
        .orderBy(I.updatedAt)
        .limit(100)

    const { lireConfigHfl } = await import('./harfanglab')

    return {
        legitimesSansExclusion: legitimes.map(i => ({
            id: i.id, type: i.type, severity: i.severity, closDepuis: i.closDepuis.toISOString(),
        })),
        volume,
        nonEnregistrees: nonEnregistrees.map(r => ({
            ref: r.ref,
            libelle: r.libelle,
            criteres: r.criteres ?? [],
            cible: r.cible,
            creeeLe: r.creeeLe?.toISOString() ?? null,
        })),
        disparues: disparues.map(e => ({
            id: e.id, incidentId: e.incidentId, scope: e.scope,
            outilRef: e.outilRef!, reviewDate: e.reviewDate.toISOString(),
        })),
        nonRapprochees: nonRapprochees.map(e => ({
            id: e.id, incidentId: e.incidentId, scope: e.scope, reviewDate: e.reviewDate.toISOString(),
        })),
        etat: await lireEtat('harfanglab'),
        configure: Boolean(await lireConfigHfl()),
    }
}

export type Suggestion = { ref: string, libelle: string | null, criteres: string[], raison: string }

/** Règles qui pourraient correspondre à une exclusion non rapprochée. Proposition seulement :
 *  l'appariement est confirmé par un humain. On compare la PORTÉE de l'exclusion aux critères
 *  de la règle, dans les deux sens — un chemin cité de part et d'autre est un indice, pas une preuve. */
export async function suggererRegles(exclusionId: string, limite = 5): Promise<Suggestion[]> {
    const [e] = await db.select().from(exclusionsSchema.exclusion)
        .where(eq(exclusionsSchema.exclusion.id, exclusionId)).limit(1)
    if (!e) return []

    // Les critères saisis séparément valent mieux que le texte composé : ils portent la
    // valeur exacte, sans mise en forme.
    const valeurs = [...Object.values(e.scopeDetails ?? {}), e.scope]
        .map(v => String(v ?? '').trim().toLowerCase())
        .filter(v => v.length >= 6)
    if (!valeurs.length) return []

    const R = harfanglabSchema.harfanglabRule
    const candidates = await db.select({ ref: R.ref, libelle: R.libelle, criteres: R.criteres })
        .from(R)
        .where(and(
            eq(R.presente, true),
            eq(R.fourniParEditeur, false),
            sql`NOT EXISTS (SELECT 1 FROM ${exclusionsSchema.exclusion} x WHERE x.outil_ref = ${R.ref} AND x.state = 'active')`,
        ))
        .limit(500)

    const trouvees: Suggestion[] = []
    for (const c of candidates) {
        const critères = (c.criteres ?? []).map(x => x.toLowerCase())
        const commun = valeurs.find(v => critères.some(cr => cr.includes(v) || v.includes(cr)))
        if (commun) trouvees.push({ ref: c.ref, libelle: c.libelle, criteres: c.criteres ?? [], raison: commun })
        if (trouvees.length >= limite) break
    }
    return trouvees
}

/**
 * Règles de l'EDR encore libres de tout appariement, filtrables au texte.
 *
 * Les suggestions ne rapprochent que ce qui se ressemble littéralement. Quand une exclusion a
 * été rédigée dans d'autres termes que la règle — fréquent, l'une décrit une décision, l'autre
 * un critère technique — elles ne trouvent rien, et la vue montrait l'écart sans offrir de quoi
 * le résoudre.
 */
export async function chercherRegles(q: string, limite = 25): Promise<Suggestion[]> {
    const R = harfanglabSchema.harfanglabRule
    const motif = `%${q.trim().toLowerCase()}%`

    const lignes = await db.select({ ref: R.ref, libelle: R.libelle, criteres: R.criteres })
        .from(R)
        .where(and(
            eq(R.presente, true),
            eq(R.fourniParEditeur, false),
            sql`NOT EXISTS (SELECT 1 FROM ${exclusionsSchema.exclusion} x WHERE x.outil_ref = ${R.ref} AND x.state = 'active')`,
            q.trim()
                ? sql`(lower(coalesce(${R.libelle}, '')) LIKE ${motif}
                    OR lower(coalesce(${R.cible}, '')) LIKE ${motif}
                    OR EXISTS (SELECT 1 FROM unnest(${R.criteres}) c WHERE lower(c) LIKE ${motif}))`
                : undefined,
        ))
        .orderBy(R.creeeLe)
        .limit(limite)

    return lignes.map(l => ({ ref: l.ref, libelle: l.libelle, criteres: l.criteres ?? [], raison: '' }))
}
