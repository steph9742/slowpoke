// Formatage des métadonnées jsonb (additionalInfo / customFields) affichées dans les détails d'incident.
// Objectif : rendre lisibles les champs bruts issus des imports (CERT RENATER, etc.)
//  - clés SOURCE_SIGNALEMENT / source_signalement -> « Source du signalement »
//  - valeurs en minuscules -> Capitalisées, acronymes en majuscules (anssi -> ANSSI)

// Acronymes à toujours écrire en majuscules (clés ET valeurs), quel que soit leur casse d'origine.
const ACRONYMS = new Set([
  'url', 'ip', 'tlp', 'pap', 'id', 'anssi', 'renater', 'cert', 'http', 'https',
  'dns', 'c2', 'ioc', 'rnt', 'ssi', 'asn', 'ovh', 'fr', 'eu', 'vpn', 'smtp', 'imap',
])

// Libellés explicites des clés connues (priment sur l'humanisation automatique). Clé normalisée en minuscules.
const KEY_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  renater_version: 'Version du document',
  incident_id_renater: 'Identifiant RENATER',
  tlp: 'TLP',
  pap: 'PAP',
  confidence: 'Niveau de confiance',
  severite_renater: 'Sévérité RENATER',
  source_signalement: 'Source du signalement',
  // Import du SOC (Advens)
  reference_soc: 'Référence SOC',
  statut_soc: 'Statut chez le SOC',
  motif_cloture_soc: 'Motif de clôture du SOC',
  code_etsi: 'Code ETSI',
  libelle_etsi: 'Catégorie ETSI',
  chaine_attaque: 'Étape de la chaîne d\'attaque',
  priorite_soc: 'Priorité SOC',
  entite_concernee: 'Entité concernée',
  echeance_soc: 'Échéance fixée par le SOC',
  facilite_correction: 'Facilité de correction',
  impact_soc: 'Impact estimé par le SOC',
  facilite_exploitation: 'Facilité d\'exploitation',
  kibana_url: 'Voir chez le SOC',
  synthese_soc: 'Synthèse du SOC',
  details_soc: 'Description détaillée du SOC',
  recommandation_soc: 'Recommandations du SOC',
  postes_concernes: 'Postes concernés',
  source_ip: 'IP source',
  source_name: 'Nom de la source',
  source_prot: 'Protocole source',
  record_log: 'Journal réseau',
  url_site: 'URL du site',
  nom_domaine: 'Nom de domaine',
  nom_serveur: 'Nom du serveur',
  ip_source: 'IP source',
}

// Valeurs à réécrire telles quelles (sigles, noms propres, codes TLP/PAP).
const VALUE_LABELS: Record<string, string> = {
  'anssi': 'ANSSI',
  'renater': 'RENATER',
  'cert-renater': 'CERT RENATER',
  'cert renater': 'CERT RENATER',
  // Codes TLP/PAP : conservés en majuscules (convention sécurité)
  'clear': 'CLEAR',
  'white': 'WHITE',
  'green': 'GREEN',
  'amber': 'AMBER',
  'amber+strict': 'AMBER+STRICT',
  'red': 'RED',
}

function capitalizeToken(word: string, isFirst: boolean): string {
  const lower = word.toLowerCase()
  if (ACRONYMS.has(lower)) return lower.toUpperCase()
  if (!isFirst) return lower
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// snake_case / SCREAMING_CASE / kebab-case -> « Phrase lisible »
function humanizeKey(key: string): string {
  const words = String(key).replace(/[_-]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return String(key)
  return words.map((w, i) => capitalizeToken(w, i === 0)).join(' ')
}

export function metadataKeyLabel(key: string | number): string {
  const norm = String(key).trim().toLowerCase()
  return KEY_LABELS[norm] ?? humanizeKey(String(key))
}

// Une valeur « prose » (que des lettres/espaces/tirets) est capitalisée ; les IP, hash, URLs,
// dates, nombres restent bruts (et s'affichent en mono).
function isProse(value: string): boolean {
  return /^[a-zà-ÿ][a-zà-ÿ' -]*$/i.test(value.trim())
}

export function metadataValueLabel(value: unknown): string {
  if (value == null) return ''
  const s = String(value).trim()
  if (!s) return ''
  const norm = s.toLowerCase()
  if (VALUE_LABELS[norm]) return VALUE_LABELS[norm]
  if (!isProse(s)) return s
  return s.split(/\s+/).map((w, i) => capitalizeToken(w, i === 0)).join(' ')
}

export interface MetadataEntry {
  key: string
  label: string
  value: string
  /** true = valeur technique (IP, hash, URL…) -> à afficher en police mono */
  mono: boolean
  /** true = valeur multi-lignes ou très longue (journal réseau…) -> bloc dépliable pleine largeur */
  long: boolean
}

// Au-delà, une valeur est traitée comme un bloc dépliable plutôt qu'une ligne.
const LONG_VALUE_THRESHOLD = 160

// Transforme un objet jsonb plat en entrées formatées, prêtes à afficher.
// Renvoie null si ce n'est pas un objet plat (ex. note en texte libre).
export function metadataEntries(info: unknown): MetadataEntry[] | null {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return null
  const out: MetadataEntry[] = []
  for (const [key, raw] of Object.entries(info as Record<string, unknown>)) {
    if (raw == null || raw === '') continue
    const s = String(raw).trim()
    if (!s) continue
    const long = s.includes('\n') || s.length > LONG_VALUE_THRESHOLD
    out.push({
      key,
      label: metadataKeyLabel(key),
      // une valeur longue (journal réseau) est affichée brute : pas de capitalisation
      value: long ? s : metadataValueLabel(raw),
      mono: long || !isProse(s),
      long,
    })
  }
  return out.length ? out : null
}
