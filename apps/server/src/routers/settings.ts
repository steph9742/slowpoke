import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { CLE_NIS2_DEPUIS } from '../utils/conduite'
import { db } from '@slowpoke/database'
import { settingsSchema } from '@slowpoke/database/tables'
import { inArray } from 'drizzle-orm'
import {
  CLE_BASE, CLE_CLIENT, CLE_JETON,
  lireConfigAdvens, testerConnexionAdvens, importerTicketsAdvens,
} from '../utils/advens'
import {
  CLE_GITLAB_URL, CLE_GITLAB_PROJET, CLE_GITLAB_JETON, CLE_GITLAB_REF, CLE_GITLAB_DOSSIERS,
  lireConfigGitLab, synchroniserPlaybooks,
} from '../utils/playbooks'
import { CLE_HFL_URL, CLE_HFL_JETON, lireConfigHfl, testerHfl, synchroniserHfl, normaliserJetonHfl } from '../utils/harfanglab'
import { CLE_LDAP_URL, CLE_LDAP_BIND_DN, CLE_LDAP_MOT_DE_PASSE, CLE_LDAP_BASE, CLE_LDAP_ATTR_MDP, CLE_LDAP_ATTR_MFA, CLES_LDAP, ATTR_MDP_DEFAUT, ATTR_MFA_DEFAUT, lireConfigLdap, testerLdap, connexionChiffree } from '@slowpoke/connecteurs/ldap'
import {
  CLE_WAZUH_URL, CLE_WAZUH_UTILISATEUR, CLE_WAZUH_MOT_DE_PASSE, CLE_WAZUH_INDEX, CLE_WAZUH_CA, CLE_WAZUH_ACCES, CLE_WAZUH_NOM_CERTIFICAT,
  CLES_WAZUH, INDEX_WAZUH_DEFAUT,
  lireConfigWazuh, testerWazuh, connexionChiffreeWazuh, indexValide, certificatValide, nomCertificatValide,
} from '@slowpoke/connecteurs/wazuh'
import {
  CLE_GLPI_URL, CLE_GLPI_APP, CLE_GLPI_USER, CLE_GLPI_GROUPE_CRITIQUE, CLE_GLPI_CHAMP_GROUPE,
  lireConfigGlpi, testerGlpi, synchroniserGlpi,
} from '../utils/glpi'
import {
  CLE_IA_URL, CLE_IA_JETON, CLE_IA_MODELE, CLE_IA_CONTEXTE, CLE_PROMPT, PROMPTS_DEFAUT,
  lireConfigIA, listerModeles, testerIA, type NomPrompt,
} from '../utils/ia'
import { chiffrer, dechiffrer } from '@slowpoke/connecteurs/secrets'
import {
  CLE_ALERTES_TABLEAU_DE_BORD, CLE_ALERTES_SEUIL, CLE_ALERTES_RETENTION, CLE_ALERTES_NIVEAU_NOTIFICATION,
  CLES_ALERTES, SEUIL_INGESTION_DEFAUT, RETENTION_DEFAUT, NIVEAU_NOTIFICATION_DEFAUT, lireConfigAlertes,
} from '../utils/alertes'

// RÉGLAGES DES INTÉGRATIONS, depuis l'interface plutôt que par variable d'environnement :
// qui administre Slowpoke n'a pas forcément accès au serveur, et corriger un jeton ne devrait
// pas demander un redéploiement.
//
// ⚠️ LE JETON NE SORT JAMAIS : la lecture ne renvoie qu'un aperçu des derniers caractères.

/** Ce qu'on montre d'un secret : assez pour le reconnaître, pas assez pour s'en servir. */
function apercu(secret: string | null | undefined): string | null {
  const s = secret?.trim()
  if (!s) return null
  return `…${s.slice(-4)}`
}

async function lireReglages(cles: string[] = [CLE_BASE, CLE_CLIENT, CLE_JETON]) {
  const lignes = await db.select().from(settingsSchema.appSetting)
    .where(inArray(settingsSchema.appSetting.key, cles))
  return Object.fromEntries(lignes.map(l => [l.key, l.value])) as Record<string, string | null>
}

async function ecrire(cle: string, valeur: string | null, userId?: string) {
  await db.insert(settingsSchema.appSetting)
    .values({ key: cle, value: valeur, updatedBy: userId })
    .onConflictDoUpdate({
      target: settingsSchema.appSetting.key,
      set: { value: valeur, updatedAt: new Date(), updatedBy: userId },
    })
}

const EtatAdvens = t.Object({
  baseUrl: t.Union([t.String(), t.Null()]),
  customer: t.Union([t.String(), t.Null()]),
  tokenDefini: t.Boolean(),
  tokenApercu: t.Union([t.String(), t.Null()]),
  actif: t.Boolean(),
})

const EtatHfl = t.Object({
  url: t.Union([t.String(), t.Null()]),
  tokenDefini: t.Boolean(),
  actif: t.Boolean(),
})

