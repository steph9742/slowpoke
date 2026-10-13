import { db } from '@slowpoke/database'
import { exclusionsSchema, harfanglabSchema } from '@slowpoke/database/tables'
import { severityCode } from '@slowpoke/database/severity'
import { sql } from 'drizzle-orm'

// CHERCHER UN INDICATEUR — « est-ce que ceci est connu ? », posé hors de tout incident.
//
// Chaque source dit ce qu'elle a trouvé ou pourquoi elle ne peut pas répondre : « rien trouvé »
// et « non couvert » ne se confondent jamais.

export type Nature = 'ipv4' | 'ipv6' | 'email' | 'url' | 'domaine' | 'md5' | 'sha1' | 'sha256' | 'compte'

/** Nature d'une valeur, par sa forme seule. `compte` est le repli : un identifiant libre. */
export function natureDe(v: string): Nature {
  if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(v)) return 'ipv4'
  if (v.includes(':') && /^[0-9a-f:.]+(\/\d{1,3})?$/i.test(v)) return 'ipv6'
  if (/^https?:\/\//i.test(v)) return 'url'
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'email'
  if (/^[a-f0-9]{64}$/i.test(v)) return 'sha256'
  if (/^[a-f0-9]{40}$/i.test(v)) return 'sha1'
  if (/^[a-f0-9]{32}$/i.test(v)) return 'md5'
  if (/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) return 'domaine'
  return 'compte'
}

/** Formes comparées. Une URL se cherche aussi par son hôte, sous lequel elle est souvent consignée. */
function candidatsDe(v: string, nature: Nature): string[] {
  const c = new Set([v.toLowerCase()])
  if (nature === 'url') {
    try { c.add(new URL(v).hostname.toLowerCase()) } catch { /* URL mal formée : la valeur seule */ }
  }
  return [...c]
}

// Toutes les valeurs d'indicateurs consignées dans Slowpoke, avec leur incident et leur origine.
// Même union que la corrélation, étendue aux sources de l'hameçonnage et aux rattachements.
// Constante SQL figée : aucune donnée d'appelant n'y entre.
export const VALEURS = sql.raw(`
  SELECT m.incident_id, 'iocs' AS origine, x AS valeur FROM malware_incident m, UNNEST(m.iocs) x
  UNION ALL SELECT m.incident_id, 'c2', x FROM malware_incident m, UNNEST(m.c2) x
  UNION ALL SELECT m.incident_id, 'machines', x FROM malware_incident m, UNNEST(m.machines) x
  UNION ALL SELECT r.incident_id, 'iocs', x FROM ransomware_incident r, UNNEST(r.iocs) x
  UNION ALL SELECT r.incident_id, 'machines', x FROM ransomware_incident r, UNNEST(r.machines) x
  UNION ALL SELECT n.incident_id, 'machines', x FROM intrusion_incident n, UNNEST(n.machines) x
  UNION ALL SELECT n.incident_id, 'sourceIps', x FROM intrusion_incident n, UNNEST(n.source_ips) x
  UNION ALL SELECT n.incident_id, 'compromisedAccounts', x FROM intrusion_incident n, UNNEST(n.compromised_accounts) x
  UNION ALL SELECT d.incident_id, 'sourceIps', x FROM ddos_incident d, UNNEST(d.source_ips) x
  UNION ALL SELECT u.incident_id, 'connexionIp', l.ip_address FROM phishing_connection_log l JOIN incident_user u ON u.id = l.concerned_user
  UNION ALL SELECT u.incident_id, 'expediteur', p.from_address FROM phishing_identity p JOIN incident_user u ON u.id = p.concerned_user
  UNION ALL SELECT u.incident_id, 'repondreA', p.reply_address FROM phishing_identity p JOIN incident_user u ON u.id = p.concerned_user
  UNION ALL SELECT u.incident_id, 'personne', u.email FROM incident_user u
  UNION ALL SELECT im.incident_id, 'machineRattachee', im.nom FROM incident_machine im
`)

export type LigneIncident = {
  incident_id: string, origine: string, valeur: string,
  type: string, severity: string, status: string, resolution: string | null,
  created_at: string | Date, archive_le: string | Date | null,
}

export const enIncident = (l: LigneIncident) => ({
  incidentId: l.incident_id,
  origine: l.origine,
  valeur: l.valeur,
  type: l.type,
  severity: l.severity,
  niveau: severityCode(l.severity),
  status: l.status,
  resolution: l.resolution,
  createdAt: new Date(l.created_at).toISOString(),
  // Un incident archivé reste une connaissance : il est rendu, et signalé comme tel.
  archive: l.archive_le !== null,
})

