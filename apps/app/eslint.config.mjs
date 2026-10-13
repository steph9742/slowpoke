// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // `app/components/ui/**` est du code généré par shadcn-vue : on ne l'écrit pas, on le
    // régénère. Y corriger les `any` à la main les ferait revenir à la prochaine mise à jour
    // du générateur, et masquerait les vraies occurrences dans notre propre code.
    files: ['app/components/ui/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Une flèche générique — `const f = <T>(x: T) => …` — dans un `.vue` fait prendre `<T>`
    // pour une balise : le fichier ENTIER cesse d'être analysé, et l'erreur se noie dans le
    // bruit. Rencontré trois fois sur le Catalogue ; aucune occurrence ici, et cette règle
    // fait en sorte que ça reste vrai. Une règle vaut mieux qu'une vigilance, parce que le
    // défaut ne se manifeste pas là où il est. La forme `function f<T>(…)` reste permise.
    files: ['**/*.vue'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'ArrowFunctionExpression[typeParameters]',
        message: 'Flèche générique interdite dans un .vue : `<T>` y est pris pour une balise et le fichier entier cesse d\'être analysé. Écrire `function f<T>(…)`.',
      }],
    },
  },
)
