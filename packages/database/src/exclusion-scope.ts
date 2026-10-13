// PORTÉE D'UNE EXCLUSION — critères par outil, composition du libellé, détection des
// portées trop larges. Partagé serveur/interface pour que le formulaire propose exactement
// ce que l'API accepte.
//
// Les critères se COMBINENT : en pratique on exclut un chemin, une empreinte ou une règle,
// presque toujours restreint à une machine. Un « type d'exclusion » unique aurait forcé à
// choisir, et fait perdre la restriction qui limite justement la portée.

export interface ScopeField {
  key: string
  label: string
  placeholder: string
  /** Indication affichée sous le champ, quand la forme attendue n'est pas évidente. */
  hint?: string
}

export const SCOPE_FIELDS: Record<string, ScopeField[]> = {
  harfanglab: [
    { key: 'path', label: 'Chemin', placeholder: 'C:\\Program Files\\Metier\\agent.exe' },
    { key: 'hash', label: 'Empreinte SHA-256', placeholder: 'e3b0c44298fc1c14…', hint: '64 caractères hexadécimaux' },
    { key: 'process', label: 'Processus', placeholder: 'agent.exe' },
    { key: 'parentProcess', label: 'Processus parent', placeholder: 'services.exe' },
    { key: 'machine', label: 'Machine ou groupe', placeholder: 'srv-metier-01 · groupe « Serveurs métier »' },
  ],
  wazuh: [
    { key: 'ruleId', label: 'ID de règle', placeholder: '5710' },
    { key: 'agent', label: 'Agent', placeholder: 'srv-bastion-01 (id 004)' },
    { key: 'path', label: 'Chemin surveillé', placeholder: '/var/log/metier/*.log' },
    { key: 'field', label: 'Champ du décodeur', placeholder: 'srcip' },
    { key: 'value', label: 'Valeur du champ', placeholder: '10.1.2.3' },
  ],
  pare_feu: [
    { key: 'source', label: 'Source', placeholder: '10.1.2.0/24' },
    { key: 'destination', label: 'Destination', placeholder: '203.0.113.10' },
    { key: 'port', label: 'Port', placeholder: '443' },
    { key: 'protocol', label: 'Protocole', placeholder: 'TCP' },
    { key: 'direction', label: 'Sens', placeholder: 'sortant' },
  ],
  autre: [
    { key: 'description', label: 'Description de la règle', placeholder: 'Ce qui est exclu, aussi précisément que possible' },
    { key: 'machine', label: 'Machine ou périmètre', placeholder: 'srv-01 · VLAN Recherche' },
  ],
}

// Les clés se répètent d'un outil à l'autre avec des sens différents : `path` est un
// « Chemin » pour HarfangLab et un « Chemin surveillé » pour Wazuh. Le libellé se résout
// donc DANS LE CONTEXTE de l'outil, jamais sur une table globale — sinon le dernier outil
// déclaré écraserait les libellés des précédents.
function labelDe(tool: string | undefined, key: string): string {
  const champ = (SCOPE_FIELDS[tool ?? ''] ?? []).find(f => f.key === key)
  if (champ) return champ.label
  // Outil inconnu (ou critère hors liste) : on retombe sur le premier libellé trouvé.
  for (const champs of Object.values(SCOPE_FIELDS)) {
    const c = champs.find(f => f.key === key)
    if (c) return c.label
  }
  return key
}

/**
 * Compose le libellé lisible à partir des critères renseignés.
 * C'est ce texte qu'on lit dans le tableau et dans les journaux — le JSON ne sert qu'à
 * la recherche.
 */
export function composeScope(details: Record<string, string | undefined>, tool?: string): string {
  const ordre = (SCOPE_FIELDS[tool ?? ''] ?? []).map(f => f.key)
  return Object.entries(details)
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
    // Ordre du formulaire plutôt qu'ordre d'insertion : le libellé se lit toujours pareil.
    .sort(([a], [b]) => (ordre.indexOf(a) + 1 || 99) - (ordre.indexOf(b) + 1 || 99))
    .map(([k, v]) => `${labelDe(tool, k)} ${v!.trim()}`)
    .join(' · ')
}

// PORTÉES MANIFESTEMENT LARGES.
//
// Une exclusion sur `C:\` ou `0.0.0.0/0` n'est pas une exclusion, c'est un trou. On ne les
// interdit pas — il existe des cas légitimes — mais on exige une confirmation explicite :
// une friction volontaire, au seul endroit où elle a de la valeur.
const MOTIFS_LARGES: { motif: RegExp, explication: string }[] = [
  { motif: /^\*+$/, explication: 'un joker seul couvre absolument tout' },
  { motif: /^[a-z]:[\\/]?\*?$/i, explication: 'la racine d\'un disque couvre tout le système de fichiers' },
  { motif: /^\/\*?$/, explication: 'la racine « / » couvre tout le système de fichiers' },
  { motif: /^(0\.0\.0\.0\/0|::\/0)$/, explication: 'cette plage couvre l\'Internet entier' },
  { motif: /\/([0-9]|1[0-5])$/, explication: 'une plage plus large qu\'un /16 couvre des dizaines de milliers d\'adresses' },
  { motif: /^(c:[\\/]windows|\/etc|\/usr|\/bin|c:[\\/]program files)[\\/]?\*?$/i, explication: 'ce répertoire système contient des milliers d\'exécutables' },
]

export interface BroadScopeWarning {
  field: string
  value: string
  explanation: string
}

/** Repère les critères dont la portée est manifestement trop large. */
export function detectBroadScope(details: Record<string, string | undefined>, tool?: string): BroadScopeWarning[] {
  const alertes: BroadScopeWarning[] = []
  for (const [cle, valeur] of Object.entries(details)) {
    const v = (valeur ?? '').trim()
    if (!v) continue
    for (const { motif, explication } of MOTIFS_LARGES) {
      if (motif.test(v)) {
        alertes.push({ field: labelDe(tool, cle), value: v, explanation: explication })
        break
      }
    }
  }
  return alertes
}
