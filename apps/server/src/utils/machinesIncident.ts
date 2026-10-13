import { db } from '@slowpoke/database'
import { glpiSchema } from '@slowpoke/database/tables'
import { asc, eq, inArray } from 'drizzle-orm'
import { lireConfigGlpi } from './glpi'

export type MachineIncident = {
  nom: string
  glpiId: string | null
  groupe: string | null
  entite: string | null
  lieu: string | null
  type: string | null
  os: string | null
  critique: boolean
  presente: boolean
  url: string | null
}

/** Machines de PLUSIEURS incidents, en une requête : la fiche interroge machine par machine,
 *  et une liste de trente incidents le ferait trente fois. Même contenu que la fiche —
 *  recopier la jointure ailleurs la ferait diverger dès la première retouche. */
export async function machinesParIncident(incidentIds: string[]): Promise<Map<string, MachineIncident[]>> {
  const par = new Map<string, MachineIncident[]>()
  if (!incidentIds.length) return par

  const cfg = await lireConfigGlpi()
  const lignes = await db.select({
    incidentId: glpiSchema.incidentMachine.incidentId,
    nom: glpiSchema.incidentMachine.nom,
    glpiId: glpiSchema.incidentMachine.glpiId,
    inventaire: glpiSchema.glpiMachine,
  })
    .from(glpiSchema.incidentMachine)
    // Jointure externe : une machine saisie librement n'a pas d'entrée d'inventaire, et
    // doit malgré tout apparaître. Un incident sans contexte n'est pas un incident sans enjeu.
    .leftJoin(glpiSchema.glpiMachine, eq(glpiSchema.incidentMachine.glpiId, glpiSchema.glpiMachine.glpiId))
    .where(inArray(glpiSchema.incidentMachine.incidentId, incidentIds))
    .orderBy(asc(glpiSchema.incidentMachine.nom))

  for (const l of lignes) {
    const liste = par.get(l.incidentId) ?? []
    liste.push({
      // Le nom enregistré au rattachement prime : il reste lisible même si l'inventaire
      // a changé ou disparu.
      nom: l.nom,
      glpiId: l.glpiId,
      groupe: l.inventaire?.groupeComplet ?? l.inventaire?.groupe ?? null,
      entite: l.inventaire?.entiteComplet ?? l.inventaire?.entite ?? null,
      lieu: l.inventaire?.lieuComplet ?? l.inventaire?.lieu ?? null,
      type: l.inventaire?.type ?? null,
      os: l.inventaire?.os ?? null,
      critique: l.inventaire?.critique ?? false,
      presente: l.inventaire?.presente ?? false,
      url: cfg && l.glpiId ? `${cfg.url}/front/computer.form.php?id=${l.glpiId}` : null,
    })
    par.set(l.incidentId, liste)
  }
  return par
}
