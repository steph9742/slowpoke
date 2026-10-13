import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { appelerExterne, observerAppels, type Appel } from './sortie'

const recus: Appel[] = []
observerAppels((a) => { recus.push(a) })
// Un observateur qui échoue ne doit jamais faire échouer l'appel qu'il observe.
observerAppels(() => { throw new Error('observateur défaillant') })

let serveur: ReturnType<typeof Bun.serve>
beforeAll(() => {
  serveur = Bun.serve({ port: 0, fetch: () => new Response(null, { status: 204 }) })
})
afterAll(() => serveur.stop(true))

const attendre = () => new Promise(r => setTimeout(r, 20))

describe('appelerExterne', () => {
  test('rend la réponse intacte et trace méthode, chemin et statut', async () => {
    const r = await appelerExterne('glpi', `http://localhost:${serveur.port}/apirest.php/Computer?session=SECRET-QUERY`, {
      headers: { Authorization: 'user_token SECRET-EN-TETE' },
    })
    await attendre()
    expect(r.status).toBe(204)
    const appel = recus.find(a => a.chemin === '/apirest.php/Computer')
    expect(appel).toBeDefined()
    expect(appel!.systeme).toBe('glpi')
    expect(appel!.methode).toBe('GET')
    expect(appel!.statut).toBe(204)
  })

  test('ne retient jamais un jeton, ni dans la requête ni dans les en-têtes', async () => {
    await appelerExterne('harfanglab', `http://localhost:${serveur.port}/api/x?token=SECRET-QUERY`, {
      headers: { Authorization: 'Token SECRET-EN-TETE' },
    })
    await attendre()
    expect(JSON.stringify(recus)).not.toContain('SECRET')
  })

  test("trace l'échec réseau puis relance l'erreur", async () => {
    const ferme = Bun.serve({ port: 0, fetch: () => new Response() })
    const port = ferme.port
    ferme.stop(true)
    await expect(appelerExterne('advens', `http://localhost:${port}/injoignable`)).rejects.toThrow()
    await attendre()
    const appel = recus.find(a => a.chemin === '/injoignable')
    expect(appel?.statut).toBeNull()
    expect(appel?.erreur).toBeTruthy()
  })
})
