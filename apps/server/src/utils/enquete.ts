import { db } from '@slowpoke/database'
import { mainSchema, playbooksSchema, enquetesSchema } from '@slowpoke/database/tables'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { lireConfigLdap, connexionChiffree, lireEtatComptes } from '@slowpoke/connecteurs/ldap'
import { lireConfigWazuh, connexionChiffreeWazuh, lireAuthentifications, agregerAuthentifications, type Issue, type SourceJournal } from '@slowpoke/connecteurs/wazuh'
import { dejaVu } from './indicateurs'
import { analyserCases, analyserEnquetes } from './playbooks'
import { procedurePour, TOUTES_PROCEDURES } from './conduite'

// MOTEUR D'ENQUÊTE — chaque case outillée pose sa question, sait où chercher, lance la
// recherche en lecture seule avec les paramètres de l'incident, et garde la trace.
//
// Aucune requête libre : seuls les identifiants de la bibliothèque, et parmi eux ceux que
// Slowpoke sait exécuter. Une requête connue du dépôt mais pas encore exécutable le dit.

/** `periode` : début et fin, en ISO. */
export type Parametres = { compte: string[], incident: string[], periode: string[] }
export type Cellule = string | number | boolean | null
export type Execution =
  | { etat: 'execute', nombre: number, colonnes: string[], lignes: Record<string, Cellule>[], note: string | null }
  | { etat: 'guidee', commande: string }
  | { etat: 'indisponible', motif: string }

const PLAFOND_LIGNES = 200
/** L'accès précède presque toujours sa découverte : la période des journaux commence avant. */
const JOURS_AVANT_CONNAISSANCE = 30
export type Verdict = 'aucun' | 'trouve' | 'impossible'

async function parametresDe(incidentId: string): Promise<Parametres> {
  const personnes = await db.select({ email: mainSchema.incidentUser.email })
    .from(mainSchema.incidentUser)
    .where(eq(mainSchema.incidentUser.incidentId, incidentId))
  const comptes = [...new Set(personnes.map(p => p.email?.trim()).filter((e): e is string => Boolean(e)))]
  const [inc] = await db.select({ knowledgeAt: mainSchema.incident.knowledgeAt, createdAt: mainSchema.incident.createdAt })
    .from(mainSchema.incident)
    .where(eq(mainSchema.incident.id, incidentId))
    .limit(1)
  const repere = inc?.knowledgeAt ?? inc?.createdAt ?? new Date()
  const debut = new Date(repere.getTime() - JOURS_AVANT_CONNAISSANCE * 86_400_000)
  return { compte: comptes, incident: [incidentId], periode: [debut.toISOString(), new Date().toISOString()] }
}

const dateIso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString())
const dateHeureFr = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

const LIBELLES_SOURCE: Record<SourceJournal, string> = { zimbra: 'Zimbra', lemonldap: 'LemonLDAP', ldap: 'LDAP' }
const LIBELLES_ISSUE: Record<Issue, string> = {
  succes: 'succès', echec: 'échec', compte_inconnu: 'compte inconnu', mot_de_passe: 'mot de passe changé', indetermine: 'indéterminé',
}

/** L'identifiant de connexion n'est pas toujours l'adresse : LemonLDAP et slapd portent l'uid. */
async function identitesAnnuaire(mails: string[]): Promise<{ uids: string[], dns: string[], limite: string | null }> {
  const sansAnnuaire = (pourquoi: string) => ({
    uids: [], dns: [],
    limite: `${pourquoi} : recherche par adresse seulement, les lignes LemonLDAP et LDAP qui portent l'uid peuvent manquer.`,
  })
  const cfg = await lireConfigLdap()
  if (!cfg || !connexionChiffree(cfg)) return sansAnnuaire('Annuaire non configuré')
  try {
    const etats = await lireEtatComptes(cfg, mails)
    return {
      uids: etats.map(e => e.uid).filter((u): u is string => Boolean(u)),
      dns: etats.map(e => e.dn).filter((d): d is string => Boolean(d)),
      limite: etats.some(e => !e.trouve) ? sansAnnuaire('Un compte est absent de l\'annuaire').limite : null,
    }
  }
  catch (e) {
    return sansAnnuaire(`Annuaire injoignable (${e instanceof Error ? e.message : String(e)})`)
  }
}

