import { mainSchema } from "@slowpoke/database/tables"
import { SEVERITY_LEVELS } from "@slowpoke/database/severity"
import { t } from "elysia"

// VOCABULAIRES FERMÉS, ÉCRITS EN TOUTES LETTRES.
//
// `createSelectSchema` produisait `t.Union([t.String(), t.String(), …])` : le schéma était
// bien fermé, mais ni `/openapi` ni le message d'un 422 ne disaient SUR QUOI. Un appelant
// apprenait qu'il existe quatre valeurs sans apprendre lesquelles, et repartait en texte
// libre — donc en devinant.
//
// Les littéraux sont dérivés de `enumValues` : ajouter une valeur à l'enum l'expose ici
// sans rien à recopier, et aucune liste ne peut diverger du code.
const litteraux = (valeurs: readonly string[]) =>
  valeurs.map(v => t.Literal(v)) as unknown as Parameters<typeof t.Union>[0]

const StatusType = t.Union(litteraux(mainSchema.incidentStatus.enumValues), {
  description: `Statut de l'incident. Valeurs : ${mainSchema.incidentStatus.enumValues.join(' · ')}`,
})

const IncidentType = t.Union(litteraux(mainSchema.incidentType.enumValues), {
  description: `Type d'incident. Valeurs : ${mainSchema.incidentType.enumValues.join(' · ')}`,
})

const ResolutionType = t.Union(litteraux(mainSchema.incidentResolution.enumValues), {
  description: `Qualification retenue au triage. Valeurs : ${mainSchema.incidentResolution.enumValues.join(' · ')}`,
})

// GRAVITÉ : les deux écritures sont admises, et toutes deux énumérées.
//
// La cellule parle en P1–P4 ; la base stocke `low|medium|high|critical`. Refuser « P1 »
// obligeait chaque intégration à porter la table de correspondance, donc à la copier — et
// une copie se périme. Les deux vocabulaires figurent dans le schéma, la normalisation se
// fait à la lecture (`normalizeSeverity`).
const SeverityType = t.Union(
  litteraux([
    ...mainSchema.incidentSeverity.enumValues,
    ...SEVERITY_LEVELS.map(n => n.code),
  ]),
  {
    description: `Gravité. Écritures acceptées, équivalentes deux à deux : ${
      SEVERITY_LEVELS.map(n => `${n.code} = ${n.value} (${n.label})`).join(' · ')
    }`,
  },
)

export {
  StatusType,
  IncidentType,
  SeverityType,
  ResolutionType,
}
