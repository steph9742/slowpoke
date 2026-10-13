import { Elysia, t } from "elysia";
import { betterAuth } from "../middleware/auth";
import { normalizeSeverity, SEVERITY_ACCEPTED_INPUTS, severityLabel, severityCode } from "@slowpoke/database/severity";
import { machinesParIncident } from "../utils/machinesIncident";
import { normaliserComposante } from "@slowpoke/database/composantes";
import { Machine } from "./machines";
import { statusLabel, resolutionLabel } from "@slowpoke/database/labels";
import { parseDateEtablissement } from "../utils/dates";
import { db } from "@slowpoke/database";
import { mainSchema, incidentsSchema, phishingSchema } from "@slowpoke/database/tables";
import { and, eq, ilike, inArray, count, sql, gte, lte, isNull } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { createSchemaFactory } from 'drizzle-typebox'
import { createLog } from "../utils/log";
import { _selectIncident, _selectLog, DataBreachDetails, DDoSDetails, IntrusionDetails, MalwareDetails, OtherDetails, PhishingDetails, RansomwareDetails } from "../models/incident";
import { QueryListe, QueryListeEnveloppe, QueryCompte } from "../models/filtresIncident";

const { createInsertSchema, createUpdateSchema } = createSchemaFactory({ typeboxInstance: t });

type FiltresIncident = {
  id?: string, type?: string, status?: string, statuts?: string, severity?: string, resolution?: string,
  depuis?: string, jusqua?: string, veilleExpireAvant?: string,
}