const EXECUTEURS: Record<string, (p: Parametres) => Promise<Execution>> = {
  'slowpoke-connexions-compte': async (p) => {
    if (!p.compte.length) {
      return { etat: 'indisponible', motif: "Aucune personne concernée n'est consignée avec une adresse : la recherche ne peut porter sur aucun compte." }
    }
    const lignes = (await db.execute(sql`
      SELECT u.email, l.ip_address, l.country_name, l.activity_start, l.activity_end
      FROM phishing_connection_log l
      JOIN incident_user u ON u.id = l.concerned_user
      WHERE u.incident_id = ${p.incident[0]!}
      ORDER BY l.activity_start
      LIMIT ${PLAFOND_LIGNES}
    `)).rows as { email: string | null, ip_address: string, country_name: string | null, activity_start: string, activity_end: string | null }[]
    return {
      etat: 'execute',
      nombre: lignes.length,
      colonnes: ['compte', 'ip', 'pays', 'debut', 'fin'],
      lignes: lignes.map(l => ({ compte: l.email, ip: l.ip_address, pays: l.country_name, debut: dateIso(l.activity_start), fin: dateIso(l.activity_end) })),
      note: lignes.length
        ? null
        : "Aucune connexion consignée dans la fiche. Cela ne prouve pas qu'il n'y en a pas eu : les journaux d'authentification n'ont peut-être pas été relevés.",
    }
  },

  'slowpoke-recurrence': async (p) => {
    const dv = await dejaVu(p.incident[0]!)
    const lignes = dv.valeurs.flatMap(v => v.autres.map(a => ({
      valeur: v.valeur, origine: v.origine, incident: a.incidentId, niveau: a.niveau, le: a.createdAt, archive: a.archive,
    })))
    return {
      etat: 'execute',
      nombre: new Set(lignes.map(l => l.incident)).size,
      colonnes: ['valeur', 'origine', 'incident', 'niveau', 'le', 'archive'],
      lignes: lignes.slice(0, PLAFOND_LIGNES),
      note: null,
    }
  },

  'ldap-etat-compte': async (p) => {
    const cfg = await lireConfigLdap()
    if (!cfg) return { etat: 'indisponible', motif: "L'annuaire n'est pas configuré dans les réglages : la vérification se fait à la main." }
    if (!connexionChiffree(cfg)) {
      return { etat: 'indisponible', motif: "Liaison à l'annuaire refusée : l'adresse doit commencer par ldaps://, sans quoi le mot de passe de liaison circulerait en clair." }
    }
    if (!p.compte.length) return { etat: 'indisponible', motif: "Aucune personne concernée n'est consignée avec une adresse." }
    try {
      const etats = await lireEtatComptes(cfg, p.compte)
      return {
        etat: 'execute',
        nombre: etats.filter(e => e.trouve).length,
        colonnes: ['compte', 'trouve', 'motDePasseChangeLe', 'mfa', 'groupes'],
        lignes: etats.map(e => ({ compte: e.mail, trouve: e.trouve, motDePasseChangeLe: e.motDePasseChangeLe, mfa: e.mfa, groupes: e.groupes.length })),
        note: etats.some(e => !e.trouve)
          ? "Un compte absent de l'annuaire n'est pas un compte sain : l'adresse consignée est peut-être un alias."
          : null,
      }
    }
    catch (e) {
      return { etat: 'indisponible', motif: `L'annuaire n'a pas répondu : ${e instanceof Error ? e.message : String(e)}` }
    }
  },
}

