import Elysia, { t } from "elysia";
import { db } from "@slowpoke/database";
import { betterAuth } from "../middleware/auth";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { mainSchema } from "@slowpoke/database/tables"

const allowedLogTypes = [
    'update',
    'comment',
    'status_change',
    'other',
    'created',
    'artifact_added',
    'artifact_removed',
    'user_added',
    'user_removed',
    'extension_updated',
] as const;

const buildWhereCondition = (queryParams: {
    logTypes?: string | string[];
    incidentId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
}) => {
    const normalizedLogTypes = (Array.isArray(queryParams.logTypes)
        ? queryParams.logTypes
        : queryParams.logTypes
            ? queryParams.logTypes.split(',')
            : []
    ).filter((logType): logType is (typeof allowedLogTypes)[number] => {
        return allowedLogTypes.includes(logType as (typeof allowedLogTypes)[number]);
    });

    const dateFrom = queryParams.dateFrom ? new Date(queryParams.dateFrom) : null;
    const dateTo = queryParams.dateTo ? new Date(queryParams.dateTo) : null;

    return and(
        normalizedLogTypes.length > 0 ? inArray(mainSchema.incidentLog.type, normalizedLogTypes) : undefined,
        queryParams.incidentId ? eq(mainSchema.incidentLog.incidentId, queryParams.incidentId) : undefined,
        queryParams.userId ? eq(mainSchema.incidentLog.createdBy, queryParams.userId) : undefined,
        dateFrom && !Number.isNaN(dateFrom.getTime()) ? gte(mainSchema.incidentLog.createdAt, dateFrom) : undefined,
        dateTo && !Number.isNaN(dateTo.getTime()) ? lte(mainSchema.incidentLog.createdAt, dateTo) : undefined,
    );
};

export const timelineRouter = new Elysia({ name: 'timeline', prefix: '/api/timeline' })
    .use(betterAuth)
    .get('/', async ({ query }) => {
        return await db.query.incidentLog.findMany({
            where: buildWhereCondition(query),
            orderBy: [desc(mainSchema.incidentLog.createdAt)],
            limit: query.limit || 50,
            with: {
                createdByUser: {
                    columns: {
                        id: true,
                        name: true,
                        image: true,
                    }
                },
                createdBySvc: {
                    columns: {
                        id: true,
                        name: true,
                    }
                }
            },
            columns: {
                createdBy: false,
                createdBySvc: false,
            },
        })
    }, {
        auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
        query: t.Object({
            dateFrom: t.Optional(t.String({ description: 'Date de début au format ISO 8601' })),
            dateTo: t.Optional(t.String({ description: 'Date de fin au format ISO 8601' })),
            logTypes: t.Optional(t.String({ description: 'Types de log à filtrer, séparés par des virgules (ex: update,comment). Valeurs possibles : update, comment, status_change, other, created, artifact_added, artifact_removed, user_added, user_removed, extension_updated.' })),
            incidentId: t.Optional(t.String({ description: 'ID de l\'incident' })),
            userId: t.Optional(t.String({ description: 'ID de l\'utilisateur' })),
            limit: t.Optional(t.Number({ description: 'Nombre maximum de logs à retourner (par défaut 50)' })),
        }),
        detail: {
            summary: 'Obtenir la timeline des incidents',
            description: 'Récupère la timeline des incidents avec possibilité de filtrer par type de log, incident, utilisateur et période. Les logs sont retournés avec les informations de l\'utilisateur ou du service account qui a créé le log.'
        }
    })
