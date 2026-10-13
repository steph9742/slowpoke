import { config } from '@slowpoke/eslint-config/base'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  ...config,
  // AUCUN APPEL RÉSEAU HORS DU POINT DE SORTIE.
  //
  // Le serveur ne parle à un système externe que par `@slowpoke/connecteurs/sortie`, où
  // chaque appel peut être tracé. `fetch` étant disponible partout sans import, interdire
  // les imports ne suffirait pas : c'est le global lui-même qui est proscrit.
  //
  // Deux exemptions, nommées et non génériques : le modèle d'IA local et les webhooks sont
  // des sorties propres à Slowpoke, pas des systèmes interrogés pour une enquête.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/utils/ia.ts', 'src/utils/webhook.ts'],
    rules: {
      'no-restricted-globals': ['error', {
        name: 'fetch',
        message: 'Appel réseau interdit ici : passer par appelerExterne() de @slowpoke/connecteurs/sortie.',
      }],
    },
  },
])