const EtatGlpi = t.Object({
  url: t.Union([t.String(), t.Null()]),
  groupeCritique: t.Union([t.String(), t.Null()]),
  champGroupe: t.Union([t.String(), t.Null()]),
  appDefini: t.Boolean(),
  userDefini: t.Boolean(),
  actif: t.Boolean(),
})

const EtatIA = t.Object({
  baseUrl: t.Union([t.String(), t.Null()]),
  modele: t.Union([t.String(), t.Null()]),
  contexte: t.Union([t.String(), t.Null()]),
  tokenDefini: t.Boolean(),
  tokenApercu: t.Union([t.String(), t.Null()]),
  actif: t.Boolean(),
})

const EtatGitLab = t.Object({
  baseUrl: t.Union([t.String(), t.Null()]),
  projet: t.Union([t.String(), t.Null()]),
  ref: t.Union([t.String(), t.Null()]),
  dossiers: t.Union([t.String(), t.Null()]),
  tokenDefini: t.Boolean(),
  tokenApercu: t.Union([t.String(), t.Null()]),
  actif: t.Boolean(),
})

/** État des réglages de l'annuaire. Le mot de passe de liaison n'est jamais renvoyé. */
async function etatLdap() {
  const r = await lireReglages(CLES_LDAP)
  const cfg = await lireConfigLdap()
  return {
    url: r[CLE_LDAP_URL] ?? null,
    bindDn: r[CLE_LDAP_BIND_DN] ?? null,
    base: r[CLE_LDAP_BASE] ?? null,
    attrMotDePasse: r[CLE_LDAP_ATTR_MDP] ?? null,
    attrMfa: r[CLE_LDAP_ATTR_MFA] ?? null,
    attrMotDePasseDefaut: ATTR_MDP_DEFAUT,
    attrMfaDefaut: ATTR_MFA_DEFAUT,
    motDePasseDefini: Boolean(r[CLE_LDAP_MOT_DE_PASSE]?.trim()),
    actif: Boolean(cfg && connexionChiffree(cfg)),
  }
}

/** État des réglages des archives Wazuh. Le mot de passe n'est jamais renvoyé. */
async function etatWazuh() {
  const r = await lireReglages(CLES_WAZUH)
  const cfg = await lireConfigWazuh()
  return {
    url: r[CLE_WAZUH_URL] ?? null,
    utilisateur: r[CLE_WAZUH_UTILISATEUR] ?? null,
    index: r[CLE_WAZUH_INDEX] ?? null,
    indexDefaut: INDEX_WAZUH_DEFAUT,
    ca: r[CLE_WAZUH_CA] ?? null,
    acces: r[CLE_WAZUH_ACCES] === 'tableau_de_bord' ? 'tableau_de_bord' as const : 'indexeur' as const,
    nomCertificat: r[CLE_WAZUH_NOM_CERTIFICAT] ?? null,
    motDePasseDefini: Boolean(r[CLE_WAZUH_MOT_DE_PASSE]?.trim()),
    actif: Boolean(cfg && connexionChiffreeWazuh(cfg)),
  }
}

