import { t, Elysia } from "elysia";
import { betterAuth } from "./middleware/auth";
import { limiteurConnexion, secoursOuvert } from "./middleware/limiteurConnexion";
import { cors } from "@elysiajs/cors";
import { queryBuilderRouter } from "./routers/queryBuilder";
import { timelineRouter } from "./routers/timeline";
import { notificationsRouter } from "./routers/notifications";
import { incidentsRouter } from "./routers/incidents";
import { artifactsRouter } from "./routers/artifacts";
import { openapi } from "@elysia/openapi";
import { usersRouter } from "./routers/users";
import { statsRouter } from "./routers/stats";
import { chartsRouter } from "./routers/charts";
import { phishingRouter } from "./routers/phishing";
import { webhooksRouter } from "./routers/webhooks";
import { accountsRouter } from "./routers/accounts";
import { secoursRouter } from "./routers/secours";
import { pilotRouter } from "./routers/pilot";
import { exclusionsRouter } from "./routers/exclusions";
import { correlationRouter } from "./routers/correlation";
import { settingsRouter } from "./routers/settings";
import { conduiteRouter } from "./routers/conduite";
import { analysesRouter, chatRouter } from "./routers/analyses";
import { machinesRouter } from "./routers/machines";
import { rapprochementRouter } from "./routers/rapprochement";
import { indicateursRouter } from "./routers/indicateurs";
import { enqueteRouter } from "./routers/enquete";
import { alertesRouter } from './routers/alertes';
import { demarrerSurveillance } from "./utils/surveillance";
import { demarrerRevueListesBlanches } from './utils/revueListesBlanches';
import { demarrerPurgeAlertes } from './utils/alertes';
import { demarrerImportAdvens } from "./utils/advens";
import { demarrerSyncPlaybooks } from "./utils/playbooks";
import { demarrerSyncGlpi } from "./utils/glpi";
import { demarrerSyncHfl } from "./utils/harfanglab";
import { brancherAuditConnecteurs } from "./utils/auditConnecteurs";
import { healthcheck, VERSION } from "./utils/status";

