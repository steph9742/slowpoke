import { computed } from 'vue'

// Rôles applicatifs et capacités associées (miroir de la macro serveur).
export const READ_ROLES = ['lecteur', 'gestionnaire', 'admin']
export const WRITE_ROLES = ['gestionnaire', 'admin']

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  lecteur: 'Lecteur',
  user: 'Aucun accès',
}

/**
 * Capacités de l'utilisateur courant, dérivées de son rôle (session SSO).
 * À utiliser dans un `setup` async : `const { canWrite } = await useRoles()`.
 */
export async function useRoles() {
  const session = await useSSRAuth()
  const roles = computed(() =>
    String((session.value?.user as { role?: string | null } | undefined)?.role ?? 'user')
      .split(',')
      .map(r => r.trim())
      .filter(Boolean),
  )
  const has = (list: string[]) => computed(() => roles.value.some(r => list.includes(r)))
  return {
    roles,
    role: computed(() => roles.value[0] ?? 'user'),
    isAdmin: has(['admin']),
    canRead: has(READ_ROLES),
    canWrite: has(WRITE_ROLES), // créer / modifier / supprimer des incidents
    canManageUsers: has(WRITE_ROLES), // gestionnaire + admin
  }
}
