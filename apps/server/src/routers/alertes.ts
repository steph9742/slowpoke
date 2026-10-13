import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import {
  ingererAlerte, trierAlerte, escaladerAlerte, listerAlertes, lireAlerte, etatFile,
  debitDepasse, DEBIT_MAX_PAR_MINUTE, SEUIL_INGESTION_DEFAUT, pourApi,
  statistiquesAlertes, listerSilences, poserSilence, leverSilence, ecarterEnMasse, rouvrirEnMasse,
  demanderAvis, converserSurAlerte, poserConnaissance, retirerConnaissance, connaissancesDe,
} from '../utils/alertes'

// FILE DE TRIAGE — l'API de l'onglet « Alertes ».
//
// Le contrat est celui qu'écrit l'émetteur (champs en anglais) ; la traduction vers les
// colonnes se fait dans `utils/alertes.ts`. Un compte de service peut déposer une alerte,
// jamais l'écarter ni l'escalader.

const Statut = t.Union([t.Literal('nouvelle'), t.Literal('en_cours'), t.Literal('ecartee'), t.Literal('escaladee')])
const MotifEcart = t.Union([
  t.Literal('faux_positif'), t.Literal('benin'), t.Literal('bruit_connu'),
  t.Literal('doublon'), t.Literal('hors_perimetre'),
])