/** Borne de date : une valeur illisible est ignorée plutôt que de filtrer sur `Invalid Date`. */
function borne(v: string | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Filtre commun à la liste et au décompte : deux logiques divergeraient à la première retouche. */
function filtreIncidents(q: FiltresIncident) {
  const I = mainSchema.incident
  // `P1` et `critical` désignent le même incident : la création l'admettait déjà, le filtre
  // non. Une intégration qui interroge dans le vocabulaire de la cellule recevait donc zéro
  // résultat pour une question dont la réponse existait.
  const severite = q.severity ? normalizeSeverity(q.severity) : null

  // BORNES SUR `knowledgeAt`, jamais sur `createdAt`.
  //
  // « Combien d'incidents ce mois-ci » porte sur ce que l'établissement a SU ce mois-ci : un
  // incident de mars enregistré en avril appartient à mars. C'est aussi la date d'où partent
  // les délais réglementaires — une même borne pour le dénombrement et pour la conformité.
  const depuis = borne(q.depuis)
  const jusqua = borne(q.jusqua)
  const veille = borne(q.veilleExpireAvant)

  const conditions = [
    // Un incident archivé garde son dossier mais quitte les listes et les décomptes.
    isNull(I.archiveLe),
    q.id ? ilike(I.id, `%${q.id}%`) : undefined,
    q.type ? eq(I.type, q.type as typeof I.type._.data) : undefined,
    q.status ? eq(I.status, q.status as typeof I.status._.data) : undefined,
    // Plusieurs statuts à la fois : la forme de la valeur est déjà vérifiée par le schéma de la requête.
    q.statuts ? inArray(I.status, q.statuts.split(',') as (typeof I.status._.data)[]) : undefined,
    severite ? eq(I.severity, severite) : undefined,
    q.resolution ? eq(I.resolution, q.resolution as typeof I.resolution._.data) : undefined,
    depuis ? gte(I.knowledgeAt, depuis) : undefined,
    jusqua ? lte(I.knowledgeAt, jusqua) : undefined,
    // Veilles arrivant à échéance : ferme le cycle du statut « surveillance », qui exige
    // une échéance mais n'offrait aucun moyen de demander lesquelles arrivent à terme.
    veille ? lte(I.surveillanceExpiresAt, veille) : undefined,
  ].filter(Boolean)
  return conditions.length ? and(...conditions) : undefined
}

/** Adresse publique d'un incident, pour une citation cliquable. Sans origine publique
 *  déclarée, le chemin relatif est rendu tel quel : une adresse reconstituée depuis `Host`
 *  serait fausse derrière un proxy, et une citation fausse est pire qu'incomplète. */
function urlIncident(id: string): string {
  const origine = (process.env.PUBLIC_APP_URL || process.env.TRUSTED_ORIGINS?.split(',')[0] || '').trim()
  return origine ? `${origine.replace(/\/$/, '')}/incidents/${id}` : `/incidents/${id}`
}

const _createIncident = createInsertSchema(mainSchema.incident)
const _createIncidentLog = createInsertSchema(mainSchema.incidentLog)
const _updateIncident = createUpdateSchema(mainSchema.incident)

const BaseIncidentBody = t.Omit(_createIncident, ['id', 'createdAt', 'updatedAt', 'createdBy', 'createdBySvc']);
const UpdateIncidentBody = t.Partial(t.Omit(_updateIncident, ['createdAt', 'updatedAt', 'createdBy', 'createdBySvc', 'id']));

export const IncidentPayload = t.Intersect([
  // `knowledgeAt` est retiré de la base dérivée pour être redéclaré OBLIGATOIRE : la
  // colonne est nullable (incidents antérieurs au champ), donc drizzle-typebox le rendrait
  // optionnel. Or une échéance réglementaire calculée sans lui est fausse.
  t.Omit(BaseIncidentBody, ['knowledgeAt', 'knowledgeEstimated', 'referredAt', 'severity']),
  t.Object({
    // Gravité acceptée sous ses trois écritures (P1, critical, Critique) et ramenée à la
    // valeur technique par le handler. Le vocabulaire de référence du dispositif est
    // P1–P4 ; imposer `critical` obligerait chaque appelant à traduire.
    severity: t.String({ description: `Gravité. Écritures acceptées : ${SEVERITY_ACCEPTED_INPUTS}` }),
    // Quand l'ÉTABLISSEMENT a su : point de départ des échéances réglementaires.
    knowledgeAt: t.Union([t.String(), t.Date()], {
      description: "Date à laquelle l'établissement a eu connaissance de l'incident (détection interne ou réception d'un signalement tiers). Obligatoire : les échéances réglementaires en découlent.",
    }),
    // Vrai quand la date ci-dessus est une approximation.
    knowledgeEstimated: t.Optional(t.Boolean({ description: "Vrai si knowledgeAt est estimée et non connue avec certitude." })),
    // Saisine de la cellule ; à défaut, l'heure de création.
    referredAt: t.Optional(t.Union([t.String(), t.Date()], { description: "Date de saisine de la cellule. Par défaut : heure de création." })),
    // Rétro-datation optionnelle (import d'historique) : fixe la date de création de l'incident
    createdAt: t.Optional(t.Union([t.String(), t.Date()])),
    // Import silencieux : ne pas notifier les abonnés ni relayer aux webhooks
    silent: t.Optional(t.Boolean()),
    details: t.Optional(t.Union([
      t.Object({ type: t.Literal('phishing'), data: PhishingDetails }),
      t.Object({ type: t.Literal('malware'), data: MalwareDetails }),
      t.Object({ type: t.Literal('ddos'), data: DDoSDetails }),
      t.Object({ type: t.Literal('ransomware'), data: RansomwareDetails }),
      t.Object({ type: t.Literal('data_breach'), data: DataBreachDetails }),
      t.Object({ type: t.Literal('network_intrusion'), data: IntrusionDetails }),
      t.Object({ type: t.Literal('other'), data: OtherDetails }),
    ]))
  })
])

const IncidentUpdatePayload = t.Intersect([
  UpdateIncidentBody,
  t.Optional(
    t.Object({
      details: t.Optional(t.Union([
        t.Object({ type: t.Literal('phishing'), data: t.Partial(PhishingDetails) }),
        t.Object({ type: t.Literal('malware'), data: t.Partial(MalwareDetails) }),
        t.Object({ type: t.Literal('ddos'), data: t.Partial(DDoSDetails) }),
        t.Object({ type: t.Literal('ransomware'), data: t.Partial(RansomwareDetails) }),
        t.Object({ type: t.Literal('data_breach'), data: t.Partial(DataBreachDetails) }),
        t.Object({ type: t.Literal('network_intrusion'), data: t.Partial(IntrusionDetails) }),
        t.Object({ type: t.Literal('other'), data: t.Partial(OtherDetails) }),
      ]))
    })
  )
]);

const IncidentWithRelation = t.Union([
  t.Literal('createdByUser', { description: 'Inclure les informations de l\'utilisateur ayant créé l\'incident' }),
  t.Literal('createdBySvc', { description: 'Inclure les informations du service ayant créé l\'incident' }),
  t.Literal('logs', { description: 'Inclure les logs de l\'incident' }),
  t.Literal('extension', { description: 'Inclure les informations supplémentaires de l\'incident (si le type est "Autre")' }),
  t.Literal('artifacts', { description: 'Inclure la liste des artéfacts de l\'incident' }),
  t.Literal('subscribers', { description: 'Inclure les abonnés de l\'incident' }),
  t.Literal('details'),
])


// Libellés FR des champs de détail spécifiques au type (pour le message de log)
const DETAIL_FIELD_LABELS: Record<string, string> = {
  detectedAt: 'Date de détection', startedAt: 'Début', endedAt: 'Fin',
  rntCertId: 'ID RNT-CERT', malwareType: 'Type de malware', intrusionType: "Type d'intrusion",
  entrypoint: "Point d'entrée", networkLocation: 'Localisation réseau', networkLocations: 'Localisations réseau',
  ransomAmount: 'Montant de rançon', ransomCurrency: 'Devise', concernedEntities: 'Entités concernées',
  recordsAffected: 'Enregistrements affectés', dataCategories: 'Catégories de données', additionalInfo: 'Infos additionnelles',
  machines: 'Machines', iocs: 'IOC / hash', c2: 'Serveurs C2', targets: 'Cibles', sourceIps: 'IP sources',
  vectors: "Vecteurs d'attaque", compromisedAccounts: 'Comptes compromis', exfilDestinations: 'Destinations exfiltration',
  targetPort: 'Port cible', durationMinutes: 'Durée (min)', peakBandwidthMbps: 'Bande passante pic (Mbps)',
};

// Table de détail par type d'incident (pour relire l'état avant modification)
const DETAIL_TABLES = {
  malware: incidentsSchema.malwareIncident,
  ddos: incidentsSchema.ddosIncident,
  ransomware: incidentsSchema.ransomwareIncident,
  data_breach: incidentsSchema.dataBreachIncident,
  network_intrusion: incidentsSchema.intrusionIncident,
  phishing: phishingSchema.phishingDetail,
  other: mainSchema.incidentExtension,
} as const;

// Normalise une valeur pour comparer avant/après (dates à la minute ; reste tel quel)
function normalizeForDiff(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return Math.floor(v.getTime() / 60000);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 60000);
  }
  return v;
}

