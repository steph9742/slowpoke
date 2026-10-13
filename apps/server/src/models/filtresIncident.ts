import { t } from 'elysia'
import { mainSchema } from '@slowpoke/database/tables'
import { IncidentType, SeverityType, StatusType, ResolutionType } from './type'

// LES FILTRES D'INCIDENT, DÉCLARÉS UNE FOIS.
//
// La liste, la liste enveloppée et le décompte les redéclaraient chacun : trois copies qui
// divergeaient déjà sur la gravité, et un total qui ne compte pas ce que la liste montre.
// Le socle est ici, les routes le composent.
//
// C'est aussi ce que `/api/lectures` publie : le catalogue des filtres est DÉRIVÉ de ce
// schéma, donc un filtre ajouté ici s'y montre sans que personne y pense, et aucun filtre
// publié ne peut être refusé par le serveur.

const STATUTS = mainSchema.incidentStatus.enumValues.join('|')

export const proprietesFiltres = {
  id: t.Optional(t.String({ description: "Fragment d'identifiant, correspondance partielle et insensible à la casse." })),
  type: t.Optional(IncidentType),
  status: t.Optional(StatusType),
  statuts: t.Optional(t.String({
    pattern: `^(${STATUTS})(,(${STATUTS}))*$`,
    description: `Plusieurs statuts à la fois, séparés par des virgules. « open,investigating,in_progress,surveillance » : tout ce qui n'est ni résolu ni fermé. Se combine par ET avec \`status\`. Valeurs : ${mainSchema.incidentStatus.enumValues.join(' · ')}`,
  })),
  severity: t.Optional(SeverityType),
  resolution: t.Optional(ResolutionType),
  depuis: t.Optional(t.String({ description: "Borne basse sur `knowledgeAt` (ISO 8601). Porte sur ce que l'établissement a SU, pas sur la date de saisie." })),
  jusqua: t.Optional(t.String({ description: 'Borne haute sur `knowledgeAt` (ISO 8601).' })),
  veilleExpireAvant: t.Optional(t.String({ description: "Veilles dont `surveillanceExpiresAt` tombe avant cette date (ISO 8601). À combiner avec `status=surveillance`." })),
}

const proprietesPagination = {
  page: t.Optional(t.Number({ description: 'Numéro de page, à partir de 1.' })),
  pageSize: t.Optional(t.Number({ description: "Nombre d'incidents par page, 10 par défaut." })),
  order: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')], { description: 'Sens du tri, `desc` par défaut.' })),
  sort: t.Optional(t.Union([
    t.Literal('updatedAt'), t.Literal('createdAt'), t.Literal('knowledgeAt'), t.Literal('severity'),
  ], { description: "Colonne de tri. `updatedAt` par défaut — soit la date de MODIFICATION, qui n'est pas l'ordre de signalement. Le tri est toujours départagé par `id`, pour que la pagination ne répète ni n'omette de ligne." })),
}

/** Décompte : les filtres seuls, sans pagination — il ne rend aucune ligne. */
export const QueryCompte = t.Object(proprietesFiltres)

/** Liste nue. */
export const QueryListe = t.Object({ ...proprietesFiltres, ...proprietesPagination })

/** Liste enveloppée : la seule à pouvoir joindre les machines. */
export const QueryListeEnveloppe = t.Object({
  ...proprietesFiltres,
  ...proprietesPagination,
  avecMachines: t.Optional(t.Boolean({ description: "Joindre les machines de chaque incident, avec leur entité, leur groupe et leur criticité. Une seule requête pour toute la page." })),
})

/** Tout ce qu'accepte la route la plus complète — la base du catalogue publié. */
export const TOUS_FILTRES = QueryListeEnveloppe