const app = new Elysia()
  // Limiteur AVANT better-auth : il doit intercepter la tentative avant la vérification
  // du mot de passe, sinon il ne freine rien.
  .use(limiteurConnexion)
  // Ce que le frontend doit savoir avant toute connexion : quelles voies sont ouvertes.
  // Public par nécessité — la page de connexion s'affiche avant toute authentification.
  .get('/api/auth-config', () => ({
    sso: !!(process.env.OIDC_CLIENT_ID || process.env.OUATE_CLIENT_ID),
    // Le libellé du bouton de connexion : le nom du fournisseur d'identité varie d'un
    // établissement à l'autre, et le changer ne doit pas demander un rebuild du frontend.
    ssoLibelle: process.env.OIDC_PROVIDER_LABEL?.trim() || 'Connexion SSO',
    secours: secoursOuvert(),
  }), { detail: { hide: true } })
  .use(openapi({
    documentation: {
      info: {
        title: 'Slowpoke API',
        description: 'API pour l\'application Slowpoke. Toutes les requêtes nécessitent une authentification par compte utilisateur ou compte de service',
        version: VERSION,
      },
      tags: [
        { name: 'Incidents', description: 'Gestion des incidents : CRUD, détails par type, logs et suppression (admin/gestionnaire)' },
        { name: 'Phishing', description: 'Sous-entités phishing : identités usurpées et logs d\'activité rattachés à chaque utilisateur concerné' },
        { name: 'Utilisateurs', description: 'Utilisateurs concernés par un incident (table incident_user)' },
        { name: 'Artéfacts et fichiers', description: 'Pièces jointes et artéfacts d\'un incident' },
        { name: 'Exclusions', description: "Listes blanches : inventaire des angles morts volontaires, motif et échéance obligatoires. Deux moitiés — les exclusions nées d'un incident, et les revues de règles posées hors incident (`/revues`)" },
        { name: 'Listes blanches', description: "Rapprochement entre les exclusions consignées et les règles réellement posées dans l'EDR, et inventaire de ces règles" },
        { name: 'Enquête', description: "Étapes outillées des checklists : lancement d'une recherche en lecture seule et verdict, avec la version exacte de la requête employée" },
        { name: 'Indicateurs', description: "« Est-ce que ceci est déjà connu ? » — une valeur cherchée dans les incidents, les listes blanches et l'inventaire, chaque source disant ce qu'elle a trouvé ou pourquoi elle n'a pas pu répondre" },
        { name: 'Conduite à tenir', description: "Procédure applicable à un incident, cases de la checklist et échéances réglementaires" },
        { name: 'Machines', description: "Machines concernées par un incident et jointure avec l'inventaire GLPI" },
        { name: 'Assistance', description: "Analyses et conversations avec le modèle local. Les sorties sont stockées à part, jamais écrites dans les champs de l'incident" },
        { name: 'Réglages', description: "Branchement des connecteurs (SOC, procédures, inventaire, EDR, annuaire, archives Wazuh, assistance). Aucun secret n'est jamais renvoyé (réservé aux admins)" },
        { name: 'Comptes', description: 'Gestion des comptes et attribution des rôles applicatifs (réservé aux admins)' },
        { name: 'Webhooks', description: 'Webhooks sortants : relais des événements d\'incident vers n8n ou toute URL externe' },
        { name: 'Statistiques', description: 'Agrégats et séries temporelles pour les tableaux de bord' },
        { name: 'Graphiques', description: 'Graphiques personnalisés (query builder)' },
      ]
    }
  }))
  .use(betterAuth)
  .use(cors({
    origin: process.env.TRUSTED_ORIGINS?.split(",") || [],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }))
  // Les réponses de l'API ne se mettent pas en cache.
  //
  // Sans en-tête, un navigateur peut conserver un GET selon sa propre heuristique et le
  // resservir après une écriture : l'API confirme l'enregistrement, la base le contient, et
  // l'écran continue d'afficher l'ancienne valeur au rechargement. Le défaut ne se voit que
  // sur les réglages qui changent — ceux qu'on ne touche jamais paraissent corrects.
  .onAfterHandle(({ set }) => {
    set.headers['cache-control'] ??= 'no-store'
  })
  .onError(({ code, error, request }) => {
    console.error(`❌ [${code}] ${request.method} ${new URL(request.url).pathname} —`, error instanceof Error ? (error.stack ?? error.message) : String(error))
  })
  .use(secoursRouter)
  .use(pilotRouter)
  .use(exclusionsRouter)
  .use(correlationRouter)
  .use(settingsRouter)
  .use(conduiteRouter)
  .use(analysesRouter)
  .use(chatRouter)
  .use(machinesRouter)
  .use(rapprochementRouter)
  .use(indicateursRouter)
  .use(enqueteRouter)
  .use(alertesRouter)
  .use(queryBuilderRouter)
  .use(timelineRouter)
  .use(notificationsRouter)
  .use(incidentsRouter)
  .use(artifactsRouter)
  .use(usersRouter)
  .use(statsRouter)
  .use(chartsRouter)
  .use(phishingRouter)
  .use(webhooksRouter)
  .use(accountsRouter)
  .get("/health", ({ query }) => healthcheck(query.details), {
    query: t.Object({
      details: t.Optional(t.Boolean())
    })
  })
  // `idleTimeout` : Bun ferme une connexion restée sans échange. Pendant qu'un modèle
  // local réfléchit, la connexion EST inactive — rien ne transite. Le défaut coupe donc
  // les analyses longues, sans erreur côté serveur puisque le traitement continue : le
  // navigateur reçoit une connexion fermée sans corps, et rien n'est journalisé.
  // 255 s est le maximum accepté par Bun.
  .listen({ port: Number(process.env.PORT || 4000), idleTimeout: 255 });

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// Fermeture automatique des incidents dont la surveillance est échue. Règle métier de
// l'application : la déporter dans n8n créerait une panne silencieuse si l'outil s'arrête.
// Avant les synchronisations : leurs premiers échecs doivent déjà être tracés.
brancherAuditConnecteurs();
demarrerSurveillance();
demarrerRevueListesBlanches();
demarrerPurgeAlertes();
demarrerImportAdvens();
demarrerSyncPlaybooks();
demarrerSyncGlpi();
demarrerSyncHfl();

export type App = typeof app;