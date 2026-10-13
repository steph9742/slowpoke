import type { Eden, Treaty } from '@slowpoke/eden'

export type IncidentGetData = Treaty.Data<ReturnType<Eden['api']['incidents']>['get']>
export type Artifact = IncidentGetData extends { artifacts?: (infer TArtifact)[] | null } ? TArtifact : never

// Élément d'une réponse eden de type liste (ex: EdenItem<Eden['api']['timeline']['get']>)
export type EdenItem<T extends (...args: never[]) => Promise<{ data: unknown }>> = NonNullable<Awaited<ReturnType<T>>['data']> extends readonly (infer U)[] ? U : never
