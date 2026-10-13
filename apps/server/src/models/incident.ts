import { incidentsSchema, mainSchema, phishingSchema } from "@slowpoke/database/tables"
import { createInsertSchema, createSelectSchema } from "drizzle-typebox"
import { t } from "elysia"

const dateType = t.Optional(t.Union([t.String(), t.Date(), t.Null()]))

const _malwareDetails = createInsertSchema(incidentsSchema.malwareIncident, { detectedAt: dateType })
const _dataBreachDetails = createInsertSchema(incidentsSchema.dataBreachIncident, { detectedAt: dateType })
const _ddosDetails = createInsertSchema(incidentsSchema.ddosIncident, { startedAt: dateType, endedAt: dateType })
const _ransomwareDetails = createInsertSchema(incidentsSchema.ransomwareIncident, { detectedAt: dateType })
const _intrusionDetails = createInsertSchema(incidentsSchema.intrusionIncident, { detectedAt: dateType })
const _otherDetails = createInsertSchema(mainSchema.incidentExtension)

const _phishingDetails = createInsertSchema(phishingSchema.phishingDetail, { detectedAt: dateType })
const _phishingLog = createInsertSchema(phishingSchema.phishingConnectionLog, { activityStart: dateType, activityEnd: dateType })
export const _phishingLogAction = createInsertSchema(phishingSchema.phishingConnectionAction)
const _phishingIdentity = createInsertSchema(phishingSchema.phishingIdentity, { createdAt: dateType })

const _incidentUser = createInsertSchema(mainSchema.incidentUser)

const PhishingDetails = t.Intersect([
  t.Omit(_phishingDetails, ['id', 'incidentId']),
  t.Object({
    identities: t.Array(t.Omit(_phishingIdentity, ['id', 'concernedUser'])),
    logs: t.Array(t.Intersect([
      t.Omit(_phishingLog, ['id', 'concernedUser']),
      t.Optional(t.Object({
        actions: t.Array(t.Omit(_phishingLogAction, ['id', 'connectionLogId'])),
      })),
    ])),
    user: t.Omit(_incidentUser, ['id', 'incidentId']),
  }),
])

const MalwareDetails = t.Intersect([
  t.Omit(_malwareDetails, ['id', 'incidentId']),
  t.Object({
    users: t.Array(t.Omit(_incidentUser, ['id', 'incidentId'])),
  }),
])

const DataBreachDetails = t.Intersect([
  t.Omit(_dataBreachDetails, ['id', 'incidentId']),
  t.Object({
    users: t.Array(t.Omit(_incidentUser, ['id', 'incidentId'])),
  })
])

const DDoSDetails = t.Omit(_ddosDetails, ['id', 'incidentId']);
const RansomwareDetails = t.Omit(_ransomwareDetails, ['id', 'incidentId']);
const IntrusionDetails = t.Omit(_intrusionDetails, ['id', 'incidentId']);
const OtherDetails = t.Omit(_otherDetails, ['id', 'incidentId']);

const _selectIncident = createSelectSchema(mainSchema.incident)

const _selectLog = createSelectSchema(mainSchema.incidentLog)

export {
  PhishingDetails,
  MalwareDetails,
  DDoSDetails,
  RansomwareDetails,
  DataBreachDetails,
  IntrusionDetails,
  OtherDetails,
  _selectIncident,
  _selectLog
}