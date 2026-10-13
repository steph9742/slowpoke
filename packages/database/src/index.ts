import { drizzle } from 'drizzle-orm/node-postgres';
import * as authSchema from './schemas/auth-schema'
import * as mainSchema from './schemas/schema'
import * as phishingSchema from './schemas/phishing'
import * as incidentsSchema from './schemas/incidents'
import * as subscriptionsSchema from './schemas/subscriptions';
import * as webhooksSchema from './schemas/webhooks';
import * as exclusionsSchema from './schemas/exclusions';

const db = drizzle(process.env.DATABASE_URL!, {
    schema: {
        ...mainSchema,
        ...authSchema,
        ...phishingSchema,
        ...incidentsSchema,
        ...subscriptionsSchema,
        ...webhooksSchema,
        ...exclusionsSchema
    },
});

const query_builder = drizzle(process.env.READONLY_DATABASE_URL!, {
    schema: {
        ...mainSchema,
        ...phishingSchema,
        ...incidentsSchema
    },
})

export { db, query_builder }