export type ManagedUser = {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  createdAt: string | Date | null
}

export type Feedback = {
  type: 'success' | 'error' | 'info'
  message: string
}

export type AdminAction = 'delete' | 'revoke' | 'promote'

export type AppRole = 'user' | 'lecteur' | 'gestionnaire' | 'admin'

export const ROLE_OPTIONS: { value: AppRole, label: string }[] = [
  { value: 'user', label: 'Aucun accès' },
  { value: 'lecteur', label: 'Lecteur' },
  { value: 'gestionnaire', label: 'Gestionnaire' },
  { value: 'admin', label: 'Administrateur' },
]

// Normalise un rôle stocké (potentiellement inconnu) vers l'un des 4 rôles applicatifs
export function normalizeRole(role: string | null | undefined): AppRole {
  const r = String(role ?? 'user').split(',')[0]?.trim()
  return (['user', 'lecteur', 'gestionnaire', 'admin'] as const).includes(r as AppRole) ? (r as AppRole) : 'user'
}

export type RoleFilter = 'all' | AppRole

export type SortBy = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc'