export const alertesRouter = new Elysia({ name: 'alertes', prefix: '/api/alerts', tags: ['Alertes'] })
  .use(betterAuth)

  .post('/', async ({ body, user, service_account, status, server, request }) => {
    // Une source qui s'emballe ne doit pas noyer la base : le compteur porte sur l'émetteur,
    // pas sur l'adresse, pour qu'un relais partagé ne pénalise pas les autres.
    const cle = service_account?.id ?? user?.id ?? server?.requestIP(request)?.address ?? 'inconnu'
    if (debitDepasse(cle)) {
      return status(429, { message: `Débit dépassé : ${DEBIT_MAX_PAR_MINUTE} alertes par minute au plus.` })
    }

    const r = await ingererAlerte(body, { userId: user?.id, svcId: service_account?.id })
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    if (r.etat === 'creee') status(201)
    return { etat: r.etat, alerte: pourApi(r.alerte) }
  }, {
    auth: ['svc', 'gestionnaire', 'admin'],
    body: t.Object({
      source: t.Optional(t.Union([t.Literal('wazuh'), t.Literal('n8n'), t.Literal('manuel')], { description: 'Émetteur. `wazuh` par défaut.' })),
      ruleId: t.String({ description: "Identifiant de la règle dans l'outil, ex. `31168`." }),
      ruleDescription: t.String({ description: 'Libellé de la règle.' }),
      level: t.Number({ description: `Niveau de la source, 0 à 16. En dessous du seuil d'ingestion (${SEUIL_INGESTION_DEFAUT} par défaut, réglable dans les paramètres), l'alerte est refusée en 422 : refusée explicitement, jamais avalée en silence. Le seuil en vigueur est rendu par \`GET /api/alerts/etat\`.` }),
      machine: t.String({ description: "Agent ou émetteur syslog réel." }),
      sourceIps: t.Optional(t.Array(t.String(), { description: 'Adresses à l\'origine. Elles s\'accumulent sur les occurrences suivantes.' })),
      username: t.Optional(t.String({ description: 'Compte concerné, s\'il est connu.' })),
      mitre: t.Optional(t.Array(t.String(), { description: 'Techniques ATT&CK, ex. `["T1068"]`. Accumulées comme les adresses.' })),
      observedAt: t.String({ description: "Horodatage de l'ALERTE, jamais l'heure de l'appel : c'est lui qui datera la connaissance de l'incident en cas d'escalade. Absent ou illisible : 422." }),
      dashboardUrl: t.Optional(t.String({ description: "Retour vers l'alerte dans l'outil. Gardée seulement si `https` (et, quand il est configuré, sur l'hôte attendu)." })),
      rawLog: t.Optional(t.String({ description: 'Log brut, tronqué à 2 ko : pièce de contexte, pas stockage de journaux.' })),
      context: t.Optional(t.Record(t.String(), t.Unknown(), { description: 'Contexte plat (url, code HTTP, relais syslog…), borné à 20 clés.' })),
    }),
    detail: {
      summary: 'Déposer une alerte (idempotent)',
      description: "Le panier de regroupement — `source:règle:machine:jour` — est calculé par le serveur, en heure de Paris : un émetteur ne peut donc pas scinder une série, et une récidive le lendemain est une alerte neuve. Une alerte déjà connue incrémente ses occurrences et avance `lastSeen` ; `firstSeen` ne bouge jamais. **Une alerte écartée n'est pas rouverte** par une occurrence — c'est ce qui rend l'écartement utile. Si elle est escaladée, l'occurrence est inscrite dans la chronologie de l'incident. Aucune escalade automatique : un incident porte des délais réglementaires, il ne s'ouvre pas sans humain.",
    },
  })

  .get('/', async ({ query }) => listerAlertes({
    status: query.status ? query.status.split(',') as never : undefined,
    level_min: query.level_min,
    machine: query.machine,
    ruleId: query.ruleId,
    assignee: query.assignee,
    since: query.since,
    limit: query.limit,
    offset: query.offset,
  }), {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({
      status: t.Optional(t.String({ description: 'Statuts séparés par des virgules : `nouvelle,en_cours`.' })),
      level_min: t.Optional(t.Number()),
      machine: t.Optional(t.String()),
      ruleId: t.Optional(t.String()),
      assignee: t.Optional(t.String({ description: "Identifiant de la personne qui a pris le triage — « mes alertes »." })),
      since: t.Optional(t.String({ description: 'Ne retenir que les alertes revues depuis cette date (ISO 8601).' })),
      limit: t.Optional(t.Number({ description: '50 par défaut, 200 au plus.' })),
      offset: t.Optional(t.Number()),
    }),
    detail: {
      summary: 'Lister la file de triage',
      description: 'Rend `{ total, resultats }`, triés par niveau décroissant puis dernière vue. Le total porte sur les filtres, pas sur la page.',
    },
  })

  // Avant `/:id` : sans quoi « etat » serait pris pour un identifiant d'alerte.
  .get('/etat', async () => etatFile(), {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    detail: {
      summary: 'État de la file',
      description: "Décomptes par statut, **la plus ancienne non triée** et **la dernière alerte reçue**. L'ingestion est poussée : sans ce second témoin, une source arrêtée donne une file calme, qu'on lit comme une situation saine.",
    },
  })

  // Statiques avant `/:id` : « silences » ou « stats » seraient sinon pris pour des identifiants.
  .get('/stats', async ({ query }) => statistiquesAlertes(query.jours ?? 30), {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({ jours: t.Optional(t.Number({ description: 'Fenêtre en jours, 30 par défaut.' })) }),
    detail: {
      summary: 'Ce que la file apprend',
      description: "Volumes par statut, taux d'escalade, **délai médian de triage** (de la première vue à la première décision — une alerte reçue trois jours après sa détection a déjà trois jours de retard), **top 10 des règles écartées** avec leur motif, et volumes par machine. Le top des règles est la liste de travail du réglage ; les machines disent si une cible domine.",
    },
  })

  .get('/silences', async ({ query }) => listerSilences(query.etat), {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({ etat: t.Optional(t.Union([t.Literal('active'), t.Literal('levee')])) }),
    detail: { summary: 'Séries qu\'on a décidé de ne plus voir arriver, avec leur échéance' },
  })

  .post('/silences', async ({ body, user, status }) => {
    const r = await poserSilence(body, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    status(201)
    return r
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({
      ruleId: t.String({ description: 'Règle à faire taire.' }),
      machine: t.Optional(t.Union([t.String(), t.Null()], { description: 'Restreindre à une machine. Vide : toutes — à éviter quand une machine suffit.' })),
      dismissReason: MotifEcart,
      note: t.Optional(t.String()),
      echeance: t.String({ description: "Date de revue. **Obligatoire et future** : un silence sans échéance est un angle mort permanent que personne n'a décidé." }),
      source: t.Optional(t.Union([t.Literal('wazuh'), t.Literal('n8n'), t.Literal('manuel')])),
      ecarterLaFile: t.Optional(t.Boolean({ description: 'Écarter du même coup ce qui attend déjà dans la file pour cette série.' })),
    }),
    detail: {
      summary: 'Faire taire une série',
      description: "Le panier est journalier : écarter aujourd'hui ne dit rien de demain, et la même série revient chaque matin. Un silence porte sur la règle, éventuellement restreinte à une machine ; les paniers suivants naissent écartés en citant la décision. Son échéance est rappelée comme celle d'une liste blanche — sept jours avant, puis chaque semaine.",
    },
  })

  .patch('/silences/:id/lever', async ({ params, body, user, status }) => {
    const r = await leverSilence(params.id, body.motif, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return r.silence
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ motif: t.String({ description: 'Pourquoi le silence est levé. Obligatoire : la série va revenir dans la file.' }) }),
    detail: { summary: 'Lever un silence' },
  })

  .post('/dismiss-bulk', async ({ body, user, status }) => {
    const r = await ecarterEnMasse(body.ids, body.dismissReason, body.dismissNote, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return r
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({
      ids: t.Array(t.String(), { description: 'Alertes à écarter. Celles déjà écartées ou escaladées sont ignorées.' }),
      dismissReason: MotifEcart,
      dismissNote: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Écarter plusieurs alertes',
      description: "Le jour où une règle part en vrille, c'est la seule action tenable. Réversible : `POST /api/alerts/reopen-bulk` avec les identifiants rendus ici — l'interface le propose pendant dix secondes.",
    },
  })

  .post('/reopen-bulk', async ({ body, user, status }) => {
    const r = await rouvrirEnMasse(body.ids, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return r
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({ ids: t.Array(t.String()) }),
    detail: { summary: "Annuler un écartement en masse" },
  })

  // Ce que la cellule sait, attaché à une machine ou à une règle — pas à une alerte.
  .get('/connaissances', async ({ query }) => connaissancesDe(query.machine ?? '', query.ruleId ?? ''), {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({ machine: t.Optional(t.String()), ruleId: t.Optional(t.String()) }),
    detail: { summary: "Notes de la cellule sur une machine ou une règle" },
  })

  .post('/connaissances', async ({ body, user, status }) => {
    const r = await poserConnaissance(body.portee, body.valeur, body.note, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return r.connaissance
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({
      portee: t.Union([t.Literal('machine'), t.Literal('regle')]),
      valeur: t.String({ description: 'Nom de machine, ou identifiant de règle.' }),
      note: t.String({ description: "Ce que la source ne dit pas : « c'est le reverse proxy de l'université »." }),
    }),
    detail: {
      summary: 'Retenir ce que la cellule sait',
      description: "Attaché à la MACHINE ou à la RÈGLE, jamais à une alerte : sans cela, ce qu'on apprend au modèle un mardi est reperdu le mercredi, et l'analyste suivant réexplique la même chose. La note est jointe à ce que lit le modèle — comme un fait établi, qu'il lui est interdit de contredire — et affichée à qui trie. Une seule note par cible : réécrire remplace.",
    },
  })

  .delete('/connaissances/:id', async ({ params, status }) => {
    const r = await retirerConnaissance(params.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return r
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Retirer une note' },
  })

  .get('/:id', async ({ params, status }) => {
    const a = await lireAlerte(params.id)
    if (!a) return status(404, { message: 'Alerte introuvable.' })
    return a
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Une alerte et son journal de triage' },
  })

  .patch('/:id', async ({ params, body, user, status }) => {
    const estAdmin = String(user?.role ?? '').split(',').map(r => r.trim()).includes('admin')
    const r = await trierAlerte(params.id, body, user?.id, estAdmin)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return pourApi(r.alerte)
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({
      status: t.Optional(Statut),
      dismissReason: t.Optional(MotifEcart),
      dismissNote: t.Optional(t.String({ description: 'Note libre — c\'est elle qui sert au réglage des règles.' })),
      assignee: t.Optional(t.Union([t.String(), t.Null()], { description: "Qui prend le triage. `null` retire la prise en charge. Désigner quelqu'un d'AUTRE, ou reprendre une alerte déjà prise, est réservé aux administrateurs : sans cette limite, n'importe qui pourrait se décharger d'une alerte sur un collègue absent (403, 409)." })),
    }),
    detail: {
      summary: 'Trier une alerte',
      description: "Transitions admises : `nouvelle → en_cours | ecartee | escaladee`, `en_cours → nouvelle | ecartee | escaladee`, `ecartee → nouvelle` (réouverture tracée). `escaladee` est terminal : l'incident porte la suite. Une transition interdite est refusée en **409**. `dismissReason` est **obligatoire** pour écarter — sans lui, on aurait écarté sans savoir pourquoi.",
    },
  })

  .post('/:id/avis', async ({ params, user, status }) => {
    const r = await demanderAvis(params.id, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return r.avis
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    detail: {
      summary: "Demander l'avis du modèle sur une alerte",
      description: "Une AIDE à la décision, jamais la décision : la réponse range les éléments qui plaident pour écarter et ceux qui plaident pour approfondir, sans verdict ni score — un modèle à qui l'on demande de trancher tranche toujours, avec ce qu'il a. L'avis est stocké à part, n'écrit rien dans l'alerte, et la demande est inscrite au journal de triage. À la demande seulement : un avis par alerte sur une file de centaines de lignes coûte cher pour une valeur qui décroît.",
    },
  })

  .post('/:id/chat', async ({ params, body, user, status }) => {
    const r = await converserSurAlerte(params.id, body.question, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return r
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ question: t.String({ minLength: 1, maxLength: 2000 }) }),
    detail: {
      summary: "Poursuivre avec le modèle sur une alerte",
      description: "Pour lui apporter ce que l'alerte ne dit pas — « cette adresse, c'est notre reverse proxy ». Le fil est PARTAGÉ : ce qu'on apprend au modèle vaut pour toute la cellule, et le suivant voit ce qui a déjà été dit. Le fil se lit avec l'alerte (`GET /api/alerts/:id`). Le modèle ne décide rien et n'écrit rien dans l'alerte.",
    },
  })

  .post('/:id/escalate', async ({ params, body, user, status }) => {
    const r = await escaladerAlerte(params.id, body, user?.id)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    return { alerte: pourApi(r.alerte), incidentId: r.incidentId }
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({
      type: t.Union([
        t.Literal('phishing'), t.Literal('malware'), t.Literal('ransomware'), t.Literal('data_breach'),
        t.Literal('ddos'), t.Literal('network_intrusion'), t.Literal('other'),
      ]),
      severity: t.Optional(t.Union([t.Literal('low'), t.Literal('medium'), t.Literal('high'), t.Literal('critical')], {
        description: 'Par défaut, déduite du niveau de la source.',
      })),
      perimeter: t.Optional(t.Union([
        t.Literal('composante'), t.Literal('laboratoire'), t.Literal('service_central'),
        t.Literal('infrastructure'), t.Literal('etablissement_raccorde'), t.Literal('inconnu'),
      ])),
      attachToIncidentId: t.Optional(t.Union([t.String(), t.Null()], {
        description: "Rattacher à un incident existant plutôt que d'en créer un.",
      })),
    }),
    detail: {
      summary: 'Escalader une alerte en incident',
      description: "Crée l'incident, ou rattache l'alerte à un incident existant. **`knowledgeAt` vaut la première vue de l'alerte**, jamais l'heure de l'escalade : les délais réglementaires courent depuis la détection. Sur un rattachement, la date de connaissance de l'incident RECULE si l'alerte est antérieure — une campagne garde la date de sa première détection. Les champs techniques (règle, machine, adresses, ATT&CK, lien vers l'outil) sont recopiés dans l'incident.",
    },
  })
