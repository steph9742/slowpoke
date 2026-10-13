import { describe, expect, test } from 'bun:test'

// La clé est lue au premier usage : la fixer AVANT d'importer le module.
process.env.SETTINGS_ENCRYPTION_KEY = 'cle-de-test-uniquement'
const { chiffrer, dechiffrer, estChiffre } = await import('./secrets')

describe('secrets', () => {
  test('un jeton chiffré se relit à l’identique', () => {
    const c = chiffrer('jeton-factice-123')
    expect(estChiffre(c)).toBe(true)
    expect(c).not.toContain('jeton-factice-123')
    expect(dechiffrer(c)).toBe('jeton-factice-123')
  })

  test('deux chiffrements du même jeton diffèrent', () => {
    expect(chiffrer('même')).not.toBe(chiffrer('même'))
  })

  test('une valeur en clair, écrite avant le chiffrement, est rendue telle quelle', () => {
    expect(dechiffrer('ancien-jeton-en-clair')).toBe('ancien-jeton-en-clair')
  })

  test('un chiffré altéré donne null, jamais des octets illisibles', () => {
    const c = chiffrer('jeton-factice-123')
    const altere = c.slice(0, -4) + (c.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(dechiffrer(altere)).toBeNull()
  })
})