/** Recherche d'une valeur dans Slowpoke, les listes blanches et l'inventaire. Aucune trace ici : c'est au point d'entrée de l'écrire. */
export async function chercherIndicateur(valeur: string) {
  const nature = natureDe(valeur)
  const candidats = candidatsDe(valeur, nature)
  const liste = sql.join(candidats.map(c => sql`${c}`), sql`, `)
  // Les listes blanches se cherchent sous CHAQUE forme, comme l'historique. Chercher la seule
  // valeur saisie ratait une URL couverte par une règle écrite sur son hôte : l'URL complète
  // n'est pas contenue dans « hostname contains mal.exemple.org ». Les jokers sont échappés,
  // sinon « % » rendrait toutes les règles.
  const motifs = candidats.map(c => `%${c.replace(/[\\%_]/g, m => `\\${m}`)}%`)

  const vus = (await db.execute(sql`
    SELECT DISTINCT v.incident_id, v.origine, v.valeur, i.type, i.severity, i.status, i.resolution, i.created_at, i.archive_le
    FROM (${VALEURS}) v
    JOIN incident i ON i.id = v.incident_id
    WHERE lower(trim(v.valeur)) IN (${liste})
    ORDER BY i.created_at DESC
    LIMIT 100
  `)).rows as LigneIncident[]

  const X = exclusionsSchema.exclusion
  const exclusions = await db.select({ id: X.id, incidentId: X.incidentId, scope: X.scope, state: X.state })
    .from(X)
    .where(sql.join(motifs.map(m => sql`(${X.scope} ILIKE ${m} OR ${X.scopeDetails}::text ILIKE ${m})`), sql` OR `))
    .limit(50)

  const Rg = harfanglabSchema.harfanglabRule
  const reglesEdr = await db.select({
    ref: Rg.ref, libelle: Rg.libelle, cible: Rg.cible, presente: Rg.presente, fourniParEditeur: Rg.fourniParEditeur,
  })
    .from(Rg)
    .where(sql`EXISTS (SELECT 1 FROM unnest(${Rg.criteres}) c WHERE ${sql.join(motifs.map(m => sql`c ILIKE ${m}`), sql` OR `)})`)
    .limit(50)

  // L'inventaire ne connaît que des noms de machines : inutile d'y chercher une empreinte.
  const inventaireInterroge = nature === 'compte' || nature === 'domaine'
  const machines = inventaireInterroge
    ? (await db.execute(sql`
        SELECT glpi_id, nom, entite_complet, critique FROM glpi_machine
        WHERE lower(nom) IN (${liste}) LIMIT 20
      `)).rows as { glpi_id: string, nom: string, entite_complet: string | null, critique: boolean }[]
    : []

  // Un nom ou un fragment d'identifiant se cherche AUSSI dans les personnes concernées, par
  // correspondance partielle : on cherche « Dupont », pas l'adresse exacte. Trois caractères
  // au moins, sinon « a » rendrait toutes les personnes de la base.
  const rechercheParNom: 'faite' | 'trop_courte' | 'sans_objet' = nature !== 'compte'
    ? 'sans_objet'
    : valeur.length >= 3 ? 'faite' : 'trop_courte'
  const parNom = rechercheParNom === 'faite'
    ? (await db.execute(sql`
        SELECT DISTINCT u.incident_id, 'personneNom' AS origine, u.full_name AS valeur,
               i.type, i.severity, i.status, i.resolution, i.created_at, i.archive_le
        FROM incident_user u
        JOIN incident i ON i.id = u.incident_id
        WHERE u.full_name ILIKE ${motifs[0]!} OR u.email ILIKE ${motifs[0]!}
        ORDER BY i.created_at DESC
        LIMIT 100
      `)).rows as LigneIncident[]
    : []
  const dejaVus = new Set(vus.map(v => `${v.incident_id}|${v.valeur.toLowerCase()}`))
  const resultats = [...vus, ...parNom.filter(l => !dejaVus.has(`${l.incident_id}|${l.valeur.toLowerCase()}`))]
    .slice(0, 100)
    .map(enIncident)
  const dansLeRegistre = { total: resultats.length, plafond: 100, rechercheParNom, resultats }
  return {
    valeur,
    nature,
    candidats,
    slowpoke: dansLeRegistre,
    // ANCIEN NOM DU MÊME BLOC, conservé pour les consommateurs en place : l'application
    // s'est appelée « Sniff », et une clé de réponse ne se renomme pas sans prévenir. Même
    // objet, jamais une seconde vérité. À retirer quand plus aucun appelant ne le lit.
    sniff: dansLeRegistre,
    listesBlanches: { exclusions, reglesEdr },
    inventaire: inventaireInterroge
      ? { interroge: true as const, machines: machines.map(m => ({ glpiId: m.glpi_id, nom: m.nom, entite: m.entite_complet, critique: m.critique })) }
      : { interroge: false as const, motif: "L'inventaire ne recense que des noms de machines." },
    edr: {
      interroge: false as const,
      motif: "La recherche dans la télémétrie HarfangLab n'est pas encore branchée. Elle ne couvrirait de toute façon que les 564 hôtes équipés de l'agent, sur environ 8 150.",
    },
  }
}

/** Les valeurs d'un incident retrouvées dans d'autres. */
export async function dejaVu(incidentId: string) {
  const lignes = (await db.execute(sql`
    SELECT DISTINCT a.valeur, a.origine, i.id AS incident_id, i.type, i.severity, i.status, i.resolution, i.created_at, i.archive_le
    FROM (${VALEURS}) a
    JOIN (${VALEURS}) b ON lower(trim(a.valeur)) = lower(trim(b.valeur)) AND b.incident_id <> a.incident_id
    JOIN incident i ON i.id = b.incident_id
    WHERE a.incident_id = ${incidentId}
      AND a.valeur IS NOT NULL AND length(trim(a.valeur)) > 0
    ORDER BY i.created_at DESC
    LIMIT 200
  `)).rows as LigneIncident[]

  const parValeur = new Map<string, { valeur: string, origine: string, autres: ReturnType<typeof enIncident>[] }>()
  for (const l of lignes) {
    const cle = l.valeur.trim().toLowerCase()
    const groupe = parValeur.get(cle) ?? { valeur: l.valeur, origine: l.origine, autres: [] }
    groupe.autres.push(enIncident(l))
    parValeur.set(cle, groupe)
  }
  return { incidentId, valeurs: [...parValeur.values()] }
}