export const incidentsRouter = new Elysia({ name: 'incidents', prefix: '/api/incidents', tags: ['Incidents'] })
  .use(betterAuth)
  .model({
    Incident: _selectIncident,
    Log: _selectLog,
    Phishing: PhishingDetails,
    Malware: MalwareDetails,
    DDoS: DDoSDetails,
    Ransomware: RansomwareDetails,
    DataBreach: DataBreachDetails,
    Intrusion: IntrusionDetails,
    Other: OtherDetails,
  })
  .get('/', async ({ query }) => {
    const lignes = await db.query.incident.findMany({
      limit: query.pageSize ?? 10,
      offset: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      where: () => filtreIncidents(query),
      // Tri TOUJOURS défini, et départagé par `id` : sans tri, PostgreSQL rend les lignes dans
      // l'ordre qui l'arrange et deux pages successives répètent un incident en omettant un autre.
      // Une seule colonne ne suffit pas — deux incidents de même rang permutent d'un appel à l'autre.
      orderBy: (incident, { desc, asc }) => {
        const sens = query.order === 'asc' ? asc : desc
        const colonne = query.sort === 'createdAt'
          ? incident.createdAt
          : query.sort === 'knowledgeAt'
            ? incident.knowledgeAt
            : query.sort === 'severity'
              ? incident.severity
              : incident.updatedAt
        return [sens(colonne), sens(incident.id)]
      },
    })

    return lignes
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: QueryListe,
    detail: {
      summary: 'Obtenir la liste des incidents',
      description: 'Récupère la liste des incidents avec pagination et possibilité de filtrer par ID, type, statut et sévérité.'
    },
    response: {
      200: t.Array(_selectIncident)
    }
  })
  // Liste paginée et son total, DANS LE MÊME APPEL : deux requêtes lisent à deux instants et
  // peuvent se contredire — « 3 incidents » au-dessus d'une liste qui en montre 4. `GET /`
  // reste, pour ne rien casser.
  .get('/liste', async ({ query }) => {
    const pageSize = query.pageSize ?? 10
    const filtre = filtreIncidents(query)

    const lignes = await db.query.incident.findMany({
      limit: pageSize,
      offset: ((query.page ?? 1) - 1) * pageSize,
      where: () => filtre,
      orderBy: (incident, { desc, asc }) => {
        const sens = query.order === 'asc' ? asc : desc
        const colonne = query.sort === 'createdAt'
          ? incident.createdAt
          : query.sort === 'knowledgeAt'
            ? incident.knowledgeAt
            : query.sort === 'severity'
              ? incident.severity
              : incident.updatedAt
        return [sens(colonne), sens(incident.id)]
      },
    })

    const [compte] = await db.select({ n: sql<number>`count(*)::int` })
      .from(mainSchema.incident)
      .where(filtre)

    // Machines et entités DE TOUTE LA PAGE en une requête, sur demande.
    //
    // Sans cela, replacer trente incidents dans leur contexte demande trente-et-un appels —
    // et l'appelant qui y renonce répond sans savoir si une machine critique était touchée.
    const machines = query.avecMachines
      ? await machinesParIncident(lignes.map(i => i.id))
      : null

    const sens = query.order ?? 'desc'
    return {
      total: compte?.n ?? 0,
      tri: `${query.sort ?? 'updatedAt'} ${sens}, id ${sens}`,
      resultats: lignes.map(i => ({
        ...i,
        // `niveau` À CÔTÉ de `severity`, toujours : la cellule parle en P1–P4, la base stocke
        // `critical`. Rendre la seule valeur technique fait conclure « pas de P1 » devant un P1.
        niveau: severityCode(i.severity),
        urlAbsolue: urlIncident(i.id),
        machines: machines?.get(i.id) ?? (query.avecMachines ? [] : undefined),
      })),
    }
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: QueryListeEnveloppe,
    response: {
      200: t.Object({
        total: t.Number({ description: 'Total des incidents correspondant aux filtres, indépendant de la pagination' }),
        tri: t.String({ description: 'Tri effectivement appliqué, clé de départage comprise' }),
        resultats: t.Array(t.Composite([_selectIncident, t.Object({
          niveau: t.String({ description: "Gravité dans le vocabulaire de la cellule : P1…P4. Même niveau que `severity`, autre écriture." }),
          urlAbsolue: t.String(),
          machines: t.Optional(t.Array(Machine)),
        })])),
      }),
    },
    detail: {
      summary: 'Liste des incidents avec leur total',
      description: "Rend `{ total, tri, resultats }`. Le total porte sur les filtres appliqués et se compte dans le même appel que la page : `GET /` et `GET /count` lisent à deux instants et peuvent se contredire. `urlAbsolue` est une adresse citable — un chemin relatif si aucune origine publique n'est déclarée, jamais une adresse reconstituée.",
    },
  })
  .get('/count', async ({ query }) => {
    // Le MÊME filtre que la liste, appelé et non recopié : trois copies divergeaient déjà
    // sur la gravité, et un total qui ne compte pas ce que la liste montre est un mensonge
    // discret.
    const [row] = await db.select({ total: count() })
      .from(mainSchema.incident)
      .where(filtreIncidents(query));
    return { total: row?.total ?? 0 };
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: QueryCompte,
    detail: {
      summary: 'Compter les incidents',
      description: 'Retourne le nombre total d\'incidents correspondant aux mêmes filtres que la liste (ID, type, statut, sévérité), indépendamment de la pagination.'
    },
  })
  .get('/:id', async ({ params, query, status }) => {
    const include = new Set(query.with ?? []);

    type IncidentFindFirstConfig = NonNullable<Parameters<typeof db.query.incident.findFirst>[0]>;
    type IncidentWithRelations = NonNullable<IncidentFindFirstConfig['with']>;
    const withRelations: IncidentWithRelations = {};

    if (include.has('createdByUser')) withRelations.createdByUser = true;
    if (include.has('createdBySvc')) withRelations.createdBySvc = true;
    if (include.has('extension')) withRelations.extension = true;
    if (include.has('artifacts')) withRelations.artifacts = true;

    if (include.has('logs')) {
      withRelations.logs = {
        columns: {
          incidentId: false,
          createdBy: false,
          createdBySvc: false,
        },
        with: {
          createdByUser: true,
          createdBySvc: true,
        },
      };
    }

    if (include.has('subscribers')) {
      withRelations.subscribers = {
        columns: {},
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      };
    }

    if (include.has('details')) {
      withRelations.ransomwareDetails = true;
      withRelations.dataBreachDetails = true;
      withRelations.ddosDetails = true;
      withRelations.intrusionDetails = true;
    }

    const incident = await db.query.incident.findFirst({
      where: (incident, { eq }) => eq(incident.id, params.id),
      columns: {
        createdBy: false,
        createdBySvc: false,
      },
      with: {
        ...withRelations,
        // Toujours joint, pas sur demande : « pris en charge » sans dire par qui ne répond
        // pas à la question. Colonnes réduites au strict nécessaire à l'affichage.
        pilotUser: { columns: { id: true, name: true } },
        malwareDetails: true,
        phishingDetails: true,
        affectedUsers: {
          with: {
            phishingIdentities: true,
            connectionLogs: {
              with: {
                actions: true
              }
            }
          }
        },
      }
    });

    if (!incident) {
      return status(404, 'Incident non trouvé');
    }

    return incident
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    params: t.Object({
      id: t.String(),
    }),
    query: t.Object({
      with: t.Optional(t.Array(IncidentWithRelation, { description: 'Relations à inclure dans la réponse' }))
    }),
    detail: {
      summary: 'Obtenir les détails d\'un incident',
      description: 'Récupère les détails d\'un incident donné avec la possibilité d\'inclure les relations associées (créateur, logs, détails spécifiques au type, etc.)'
    },
  })
  .post('/', async ({ body, user, service_account, status }) => {
    const { details, createdAt, silent, knowledgeAt, referredAt, severity: severityInput, ...baseBody } = body

    // P1 / critical / Critique -> valeur technique. Refus explicite plutôt que silencieux :
    // une gravité mal écrite qui passerait en « low » serait pire qu'une erreur.
    const severity = normalizeSeverity(severityInput)
    if (!severity) {
      return status(422, { message: `Gravité « ${severityInput} » non reconnue. Écritures acceptées : ${SEVERITY_ACCEPTED_INPUTS}` })
    }

    // Une date sans fuseau vient d'une source interne et s'entend à l'heure de
    // l'établissement — pas à celle du process, qui tourne en UTC dans les conteneurs.
    const knowledgeDate = parseDateEtablissement(knowledgeAt)
    if (!knowledgeDate) {
      return status(422, { message: `Date de connaissance « ${String(knowledgeAt)} » illisible. Formats acceptés : « 2026-08-19 10:44:00 » (heure de l'établissement) ou une date ISO avec fuseau.` })
    }
    const referredDate = parseDateEtablissement(referredAt)
    const createdDate = parseDateEtablissement(createdAt)

    // Idempotence des imports : si l'externalId a déjà été importé, renvoyer l'existant (aucun doublon)
    if (baseBody.externalId) {
      const [existing] = await db.select().from(mainSchema.incident).where(eq(mainSchema.incident.externalId, baseBody.externalId)).limit(1)
      if (existing) return existing
    }

    const created = await db.transaction(async (tx) => {
      const [incidentObj] = await tx.insert(mainSchema.incident).values({
        ...baseBody,
        severity,
        knowledgeAt: knowledgeDate,
        // À défaut de saisine explicite : la date de création (rétro-datée le cas échéant).
        referredAt: referredDate ?? createdDate ?? undefined,
        // Rétro-datation (import d'historique) : createdAt ET updatedAt figés à la date fournie
        ...(createdDate ? { createdAt: createdDate, updatedAt: createdDate } : {}),
        createdBy: user?.id,
        createdBySvc: service_account?.id
      }).returning();

      if (!incidentObj) throw new Error('Échec de la création de l\'incident');

      // TODO: tester la requête avec n8n et vérifier que les identités et logs sont bien insérésk

      if (details) {
        if (details.type === 'malware') {
          const { detectedAt, users, ...malwareData } = details.data;
          if (users && users.length > 0) {
            await tx.insert(mainSchema.incidentUser).values(users.map(u => ({ incidentId: incidentObj.id, ...u, composanteCode: normaliserComposante(u.composante).code })));
          }
          await tx.insert(incidentsSchema.malwareIncident).values({
            incidentId: incidentObj.id,
            ...malwareData,
            detectedAt: parseDateEtablissement(detectedAt) ?? undefined,
          });
        } else if (details.type === 'ddos') {
          const { startedAt, endedAt, ...ddosData } = details.data;
          await tx.insert(incidentsSchema.ddosIncident).values({
            incidentId: incidentObj.id,
            ...ddosData,
            startedAt: parseDateEtablissement(startedAt) ?? undefined,
            endedAt: parseDateEtablissement(endedAt) ?? undefined,
          });
        } else if (details.type === 'ransomware') {
          const { detectedAt, ...ransomwareData } = details.data;
          await tx.insert(incidentsSchema.ransomwareIncident).values({
            incidentId: incidentObj.id,
            ...ransomwareData,
            detectedAt: parseDateEtablissement(detectedAt) ?? undefined,
          });
        } else if (details.type === 'data_breach') {
          const { detectedAt, ...dataBreachData } = details.data;
          await tx.insert(incidentsSchema.dataBreachIncident).values({
            incidentId: incidentObj.id,
            ...dataBreachData,
            detectedAt: parseDateEtablissement(detectedAt) ?? undefined,
          });
        } else if (details.type === 'network_intrusion') {
          const { detectedAt, ...intrusionData } = details.data;
          await tx.insert(incidentsSchema.intrusionIncident).values({
            incidentId: incidentObj.id,
            ...intrusionData,
            detectedAt: parseDateEtablissement(detectedAt) ?? undefined,
          });
        } else if (details.type === 'other') {
          await tx.insert(mainSchema.incidentExtension).values({ incidentId: incidentObj.id, ...details.data });
        } else if (details.type === 'phishing') {
          const { detectedAt, ...phishingDetailData } = details.data;


          const [incidentUser] = await tx.insert(mainSchema.incidentUser).values({ incidentId: incidentObj.id, ...details.data.user, composanteCode: normaliserComposante(details.data.user.composante).code }).returning()
          if (!incidentUser) throw new Error('Échec de la création de l\'utilisateur');
          await tx.insert(phishingSchema.phishingDetail).values({ incidentId: incidentObj.id, detectedAt: parseDateEtablissement(detectedAt) ?? undefined, ...phishingDetailData })

          if (details.data.identities && details.data.identities.length > 0) {
            await tx.insert(phishingSchema.phishingIdentity).values(details.data.identities.map(identity => ({
              ...identity,
              concernedUser: incidentUser.id,
              createdAt: parseDateEtablissement(identity.createdAt) ?? undefined,
            })));
          }
          if (details.data.logs && details.data.logs.length > 0) {
            const logs = await tx.insert(phishingSchema.phishingConnectionLog).values(details.data.logs.map(log => ({
              ipAddress: log.ipAddress,
              countryCode: log.countryCode,
              countryName: log.countryName,
              activityStart: parseDateEtablissement(log.activityStart) ?? undefined,
              activityEnd: parseDateEtablissement(log.activityEnd) ?? undefined,
              concernedUser: incidentUser.id
            }))).returning();

            if (details.data.logs.some(log => !log.actions || log.actions.length === 0)) {
              console.warn('Some logs do not have actions:', details.data.logs.filter(log => !log.actions || log.actions.length === 0));
            }

            const connectionActions = logs.flatMap(log => {
              const originalLog = details.data.logs.find(l =>
                l.ipAddress === log.ipAddress &&
                parseDateEtablissement(l.activityStart)?.toISOString() === parseDateEtablissement(log.activityStart)?.toISOString()
              );
              return originalLog?.actions?.map(action => ({
                connectionLogId: log.id,
                actionType: action.actionType,
                amount: action.amount,
                additionalInfo: action.additionalInfo,
                label: action.label,
              })) || [];
            });

            if (connectionActions.length > 0) {
              await tx.insert(phishingSchema.phishingConnectionAction).values(connectionActions);
            }
          }
        }
      }

      return incidentObj;
    });

    // Journalise la création — silencieux pour un import (ni notif push ni relais webhook)
    await createLog(created.id, 'created', user?.id, service_account?.id, undefined, undefined, { silent: !!silent })
    return created;
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    body: IncidentPayload,
    detail: {
      summary: 'Créer un nouvel incident',
      description: 'Crée un nouvel incident avec les informations de base et les données spécifiques au type d\'incident.'
    }
  })
  .post('/:id/log', async ({ params, body, user, service_account }) => await createLog(params.id, body.type, user?.id, service_account?.id), {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: t.Object({
      id: t.String(),
    }),
    body: t.Omit(_createIncidentLog, ['id', 'incidentId', 'createdAt', 'updatedAt', 'createdBy', 'createdBySvc']),
    detail: {
      summary: 'Ajouter un log à un incident',
      description: 'Ajoute un log à un incident donné en fournissant le message et le type du log.'
    },
    response: {
      200: 'Log'
    }
  })
  .patch('/:id', async ({ params, body, user, service_account }) => {
    return await db.transaction(async (tx) => {
      const { details, ...baseBody } = body

      // État avant modif, pour journaliser le détail des changements
      const before = await tx.query.incident.findFirst({
        where: (i, { eq }) => eq(i.id, params.id),
        columns: { type: true, status: true, severity: true, description: true, source: true, resolution: true },
      });

      if (Object.keys(baseBody).length > 0) {
        await tx.update(mainSchema.incident)
          .set(baseBody)
          .where(eq(mainSchema.incident.id, params.id));
      }

      // Snapshot du détail AVANT mise à jour, pour journaliser précisément les champs modifiés
      let detailBefore: Record<string, unknown> | undefined;
      if (details && Object.keys(details.data).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- union de tables de détail
        const dt = DETAIL_TABLES[details.type] as any;
        const [row] = await tx.select().from(dt).where(eq(dt.incidentId, params.id));
        detailBefore = row;
      }

      // Met à jour les colonnes scalaires du détail spécifique au type.
      // Le row de détail existe déjà (édition d'un incident existant) → UPDATE ciblé.
      // NB: les sous-entités (user malware / users data_breach / identités+logs phishing)
      // ne sont pas encore prises en charge ici, seulement les champs scalaires.
      if (details && Object.keys(details.data).length > 0) {
        if (details.type === 'malware') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- on exclut la sous-entité users du set scalaire
          const { users: _users, detectedAt, ...rest } = details.data
          const set = { ...rest, ...(detectedAt ? { detectedAt: parseDateEtablissement(detectedAt) ?? undefined } : {}) }
          if (Object.keys(set).length > 0)
            await tx.update(incidentsSchema.malwareIncident).set(set).where(eq(incidentsSchema.malwareIncident.incidentId, params.id));
        } else if (details.type === 'ddos') {
          const { startedAt, endedAt, ...rest } = details.data
          const set = { ...rest, ...(startedAt ? { startedAt: parseDateEtablissement(startedAt) ?? undefined } : {}), ...(endedAt ? { endedAt: parseDateEtablissement(endedAt) ?? undefined } : {}) }
          if (Object.keys(set).length > 0)
            await tx.update(incidentsSchema.ddosIncident).set(set).where(eq(incidentsSchema.ddosIncident.incidentId, params.id));
        } else if (details.type === 'ransomware') {
          const { detectedAt, ...rest } = details.data
          const set = { ...rest, ...(detectedAt ? { detectedAt: parseDateEtablissement(detectedAt) ?? undefined } : {}) }
          if (Object.keys(set).length > 0)
            await tx.update(incidentsSchema.ransomwareIncident).set(set).where(eq(incidentsSchema.ransomwareIncident.incidentId, params.id));
        } else if (details.type === 'data_breach') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- on exclut la sous-entité users du set scalaire
          const { users: _users, detectedAt, ...rest } = details.data
          const set = { ...rest, ...(detectedAt ? { detectedAt: parseDateEtablissement(detectedAt) ?? undefined } : {}) }
          if (Object.keys(set).length > 0)
            await tx.update(incidentsSchema.dataBreachIncident).set(set).where(eq(incidentsSchema.dataBreachIncident.incidentId, params.id));
        } else if (details.type === 'network_intrusion') {
          const { detectedAt, ...rest } = details.data
          const set = { ...rest, ...(detectedAt ? { detectedAt: parseDateEtablissement(detectedAt) ?? undefined } : {}) }
          if (Object.keys(set).length > 0)
            await tx.update(incidentsSchema.intrusionIncident).set(set).where(eq(incidentsSchema.intrusionIncident.incidentId, params.id));
        } else if (details.type === 'phishing') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- on exclut les sous-entités (identités/logs/user) du set scalaire
          const { identities: _identities, logs: _logs, user: _user, detectedAt, ...rest } = details.data
          const set = { ...rest, ...(detectedAt ? { detectedAt: parseDateEtablissement(detectedAt) ?? undefined } : {}) }
          if (Object.keys(set).length > 0)
            await tx.update(phishingSchema.phishingDetail).set(set).where(eq(phishingSchema.phishingDetail.incidentId, params.id));
        } else if (details.type === 'other') {
          await tx.update(mainSchema.incidentExtension).set(details.data).where(eq(mainSchema.incidentExtension.incidentId, params.id));
        }
      }

      // Construit le message de log + le détail structuré des changements (relayé aux webhooks)
      const changes: string[] = [];
      const structuredChanges: { field: string, from: unknown, to: unknown }[] = [];
      if (before) {
        if (baseBody.status !== undefined && baseBody.status !== before.status) {
          changes.push(`Statut : ${statusLabel(before.status)} → ${statusLabel(baseBody.status)}`);
          structuredChanges.push({ field: 'status', from: before.status, to: baseBody.status });
        }
        if (baseBody.severity !== undefined && baseBody.severity !== before.severity) {
          changes.push(`Sévérité : ${severityLabel(before.severity)} → ${severityLabel(baseBody.severity)}`);
          structuredChanges.push({ field: 'severity', from: before.severity, to: baseBody.severity });
        }
        if (baseBody.type !== undefined && baseBody.type !== before.type) {
          changes.push(`Type : ${before.type} → ${baseBody.type}`);
          structuredChanges.push({ field: 'type', from: before.type, to: baseBody.type });
        }
        if (baseBody.description !== undefined && baseBody.description !== before.description) {
          changes.push('Description modifiée');
          // Pas le texte complet (trop long) — la description à jour est dans incident.description
          structuredChanges.push({ field: 'description', from: null, to: null });
        }
        if (baseBody.source !== undefined && baseBody.source !== before.source) {
          changes.push('Source modifiée');
          structuredChanges.push({ field: 'source', from: before.source, to: baseBody.source });
        }
        if (baseBody.resolution !== undefined && baseBody.resolution !== before.resolution) {
          changes.push(`Résolution : ${resolutionLabel(before.resolution)} → ${resolutionLabel(baseBody.resolution)}`);
          structuredChanges.push({ field: 'resolution', from: before.resolution, to: baseBody.resolution });
        }
      }
      // Détail des champs de détail modifiés (date de détection, IP, machine, etc.)
      if (details && detailBefore) {
        const SUB_ENTITIES = new Set(['user', 'users', 'identities', 'logs']);
        const changedFields: string[] = [];
        for (const [field, to] of Object.entries(details.data)) {
          if (SUB_ENTITIES.has(field)) continue;
          const from = detailBefore[field];
          if (JSON.stringify(normalizeForDiff(from)) === JSON.stringify(normalizeForDiff(to))) continue;
          changedFields.push(DETAIL_FIELD_LABELS[field] ?? field);
          structuredChanges.push({ field, from: from ?? null, to });
        }
        if (changedFields.length > 0) changes.push(`Détails : ${changedFields.join(', ')}`);
      }

      await createLog(params.id, 'update', user?.id, service_account?.id, changes.length > 0 ? changes.join(' · ') : undefined, structuredChanges.length > 0 ? structuredChanges : undefined);

      return { success: true, id: params.id };
    });
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: t.Object({
      id: t.String(),
    }),
    body: IncidentUpdatePayload,
    detail: {
      summary: 'Modifier un incident',
      description: 'Met à jour les champs de base d\'un incident (statut, sévérité, description, source) et/ou les champs scalaires de ses détails par type. Les changements sont résumés dans la timeline.'
    }
  })
  // ARCHIVER, AU LIEU DE SUPPRIMER : la suppression effaçait en cascade douze tables —
  // exclusions et échéances réglementaires comprises — et laissait les fichiers orphelins.
  // L'incident archivé quitte les listes, garde son dossier et reste consultable par son id.
  .delete('/:id', async ({ params, body, user, status }) => {
    const motif = body.motif.trim()
    if (!motif) return status(422, { message: "Le motif d'archivage est obligatoire." })

    const [archive] = await db.update(mainSchema.incident)
      .set({ archiveLe: new Date(), archivePar: user?.id ?? null, motifArchive: motif })
      .where(and(eq(mainSchema.incident.id, params.id), isNull(mainSchema.incident.archiveLe)))
      .returning({ id: mainSchema.incident.id })
    if (!archive) return status(404, { message: 'Incident introuvable ou déjà archivé' })

    await createLog(params.id, 'archive', user?.id, undefined, `Incident archivé : ${motif}`, undefined, { silent: true })
    return { id: archive.id, archive: true }
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ motif: t.String({ description: "Pourquoi l'incident est archivé. Obligatoire." }) }),
    detail: {
      summary: 'Archiver un incident',
      description: "L'incident quitte les listes, les décomptes et les statistiques, mais son dossier est conservé et reste consultable par son identifiant. La suppression définitive est une autre opération, réservée aux administrateurs.",
    },
  })
  .post('/:id/desarchiver', async ({ params, user, status }) => {
    const [remis] = await db.update(mainSchema.incident)
      .set({ archiveLe: null, archivePar: null, motifArchive: null })
      .where(eq(mainSchema.incident.id, params.id))
      .returning({ id: mainSchema.incident.id })
    if (!remis) return status(404, { message: 'Incident introuvable' })
    await createLog(params.id, 'archive', user?.id, undefined, 'Incident désarchivé', undefined, { silent: true })
    return { id: remis.id, archive: false }
  }, {
    auth: ['admin'],
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Désarchiver un incident' },
  })
  // SUPPRESSION DÉFINITIVE — au terme de la durée de conservation seulement.
  //
  // Deux verrous : l'incident doit être archivé d'abord, et un motif est exigé. La trace est
  // écrite AVANT l'effacement, dans le journal d'audit qui, lui, ne dépend pas de l'incident.
  .delete('/:id/definitif', async ({ params, body, user, status }) => {
    const motif = body.motif.trim()
    if (!motif) return status(422, { message: 'Le motif de suppression définitive est obligatoire.' })

    const [incident] = await db.select({ id: mainSchema.incident.id, archiveLe: mainSchema.incident.archiveLe })
      .from(mainSchema.incident).where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable' })
    if (!incident.archiveLe) return status(409, { message: "Archivez l'incident avant de le supprimer définitivement." })

    await db.insert(mainSchema.auditLog).values({
      table_name: 'incident',
      row_id: params.id,
      action: 'suppression_definitive',
      actor_user: user?.id,
      details: { motif, archiveLe: incident.archiveLe.toISOString() },
    })

    await db.delete(mainSchema.incident).where(eq(mainSchema.incident.id, params.id))

    // Les fichiers après la base : un échec ici laisse des fichiers orphelins, jamais un
    // incident sans ses pièces. Il est signalé, pas tu.
    try {
      await rm(`./uploads/${params.id}`, { recursive: true, force: true })
    }
    catch (e) {
      console.error(`❌ Incident ${params.id} supprimé, mais ses fichiers n'ont pas pu l'être :`, e instanceof Error ? e.message : e)
    }
    return { id: params.id, supprime: true }
  }, {
    auth: ['admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ motif: t.String({ description: 'Pourquoi la suppression est définitive. Obligatoire.' }) }),
    detail: {
      summary: 'Supprimer définitivement un incident archivé',
      description: "Réservé aux administrateurs, sur un incident déjà archivé, avec motif. Efface l'incident, ses données liées et ses fichiers. La trace est conservée dans le journal d'audit.",
    },
  })