export const settingsRouter = new Elysia({ name: 'settings', prefix: '/api/settings', tags: ['Réglages'] })
  .use(betterAuth)
  .get('/advens', async () => {
    const r = await lireReglages()
    return {
      baseUrl: r[CLE_BASE] ?? null,
      customer: r[CLE_CLIENT] ?? null,
      tokenDefini: Boolean(r[CLE_JETON]?.trim()),
      tokenApercu: apercu(dechiffrer(r[CLE_JETON])),
      // « Actif » signifie que les trois valeurs sont là — pas que le SOC répond.
      // Pour cela, il y a le bouton d'essai.
      actif: Boolean(await lireConfigAdvens()),
    }
  }, {
    auth: ['admin'],
    response: { 200: EtatAdvens },
    detail: { summary: 'Réglages de l\'import SOC (le jeton n\'est jamais renvoyé)' },
  })
  .put('/advens', async ({ body, user }) => {
    await ecrire(CLE_BASE, body.baseUrl?.trim() || null, user?.id)
    await ecrire(CLE_CLIENT, body.customer?.trim() || null, user?.id)

    // Jeton ABSENT du corps : on n'y touche pas — c'est le cas normal d'une modification
    // d'URL, puisque l'interface ne le possède pas pour le renvoyer. Chaîne VIDE : on
    // l'efface, c'est une demande explicite.
    if (body.token !== undefined) {
      const jeton = body.token.trim()
      await ecrire(CLE_JETON, jeton ? chiffrer(jeton) : null, user?.id)
    }

    const r = await lireReglages()
    return {
      baseUrl: r[CLE_BASE] ?? null,
      customer: r[CLE_CLIENT] ?? null,
      tokenDefini: Boolean(r[CLE_JETON]?.trim()),
      tokenApercu: apercu(dechiffrer(r[CLE_JETON])),
      actif: Boolean(await lireConfigAdvens()),
    }
  }, {
    auth: ['admin'],
    body: t.Object({
      baseUrl: t.Optional(t.String()),
      customer: t.Optional(t.String()),
      token: t.Optional(t.String()),
    }),
    response: { 200: EtatAdvens },
    detail: { summary: 'Enregistrer les réglages de l\'import SOC' },
  })
  .post('/advens/test', async ({ status }) => {
    const cfg = await lireConfigAdvens()
    if (!cfg) return status(400, { message: 'Renseignez l\'adresse, le client et le jeton avant d\'essayer.' })
    return await testerConnexionAdvens(cfg)
  }, {
    auth: ['admin'],
    response: {
      200: t.Union([
        t.Object({ ok: t.Literal(true), tickets: t.Number(), retenus: t.Number() }),
        t.Object({ ok: t.Literal(false), message: t.String() }),
      ]),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Essayer la connexion au SOC' },
  })
  .post('/advens/import', async ({ status }) => {
    const cfg = await lireConfigAdvens()
    if (!cfg) return status(400, { message: 'Import non configuré.' })
    // Déclenchement manuel : évite d'attendre le passage automatique après un réglage.
    return await importerTicketsAdvens()
  }, {
    auth: ['admin'],
    response: {
      200: t.Object({ crees: t.Number(), clos: t.Number(), ignores: t.Number(), examines: t.Number() }),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Lancer un import SOC immédiatement' },
  })

  // --- Dépôt de procédures (GitLab) : jeton chiffré, jamais renvoyé au navigateur. La portée
  // `read_repository` suffit — Slowpoke lit la documentation, il ne l'écrit jamais. ---
  .get('/gitlab', async () => {
    const r = await lireReglages([CLE_GITLAB_URL, CLE_GITLAB_PROJET, CLE_GITLAB_JETON, CLE_GITLAB_REF, CLE_GITLAB_DOSSIERS])
    return {
      baseUrl: r[CLE_GITLAB_URL] ?? null,
      projet: r[CLE_GITLAB_PROJET] ?? null,
      ref: r[CLE_GITLAB_REF] ?? null,
      dossiers: r[CLE_GITLAB_DOSSIERS] ?? null,
      tokenDefini: Boolean(r[CLE_GITLAB_JETON]?.trim()),
      tokenApercu: apercu(dechiffrer(r[CLE_GITLAB_JETON])),
      actif: Boolean(await lireConfigGitLab()),
    }
  }, {
    auth: ['admin'],
    response: { 200: EtatGitLab },
    detail: { summary: 'Réglages du dépôt de procédures (le jeton n\'est jamais renvoyé)' },
  })
  .put('/gitlab', async ({ body, user }) => {
    await ecrire(CLE_GITLAB_URL, body.baseUrl?.trim() || null, user?.id)
    await ecrire(CLE_GITLAB_PROJET, body.projet?.trim() || null, user?.id)
    await ecrire(CLE_GITLAB_REF, body.ref?.trim() || null, user?.id)
    await ecrire(CLE_GITLAB_DOSSIERS, body.dossiers?.trim() || null, user?.id)
    if (body.token !== undefined) {
      const jeton = body.token.trim()
      await ecrire(CLE_GITLAB_JETON, jeton ? chiffrer(jeton) : null, user?.id)
    }

    const r = await lireReglages([CLE_GITLAB_URL, CLE_GITLAB_PROJET, CLE_GITLAB_JETON, CLE_GITLAB_REF, CLE_GITLAB_DOSSIERS])
    return {
      baseUrl: r[CLE_GITLAB_URL] ?? null,
      projet: r[CLE_GITLAB_PROJET] ?? null,
      ref: r[CLE_GITLAB_REF] ?? null,
      dossiers: r[CLE_GITLAB_DOSSIERS] ?? null,
      tokenDefini: Boolean(r[CLE_GITLAB_JETON]?.trim()),
      tokenApercu: apercu(dechiffrer(r[CLE_GITLAB_JETON])),
      actif: Boolean(await lireConfigGitLab()),
    }
  }, {
    auth: ['admin'],
    body: t.Object({
      baseUrl: t.Optional(t.String()),
      projet: t.Optional(t.String()),
      ref: t.Optional(t.String()),
      dossiers: t.Optional(t.String()),
      token: t.Optional(t.String()),
    }),
    response: { 200: EtatGitLab },
    detail: { summary: 'Enregistrer les réglages du dépôt de procédures' },
  })
  .post('/gitlab/sync', async ({ status }) => {
    if (!await lireConfigGitLab()) return status(400, { message: 'Renseignez l\'adresse, le projet et le jeton avant de synchroniser.' })
    try {
      return await synchroniserPlaybooks()
    }
    catch (e) {
      // Le code HTTP de GitLab est la seule information qui permette de corriger :
      // 401 le jeton, 403 les droits du rôle, 404 le chemin du projet ou la branche.
      return status(400, { message: e instanceof Error ? e.message : 'Synchronisation impossible.' })
    }
  }, {
    auth: ['admin'],
    response: {
      200: t.Object({ vues: t.Number(), ecrites: t.Number(), inchangees: t.Number(), echecs: t.Number() }),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Synchroniser les procédures maintenant' },
  })

  // --- Assistance (modèle local) ----------------------------------------------------
  .get('/ia', async () => {
    const r = await lireReglages([CLE_IA_URL, CLE_IA_JETON, CLE_IA_MODELE, CLE_IA_CONTEXTE])
    return {
      baseUrl: r[CLE_IA_URL] ?? null,
      modele: r[CLE_IA_MODELE] ?? null,
      contexte: r[CLE_IA_CONTEXTE] ?? null,
      tokenDefini: Boolean(r[CLE_IA_JETON]?.trim()),
      tokenApercu: apercu(dechiffrer(r[CLE_IA_JETON])),
      actif: Boolean(await lireConfigIA()),
    }
  }, {
    auth: ['admin'],
    response: { 200: EtatIA },
    detail: { summary: 'Réglages de l\'assistance (le jeton n\'est jamais renvoyé)' },
  })
  .put('/ia', async ({ body, user }) => {
    await ecrire(CLE_IA_URL, body.baseUrl?.trim() || null, user?.id)
    await ecrire(CLE_IA_MODELE, body.modele?.trim() || null, user?.id)
    if (body.contexte !== undefined) await ecrire(CLE_IA_CONTEXTE, body.contexte.trim() || null, user?.id)
    if (body.token !== undefined) {
      const jeton = body.token.trim()
      await ecrire(CLE_IA_JETON, jeton ? chiffrer(jeton) : null, user?.id)
    }

    const r = await lireReglages([CLE_IA_URL, CLE_IA_JETON, CLE_IA_MODELE, CLE_IA_CONTEXTE])
    return {
      baseUrl: r[CLE_IA_URL] ?? null,
      modele: r[CLE_IA_MODELE] ?? null,
      contexte: r[CLE_IA_CONTEXTE] ?? null,
      tokenDefini: Boolean(r[CLE_IA_JETON]?.trim()),
      tokenApercu: apercu(dechiffrer(r[CLE_IA_JETON])),
      actif: Boolean(await lireConfigIA()),
    }
  }, {
    auth: ['admin'],
    body: t.Object({
      baseUrl: t.Optional(t.String()),
      modele: t.Optional(t.String()),
      contexte: t.Optional(t.String()),
      token: t.Optional(t.String()),
    }),
    response: { 200: EtatIA },
    detail: { summary: 'Enregistrer les réglages de l\'assistance' },
  })
  // Adresse et jeton suffisent : la liste sert justement à choisir le modèle.
  .get('/ia/modeles', async ({ status }) => {
    try {
      return await listerModeles()
    }
    catch (e) {
      return status(400, { message: e instanceof Error ? e.message : 'Liste indisponible.' })
    }
  }, {
    auth: ['admin'],
    response: {
      200: t.Array(t.Object({ id: t.String(), nom: t.String() })),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Modèles proposés par le serveur d\'inférence' },
  })
  .post('/ia/test', async ({ status }) => {
    const cfg = await lireConfigIA()
    if (!cfg) return status(400, { message: 'Renseignez l\'adresse, le jeton et le modèle avant d\'essayer.' })
    return await testerIA(cfg)
  }, {
    auth: ['admin'],
    response: {
      200: t.Union([
        t.Object({ ok: t.Literal(true), reponse: t.String() }),
        t.Object({ ok: t.Literal(false), message: t.String() }),
      ]),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Essayer le modèle' },
  })

  // Prompts : la consigne est éditable, le contrat de sortie JSON reste dans le code.
  // Un champ vide reprend le défaut, ce qui sert de bouton « réinitialiser ».
  .get('/ia/prompts', async () => {
    const r = await lireReglages(Object.values(CLE_PROMPT))
    const noms = Object.keys(CLE_PROMPT) as NomPrompt[]
    return noms.map(nom => ({
      nom,
      valeur: r[CLE_PROMPT[nom]] ?? '',
      defaut: PROMPTS_DEFAUT[nom],
    }))
  }, {
    auth: ['admin'],
    response: { 200: t.Array(t.Object({ nom: t.String(), valeur: t.String(), defaut: t.String() })) },
    detail: { summary: 'Consignes envoyées au modèle, et leurs valeurs par défaut' },
  })
  .put('/ia/prompts', async ({ body, user }) => {
    for (const [nom, valeur] of Object.entries(body)) {
      const cle = CLE_PROMPT[nom as NomPrompt]
      if (cle) await ecrire(cle, valeur.trim() || null, user?.id)
    }
    return { enregistre: true }
  }, {
    auth: ['admin'],
    body: t.Record(t.String(), t.String()),
    response: { 200: t.Object({ enregistre: t.Boolean() }) },
    detail: { summary: 'Enregistrer les consignes (vide = valeur par défaut)' },
  })

  // --- Entrée en vigueur de NIS 2 ---
  //
  // À partir de cette date, un P2 arme d'office les compteurs : armer se défait par une décision
  // tracée, ne pas armer ne se rattrape que si quelqu'un y pense. Avant elle, P2 reste « à évaluer ».
  .get('/nis2', async () => {
    const r = await lireReglages([CLE_NIS2_DEPUIS])
    return { armeDepuis: r[CLE_NIS2_DEPUIS] ?? null }
  }, {
    auth: ['admin'],
    response: { 200: t.Object({ armeDepuis: t.Union([t.String(), t.Null()]) }) },
    detail: { summary: 'Date à partir de laquelle un P2 arme NIS 2 d\'office' },
  })
  .put('/nis2', async ({ body, user, status }) => {
    const v = body.armeDepuis?.trim() || null
    if (v && Number.isNaN(new Date(v).getTime())) {
      return status(422, { message: 'Date invalide.' })
    }
    await ecrire(CLE_NIS2_DEPUIS, v, user?.id)
    return { armeDepuis: v }
  }, {
    auth: ['admin'],
    body: t.Object({ armeDepuis: t.Union([t.String(), t.Null()], { description: 'Date ISO, ou vide pour laisser P2 « à évaluer »' }) }),
    response: {
      200: t.Object({ armeDepuis: t.Union([t.String(), t.Null()]) }),
      422: t.Object({ message: t.String() }),
    },
    detail: {
      summary: 'Régler l\'entrée en vigueur de NIS 2',
      description: "Les incidents connus À PARTIR de cette date arment NIS 2 d'office en P2. Les antérieurs gardent « à évaluer » : la règle ne crée pas rétroactivement des retards sur des incidents qu'elle ne régissait pas.",
    },
  })

  // --- Annuaire (LDAP), en lecture seule -------------------------------------------------
  .get('/ldap', async () => etatLdap(), {
    auth: ['admin'],
    detail: { summary: "Réglages de l'annuaire (le mot de passe de liaison n'est jamais renvoyé)" },
  })
  .put('/ldap', async ({ body, user, status }) => {
    const url = body.url?.trim() || null
    if (url && !connexionChiffree({ url })) {
      return status(422, { message: "L'adresse doit commencer par ldaps:// : une liaison non chiffrée ferait circuler le mot de passe en clair." })
    }
    await ecrire(CLE_LDAP_URL, url, user?.id)
    await ecrire(CLE_LDAP_BIND_DN, body.bindDn?.trim() || null, user?.id)
    await ecrire(CLE_LDAP_BASE, body.base?.trim() || null, user?.id)
    await ecrire(CLE_LDAP_ATTR_MDP, body.attrMotDePasse?.trim() || null, user?.id)
    await ecrire(CLE_LDAP_ATTR_MFA, body.attrMfa?.trim() || null, user?.id)
    // Le mot de passe n'est pas rogné : une espace peut en faire partie. Vide, il est effacé.
    if (body.motDePasse !== undefined) {
      await ecrire(CLE_LDAP_MOT_DE_PASSE, body.motDePasse ? chiffrer(body.motDePasse) : null, user?.id)
    }
    return etatLdap()
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String()),
      bindDn: t.Optional(t.String()),
      base: t.Optional(t.String()),
      attrMotDePasse: t.Optional(t.String()),
      attrMfa: t.Optional(t.String()),
      motDePasse: t.Optional(t.String()),
    }),
    detail: { summary: "Enregistrer les réglages de l'annuaire" },
  })
  .post('/ldap/test', async ({ status }) => {
    const cfg = await lireConfigLdap()
    if (!cfg) return status(400, { message: "Renseignez l'adresse, le compte de liaison, son mot de passe et la base avant d'essayer." })
    return testerLdap(cfg)
  }, {
    auth: ['admin'],
    detail: { summary: "Essayer la liaison à l'annuaire" },
  })

  // --- Journaux d'authentification (archives Wazuh), en lecture seule --------------------
  .get('/wazuh', async () => etatWazuh(), {
    auth: ['admin'],
    detail: { summary: "Réglages des archives Wazuh (le mot de passe n'est jamais renvoyé)" },
  })
  .put('/wazuh', async ({ body, user, status }) => {
    const url = body.url?.trim() || null
    if (url && !connexionChiffreeWazuh({ url })) {
      return status(422, { message: "L'adresse doit commencer par https:// : une connexion en clair ferait circuler le mot de passe." })
    }
    const index = body.index?.trim() || null
    if (index && !indexValide(index)) {
      return status(422, { message: "Un seul motif d'index, en minuscules, sans virgule : wazuh-archives-* par exemple." })
    }
    const ca = body.ca?.trim() || null
    if (ca && !certificatValide(ca)) {
      return status(422, { message: "Le certificat de l'autorité doit être au format PEM (-----BEGIN CERTIFICATE-----)." })
    }
    const nomCertificat = body.nomCertificat?.trim() || null
    if (nomCertificat && !nomCertificatValide(nomCertificat)) {
      return status(422, { message: 'Le nom attendu dans le certificat doit être un nom de machine ou une adresse IP.' })
    }
    await ecrire(CLE_WAZUH_URL, url, user?.id)
    await ecrire(CLE_WAZUH_UTILISATEUR, body.utilisateur?.trim() || null, user?.id)
    await ecrire(CLE_WAZUH_INDEX, index, user?.id)
    await ecrire(CLE_WAZUH_CA, ca, user?.id)
    await ecrire(CLE_WAZUH_ACCES, body.acces ?? 'indexeur', user?.id)
    await ecrire(CLE_WAZUH_NOM_CERTIFICAT, nomCertificat, user?.id)
    // Le mot de passe n'est pas rogné : une espace peut en faire partie. Vide, il est effacé.
    if (body.motDePasse !== undefined) {
      await ecrire(CLE_WAZUH_MOT_DE_PASSE, body.motDePasse ? chiffrer(body.motDePasse) : null, user?.id)
    }
    return etatWazuh()
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String({ description: "Adresse de l'indexeur (`https://…:9200`) ou du tableau de bord selon `acces`. `https://` exigé : en clair, le mot de passe de lecture circulerait sur le réseau." })),
      utilisateur: t.Optional(t.String({ description: "Compte de lecture, limité à l'index des archives (groupe d'actions `read`). Aucun droit d'écriture n'est nécessaire." })),
      index: t.Optional(t.String({ description: 'Motif d\'index, `wazuh-archives-*` par défaut. Un seul motif, en minuscules, sans virgule ni index système.' })),
      ca: t.Optional(t.String({ description: "Certificat PEM de l'autorité qui a signé celui de l'indexeur, quand elle est interne. On la fournit plutôt que de couper la vérification." })),
      acces: t.Optional(t.Union([t.Literal('indexeur'), t.Literal('tableau_de_bord')], { description: "`indexeur` : l'API de l'indexeur, port 9200. `tableau_de_bord` : son relais de console, quand lui seul est joignable — la recherche arrive à l'indexeur avec les identifiants du compte, donc avec le même rôle." })),
      nomCertificat: t.Optional(t.String({ description: "Nom ou IP que doit porter le certificat, quand l'adresse jointe est traduite (NAT). La vérification reste entière : elle porte sur ce nom au lieu de l'adresse composée." })),
      motDePasse: t.Optional(t.String({ description: "Mot de passe du compte de lecture. Chiffré en base, jamais renvoyé. Absent : l'existant est conservé ; vide : il est effacé." })),
    }),
    detail: {
      summary: 'Enregistrer les réglages des archives Wazuh',
      description: "Sert l'enquête « compte compromis » : Slowpoke y lit les authentifications d'un compte (Zimbra, LemonLDAP::NG, slapd) en lecture seule. Refus en 422 si l'adresse n'est pas en `https://`, si le motif d'index vise autre chose qu'un index, ou si le certificat fourni n'est pas au format PEM.",
    },
  })
  .post('/wazuh/test', async ({ status }) => {
    const cfg = await lireConfigWazuh()
    if (!cfg) return status(400, { message: "Renseignez l'adresse, le compte et son mot de passe avant d'essayer." })
    return testerWazuh(cfg)
  }, {
    auth: ['admin'],
    detail: {
      summary: 'Essayer la lecture des archives Wazuh',
      description: "Rend `{ ok, index, premier, dernier, typesFullLog }` : la période réellement couverte par l'index — donc la rétention — et comment `full_log` y est indexé. Une recherche par phrase ne trouve rien dans un champ qui n'est pas du texte, et l'essai est le seul endroit où cela se voit avant de chercher pour rien.",
    },
  })

  // --- File d'alertes ---------------------------------------------------------------------
  //
  // Trois réglages, et aucun n'est propre à l'établissement : une autre installation a une
  // autre source, un autre tableau de bord, et un autre bruit de fond.
  .get('/alertes', async () => {
    const r = await lireReglages(CLES_ALERTES)
    const cfg = await lireConfigAlertes()
    return {
      tableauDeBord: r[CLE_ALERTES_TABLEAU_DE_BORD] ?? null,
      seuil: cfg.seuil,
      retentionJours: cfg.retentionJours,
      niveauNotification: cfg.niveauNotification,
      seuilDefaut: SEUIL_INGESTION_DEFAUT,
      retentionDefaut: RETENTION_DEFAUT,
      niveauNotificationDefaut: NIVEAU_NOTIFICATION_DEFAUT,
    }
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    detail: { summary: "Réglages de la file d'alertes" },
  })
  .put('/alertes', async ({ body, user, status }) => {
    const tableauDeBord = body.tableauDeBord?.trim() || null
    if (tableauDeBord && !/^https:\/\/[^\s]+$/.test(tableauDeBord)) {
      return status(422, { message: "L'adresse du tableau de bord doit commencer par https:// — un lien en clair ne s'ouvre pas depuis un poste, et une adresse interne ne se joint pas." })
    }
    if (body.seuil !== undefined && (!Number.isInteger(body.seuil) || body.seuil < 0 || body.seuil > 16)) {
      return status(422, { message: 'Le seuil doit être un entier de 0 à 16.' })
    }
    if (body.retentionJours !== undefined && (!Number.isInteger(body.retentionJours) || body.retentionJours < 7 || body.retentionJours > 3650)) {
      return status(422, { message: 'La rétention doit être comprise entre 7 et 3650 jours.' })
    }
    // 17 : au-dessus du maximum de Wazuh, c'est « ne jamais notifier » dit explicitement.
    if (body.niveauNotification !== undefined && (!Number.isInteger(body.niveauNotification) || body.niveauNotification < 0 || body.niveauNotification > 17)) {
      return status(422, { message: 'Le niveau de notification doit être un entier de 0 à 17 (17 = ne jamais notifier).' })
    }
    await ecrire(CLE_ALERTES_TABLEAU_DE_BORD, tableauDeBord, user?.id)
    await ecrire(CLE_ALERTES_SEUIL, body.seuil === undefined ? null : String(body.seuil), user?.id)
    await ecrire(CLE_ALERTES_RETENTION, body.retentionJours === undefined ? null : String(body.retentionJours), user?.id)
    await ecrire(CLE_ALERTES_NIVEAU_NOTIFICATION, body.niveauNotification === undefined ? null : String(body.niveauNotification), user?.id)
    const cfg = await lireConfigAlertes()
    return {
      tableauDeBord: cfg.tableauDeBord, seuil: cfg.seuil, retentionJours: cfg.retentionJours,
      niveauNotification: cfg.niveauNotification,
      seuilDefaut: SEUIL_INGESTION_DEFAUT, retentionDefaut: RETENTION_DEFAUT, niveauNotificationDefaut: NIVEAU_NOTIFICATION_DEFAUT,
    }
  }, {
    auth: ['admin'],
    body: t.Object({
      tableauDeBord: t.Optional(t.String({ description: "Adresse PUBLIQUE du tableau de bord de la source (https). Les liens reçus des émetteurs sont réécrits vers cette origine : un émetteur fabrique son lien avec l'adresse qu'il connaît — souvent interne —, que personne ne joint depuis un poste." })),
      seuil: t.Optional(t.Number({ description: "Niveau minimum accepté à l'ingestion. En dessous, refus explicite en 422." })),
      retentionJours: t.Optional(t.Number({ description: "Durée de conservation des alertes NON escaladées. Au-delà, elles sont purgées et leur décompte rejoint l'agrégat mensuel. Les escaladées suivent leur incident." })),
      niveauNotification: t.Optional(t.Number({ description: "Niveau à partir duquel une alerte NEUVE envoie une notification aux abonnés. Notifier chaque alerte, c'est faire couper les notifications au bout d'une journée. 17 : ne jamais notifier." })),
    }),
    detail: { summary: "Enregistrer les réglages de la file d'alertes" },
  })

  // --- Inventaire (GLPI) -------------------------------------------------------------
  .get('/glpi', async () => {
    const r = await lireReglages([CLE_GLPI_URL, CLE_GLPI_APP, CLE_GLPI_USER, CLE_GLPI_GROUPE_CRITIQUE, CLE_GLPI_CHAMP_GROUPE])
    return {
      url: r[CLE_GLPI_URL] ?? null,
      groupeCritique: r[CLE_GLPI_GROUPE_CRITIQUE] ?? null,
      champGroupe: r[CLE_GLPI_CHAMP_GROUPE] ?? null,
      appDefini: Boolean(r[CLE_GLPI_APP]?.trim()),
      userDefini: Boolean(r[CLE_GLPI_USER]?.trim()),
      actif: Boolean(await lireConfigGlpi()),
    }
  }, {
    auth: ['admin'],
    response: { 200: EtatGlpi },
    detail: { summary: 'Réglages de l\'inventaire (les jetons ne sont jamais renvoyés)' },
  })
  .put('/glpi', async ({ body, user }) => {
    await ecrire(CLE_GLPI_URL, body.url?.trim() || null, user?.id)
    await ecrire(CLE_GLPI_GROUPE_CRITIQUE, body.groupeCritique?.trim() || null, user?.id)
    await ecrire(CLE_GLPI_CHAMP_GROUPE, body.champGroupe?.trim() || null, user?.id)
    if (body.appToken !== undefined) {
      const v = body.appToken.trim()
      await ecrire(CLE_GLPI_APP, v ? chiffrer(v) : null, user?.id)
    }
    if (body.userToken !== undefined) {
      const v = body.userToken.trim()
      await ecrire(CLE_GLPI_USER, v ? chiffrer(v) : null, user?.id)
    }

    const r = await lireReglages([CLE_GLPI_URL, CLE_GLPI_APP, CLE_GLPI_USER, CLE_GLPI_GROUPE_CRITIQUE, CLE_GLPI_CHAMP_GROUPE])
    return {
      url: r[CLE_GLPI_URL] ?? null,
      groupeCritique: r[CLE_GLPI_GROUPE_CRITIQUE] ?? null,
      champGroupe: r[CLE_GLPI_CHAMP_GROUPE] ?? null,
      appDefini: Boolean(r[CLE_GLPI_APP]?.trim()),
      userDefini: Boolean(r[CLE_GLPI_USER]?.trim()),
      actif: Boolean(await lireConfigGlpi()),
    }
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String()),
      groupeCritique: t.Optional(t.String()),
      champGroupe: t.Optional(t.String()),
      appToken: t.Optional(t.String()),
      userToken: t.Optional(t.String()),
    }),
    response: { 200: EtatGlpi },
    detail: { summary: 'Enregistrer les réglages de l\'inventaire' },
  })
  // Renvoie les groupes existants : saisir « groupe critique » de mémoire mène au
  // libellé approchant, qui ne correspond à rien.
  .post('/glpi/test', async ({ status }) => {
    const cfg = await lireConfigGlpi()
    if (!cfg) return status(400, { message: 'Renseignez l\'adresse et les deux jetons avant d\'essayer.' })
    return await testerGlpi(cfg)
  }, {
    auth: ['admin'],
    response: {
      200: t.Union([
        t.Object({
          ok: t.Literal(true),
          groupes: t.Array(t.String()),
          champsGroupe: t.Array(t.Object({ id: t.Number(), nom: t.String(), champ: t.String() })),
          champGroupeRetenu: t.Union([t.Number(), t.Null()]),
        }),
        t.Object({ ok: t.Literal(false), message: t.String() }),
      ]),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Essayer la connexion à l\'inventaire' },
  })
  .post('/glpi/sync', async ({ status }) => {
    if (!await lireConfigGlpi()) return status(400, { message: 'Inventaire non configuré.' })
    try {
      return await synchroniserGlpi()
    }
    catch (e) {
      return status(400, { message: e instanceof Error ? e.message : 'Synchronisation impossible.' })
    }
  }, {
    auth: ['admin'],
    response: {
      200: t.Object({ vues: t.Number(), ecrites: t.Number(), disparues: t.Number() }),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Synchroniser l\'inventaire maintenant' },
  })

  // --- EDR (listes blanches) ---------------------------------------------------------
  // LECTURE SEULE : Slowpoke constate ce qui existe dans l'EDR, il n'y écrit jamais.
  .get('/harfanglab', async () => {
    const r = await lireReglages([CLE_HFL_URL, CLE_HFL_JETON])
    return {
      url: r[CLE_HFL_URL] ?? null,
      tokenDefini: Boolean(r[CLE_HFL_JETON]?.trim()),
      actif: Boolean(await lireConfigHfl()),
    }
  }, {
    auth: ['admin'],
    response: { 200: EtatHfl },
    detail: { summary: 'Réglages de l\'EDR (le jeton n\'est jamais renvoyé)' },
  })
  .put('/harfanglab', async ({ body, user }) => {
    await ecrire(CLE_HFL_URL, body.url?.trim() || null, user?.id)
    if (body.token !== undefined) {
      const v = normaliserJetonHfl(body.token)
      await ecrire(CLE_HFL_JETON, v ? chiffrer(v) : null, user?.id)
    }
    const r = await lireReglages([CLE_HFL_URL, CLE_HFL_JETON])
    return {
      url: r[CLE_HFL_URL] ?? null,
      tokenDefini: Boolean(r[CLE_HFL_JETON]?.trim()),
      actif: Boolean(await lireConfigHfl()),
    }
  }, {
    auth: ['admin'],
    body: t.Object({ url: t.Optional(t.String()), token: t.Optional(t.String()) }),
    response: { 200: EtatHfl },
    detail: { summary: 'Enregistrer les réglages de l\'EDR' },
  })
  .post('/harfanglab/test', async ({ status }) => {
    const cfg = await lireConfigHfl()
    if (!cfg) return status(400, { message: 'Renseignez l\'adresse et le jeton avant d\'essayer.' })
    return await testerHfl(cfg)
  }, {
    auth: ['admin'],
    response: {
      200: t.Union([
        t.Object({ ok: t.Literal(true), regles: t.Number(), schema: t.String() }),
        t.Object({ ok: t.Literal(false), message: t.String() }),
      ]),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Essayer la connexion à l\'EDR' },
  })
  .post('/harfanglab/sync', async ({ status }) => {
    if (!await lireConfigHfl()) return status(400, { message: 'EDR non configuré.' })
    try {
      return await synchroniserHfl()
    }
    catch (e) {
      return status(400, { message: e instanceof Error ? e.message : 'Synchronisation impossible.' })
    }
  }, {
    auth: ['admin'],
    response: {
      200: t.Object({ vues: t.Number(), ecrites: t.Number(), disparues: t.Number() }),
      400: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Relire les règles de l\'EDR maintenant' },
  })