EXECUTEURS['wazuh-auth-compte'] = async (p) => {
  const cfg = await lireConfigWazuh()
  if (!cfg) return { etat: 'indisponible', motif: "Les archives de Wazuh ne sont pas configurées dans les réglages : la vérification se fait à la main." }
  if (!connexionChiffreeWazuh(cfg)) {
    return { etat: 'indisponible', motif: "Connexion à l'indexeur refusée : l'adresse doit commencer par https://, sans quoi le mot de passe circulerait en clair." }
  }
  if (!p.compte.length) return { etat: 'indisponible', motif: "Aucune personne concernée n'est consignée avec une adresse." }
  const [debut, fin] = p.periode as [string, string]

  const annuaire = await identitesAnnuaire(p.compte)
  let lecture: Awaited<ReturnType<typeof lireAuthentifications>>
  try {
    lecture = await lireAuthentifications(cfg, { identifiants: [...p.compte, ...annuaire.uids], dns: annuaire.dns, debut, fin })
  }
  catch (e) {
    return { etat: 'indisponible', motif: `L'indexeur n'a pas répondu : ${e instanceof Error ? e.message : String(e)}` }
  }

  const lignes = agregerAuthentifications(lecture.evenements)
  const vues = new Set(lignes.map(l => l.source))
  const absentes = (['zimbra', 'lemonldap', 'ldap'] as const).filter(s => !vues.has(s)).map(s => LIBELLES_SOURCE[s])
  const { premier, dernier } = lecture.couverture
  // Zéro ligne ne vaut « rien trouvé » que si rien de ce qui suit n'est signalé.
  const notes = [
    `Période cherchée : du ${dateHeureFr(debut)} au ${dateHeureFr(fin)}.`,
    !premier ? "L'index ne contient aucune ligne : rien n'a pu être cherché." : null,
    premier && premier > debut ? `Les archives ne remontent qu'au ${dateHeureFr(premier)} : avant, rien n'a pu être cherché.` : null,
    dernier && Date.parse(fin) - Date.parse(dernier) > 86_400_000 ? `Dernière ligne indexée le ${dateHeureFr(dernier)} : la remontée semble interrompue.` : null,
    lecture.total > lecture.lues ? `Plafond atteint : ${lecture.lues} lignes lues sur ${lecture.total}, les plus récentes. La période n'est pas couverte en entier.` : null,
    premier && absentes.length ? `Aucune ligne ${absentes.join(', ')} : soit aucune authentification, soit ces journaux ne remontent pas dans l'index.` : null,
    vues.has('ldap') ? "Une liaison LDAP porte le plus souvent l'adresse du serveur qui s'est lié (LemonLDAP, Zimbra), pas celle de l'usager." : null,
    lignes.length > PLAFOND_LIGNES ? `Seules les ${PLAFOND_LIGNES} premières lignes de la synthèse sont gardées.` : null,
    annuaire.limite,
  ].filter((n): n is string => Boolean(n))

  return {
    etat: 'execute',
    nombre: lignes.reduce((n, l) => n + l.nombre, 0),
    colonnes: ['source', 'compte', 'issue', 'ip', 'protocole', 'nombre', 'premier', 'dernier'],
    lignes: lignes.slice(0, PLAFOND_LIGNES).map(l => ({
      source: LIBELLES_SOURCE[l.source], compte: l.compte, issue: LIBELLES_ISSUE[l.issue], ip: l.ip,
      protocole: l.protocole, nombre: l.nombre, premier: l.premier, dernier: l.dernier,
    })),
    note: notes.join('\n'),
  }
}

/** Identifiants que Slowpoke sait exécuter. Les requêtes guidées n'en ont pas besoin. */
export const REQUETES_EXECUTABLES = Object.keys(EXECUTEURS)

async function contexte(incidentId: string, checklistImposee?: string) {
  const [incident] = await db.select().from(mainSchema.incident)
    .where(eq(mainSchema.incident.id, incidentId)).limit(1)
  if (!incident) return null
  const [{ n } = { n: 0 }] = await db.select({ n: count() })
    .from(mainSchema.incidentUser)
    .where(eq(mainSchema.incidentUser.incidentId, incidentId))
  // Même choix que l'onglet Conduite : la procédure imposée à la main prime.
  const auto = procedurePour(incident, Number(n))
  const choisie = checklistImposee
    ? TOUTES_PROCEDURES.find(x => x.checklist === checklistImposee) ?? auto
    : auto
  const [doc] = await db.select().from(playbooksSchema.playbook)
    .where(eq(playbooksSchema.playbook.reference, choisie.checklist)).limit(1)
  return { choisie, doc: doc ?? null }
}

export async function etapesEnquete(incidentId: string, checklistImposee?: string) {
  const ctx = await contexte(incidentId, checklistImposee)
  if (!ctx) return null
  const { choisie, doc } = ctx

  const parCase = new Map((doc ? analyserCases(doc.corps) : []).map(c => [c.cle, c]))
  const outillees = (doc ? analyserEnquetes(doc.corps) : []).filter(e => parCase.has(e.caseCle))

  const ids = [...new Set(outillees.map(e => e.bloc.requete))]
  const R = enquetesSchema.enqueteRequete
  const requetes = ids.length ? await db.select().from(R).where(inArray(R.id, ids)) : []
  const parId = new Map(requetes.map(r => [r.id, r]))

  const E = enquetesSchema.incidentEnqueteEtape
  const etats = await db.select().from(E)
    .where(and(eq(E.incidentId, incidentId), eq(E.playbookReference, choisie.checklist)))
  const parCle = new Map(etats.map(e => [e.cle, e]))

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(R)

  return {
    procedure: { checklist: choisie.checklist, motif: choisie.motif, impose: Boolean(checklistImposee) },
    checklistTrouvee: Boolean(doc),
    requetesSynchronisees: Number(total),
    etapes: outillees.map(({ cle, caseCle, bloc }) => {
      const c = parCase.get(caseCle)!
      const r = parId.get(bloc.requete)
      const e = parCle.get(cle)
      return {
        cle,
        caseCle,
        texte: c.texte,
        section: c.section,
        bloc,
        executable: r ? (r.source === 'guidee' || REQUETES_EXECUTABLES.includes(r.id)) : false,
        requete: r
          ? { id: r.id, titre: r.titre, source: r.source, pourquoi: r.pourquoi, lireLeResultat: r.lireLeResultat, commande: r.commande, commit: r.commit }
          : null,
        etat: e
          ? {
              lanceLe: e.lanceLe?.toISOString() ?? null,
              nombre: e.nombre,
              resultat: (e.resultat ?? null) as Execution | null,
              requeteCommit: e.requeteCommit,
              verdict: e.verdict,
              motif: e.motif,
              verdictLe: e.verdictLe?.toISOString() ?? null,
            }
          : null,
      }
    }),
  }
}

