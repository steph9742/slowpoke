// ORGANISATION DE L'ÉTABLISSEMENT — à remplir à l'installation.
//
// Ces trois tables sont les seules données propres à un établissement dans le code. Elles
// servent les statistiques « incidents par composante » : sans elles, tout rattachement est
// compté comme « sans composante », ce qui s'affiche tel quel au lieu d'être deviné.
//
// Elles sont importées par le serveur ET par le frontend : garder des structures littérales,
// sans lecture de fichier ni accès réseau.

/**
 * Composantes, par code de rattachement.
 *
 * La clé est le code tel que l'annuaire ou la saisie le portent (`cmpi-901` → `901`), parce
 * que les libellés saisis vieillissent — un service renommé garde son code. `ETAB` désigne
 * l'établissement lui-même, sans composante plus précise.
 *
 * Exemple :
 *   '901': 'UFR Sciences et techniques',
 *   '911': 'IUT de …',
 *   ETAB: 'Université de …',
 */
export const COMPOSANTES: Record<string, string> = {}

/**
 * Entités de l'inventaire (GLPI) vers le code de composante.
 *
 * L'inventaire ne parle pas en codes mais en abréviations hiérarchiques
 * (`ÉTAB > IUT > Dept-INFO`) ; les personnes, elles, sont rattachées par code. Sans cette
 * passerelle, un décompte par composante ne peut pas mêler machines et personnes.
 *
 * Une entité absente de cette table reste sans code : c'est le cas des laboratoires et des
 * directions internes, qui se comptent à part. Rien n'est déduit d'une ressemblance de nom.
 *
 * Exemple :
 *   'IUT': '911',
 *   ST: '903',
 */
export const ENTITES: Record<string, string> = {}

/**
 * Sigles de laboratoires, tels que l'inventaire les écrit (sans code d'unité).
 *
 * Sert uniquement à distinguer « laboratoire » de « rattachement absent ».
 *
 * Exemple : new Set(['FEMTO-ST', 'LMB'])
 */
export const SIGLES_LABORATOIRES = new Set<string>([])

/**
 * Nature d'une entité telle que le SOC la nomme, pour classer ses tickets.
 *
 * Les libellés d'entité d'un prestataire ne coïncident pas forcément avec ceux de
 * l'inventaire : la table est donc distincte de {@link ENTITES}. Une entité absente est
 * rendue sans périmètre, ce qui se compte à part.
 *
 * Exemple :
 *   'UFR ST': 'composante',
 *   'FEMTO-ST': 'laboratoire',
 *   'DSI - Réseau': 'service_central',
 */
export const PERIMETRE_PAR_ENTITE: Record<string, 'composante' | 'laboratoire' | 'service_central'> = {}

/** Clé réservée à l'établissement dans {@link COMPOSANTES}. */
export const CODE_ETABLISSEMENT = 'ETAB'

/** Préfixes de saisie rencontrés devant un code (`cmpi-901`) : ils qualifient la nature du rattachement, pas la composante. */
export const PREFIXES_CODE = ['cmpi', 'cmpa', 'cmpg'] as const
