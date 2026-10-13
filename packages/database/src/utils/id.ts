import { init } from '@paralleldrive/cuid2'

const createIncidentId = init({
    length: 6
})

const createIncidentLogId = init({
    length: 10,
})

const createAuditLogId = init({
    length: 16,    
})

export { createIncidentId, createIncidentLogId, createAuditLogId }