type Echec = { erreur: string, code: 404 | 409 | 422 }

async function etapeDe(incidentId: string, cle: string, checklistImposee?: string) {
  const ctx = await contexte(incidentId, checklistImposee)
  if (!ctx) return { erreur: 'Incident introuvable.', code: 404 } as Echec
  if (!ctx.doc) return { erreur: "La checklist applicable n'est pas synchronisée depuis le dépôt de procédures.", code: 409 } as Echec
  const etape = analyserEnquetes(ctx.doc.corps).find(e => e.cle === cle)
  const texte = etape && analyserCases(ctx.doc.corps).find(c => c.cle === etape.caseCle)?.texte
  if (!etape || !texte) return { erreur: "Cette étape n'existe pas dans la checklist applicable.", code: 404 } as Echec
  const bloc = etape.bloc
  const [requete] = await db.select().from(enquetesSchema.enqueteRequete)
    .where(eq(enquetesSchema.enqueteRequete.id, bloc.requete)).limit(1)
  return { checklist: ctx.choisie.checklist, bloc, texte, requete: requete ?? null }
}

/** Lance la recherche d'une étape, en lecture seule, et en garde le résultat et la version de la requête. */
export async function lancerEtape(incidentId: string, cle: string, auteur: string | undefined, checklistImposee?: string) {
  const et = await etapeDe(incidentId, cle, checklistImposee)
  if ('erreur' in et) return et
  if (!et.requete) {
    return { erreur: `Requête « ${et.bloc.requete} » absente de la bibliothèque synchronisée.`, code: 409 } as Echec
  }
  const r = et.requete
  const p = await parametresDe(incidentId)

  const execution: Execution = r.source === 'guidee'
    ? {
        etat: 'guidee',
        commande: (r.commande ?? '')
          .replaceAll('{compte}', p.compte.join(', ') || '(aucun compte consigné)')
          .replaceAll('{periode}', `du ${dateHeureFr(p.periode[0]!)} au ${dateHeureFr(p.periode[1]!)}`),
      }
    : EXECUTEURS[r.id]
      ? await EXECUTEURS[r.id]!(p)
      : { etat: 'indisponible', motif: `La requête « ${r.id} » est décrite dans le dépôt, mais Slowpoke ne sait pas encore l'exécuter.` }

  const E = enquetesSchema.incidentEnqueteEtape
  const valeurs = {
    requeteId: r.id,
    requeteCommit: r.commit,
    source: r.source,
    parametres: p,
    nombre: execution.etat === 'execute' ? execution.nombre : null,
    resultat: execution,
    lanceLe: new Date(),
    lancePar: auteur ?? null,
  }
  await db.insert(E)
    .values({ incidentId, playbookReference: et.checklist, cle, ...valeurs })
    .onConflictDoUpdate({ target: [E.incidentId, E.playbookReference, E.cle], set: valeurs })

  return { execution, titre: r.titre, requeteCommit: r.commit }
}

/** Enregistre le verdict d'une étape. « Impossible à vérifier » exige un motif. */
export async function enregistrerVerdict(incidentId: string, cle: string, verdict: Verdict, motif: string | undefined, auteur: string | undefined, checklistImposee?: string) {
  const et = await etapeDe(incidentId, cle, checklistImposee)
  if ('erreur' in et) return et
  if (!et.bloc.verdicts.includes(verdict)) {
    return { erreur: `Le verdict « ${verdict} » n'est pas prévu par cette étape.`, code: 422 } as Echec
  }
  const motifPropre = motif?.trim() || null
  if (verdict === 'impossible' && !motifPropre) {
    return { erreur: 'Un verdict « impossible à vérifier » doit porter son motif.', code: 422 } as Echec
  }

  const E = enquetesSchema.incidentEnqueteEtape
  const valeurs = { verdict, motif: motifPropre, verdictLe: new Date(), verdictPar: auteur ?? null }
  await db.insert(E)
    .values({
      incidentId, playbookReference: et.checklist, cle,
      requeteId: et.bloc.requete, requeteCommit: et.requete?.commit ?? null, source: et.requete?.source ?? 'inconnue',
      ...valeurs,
    })
    .onConflictDoUpdate({ target: [E.incidentId, E.playbookReference, E.cle], set: valeurs })

  return { verdict, motif: motifPropre, texte: et.texte, siTrouve: et.bloc.siTrouve }
}
