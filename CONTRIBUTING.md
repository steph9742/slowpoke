# Contribuer

## Prérequis

- **Bun 1.3.14** — la version est épinglée dans `package.json` (`packageManager`), dans les
  Dockerfiles et dans la CI. Les trois se montent ensemble.
- PostgreSQL 18 pour exécuter l'application localement (ou `docker compose up -d postgres`).

```bash
bun install
bun run dev          # interface + API
bun run lint
bun run typecheck
```

Une *pull request* doit passer `lint`, `typecheck` et la recherche de secrets (gitleaks, règles
dans `.gitleaks.toml`). Il n'y a pas de suite de tests automatisée : les vérifications se font
par scripts ponctuels sur une base jetable.

## Architecture

Monorepo Turborepo : trois applications (`apps/app` interface Nuxt 4, `apps/server` API Elysia,
`apps/storybook`) et sept paquets (`packages/ui`, `eden`, `auth`, `database`,
`better-auth-plugins`, `connecteurs`, `eslint-config`, `tailwind-config`).

### Côté interface

- Tout appel d'API passe par le composable `useEden`, qui porte le typage de bout en bout.
  Le namespace `Treaty` donne le type de retour d'une route.
- Conception atomique : formulaires, cartes et listes sont des composants séparés.
- Styles en **Tailwind uniquement**. La seule CSS admise concerne les blocs `<Transition>`.
- Polices : `font-geist` et `font-geistmono`.

### Côté API

- Les accès à la base passent par l'utilitaire `db`, jamais par un client créé sur place.
- Les paramètres, requêtes et corps sont validés par **TypeBox** (`createInsertSchema` permet
  de dériver un schéma depuis une table).
- ⚠️ Elysia **retire des réponses tout champ non déclaré** dans le schéma de réponse. Un champ
  qui « disparaît » sans erreur vient presque toujours de là.
- Une route statique doit être déclarée **avant** une route dynamique de même préfixe, sinon le
  paramètre la capture (`/alerts/etat` avant `/alerts/:id`).
- Les notifications, journaux et webhooks s'envoient depuis `afterResponse` : un envoi qui
  échoue ne doit pas faire échouer l'écriture.
- Chaque sous-ensemble de routes est un *router* importé dans `src/index.ts`.
- **Aucun appel réseau hors de `@slowpoke/connecteurs`** : `fetch` est interdit par ESLint dans
  `apps/server/src/**`, à deux exemptions nommées. Un appel passé par `appelerExterne()` est
  observable ; un `fetch` direct ne l'est pas.

### Rôles et permissions

Un seul champ `role` sur l'utilisateur, quatre rôles applicatifs :

| Rôle | Attribution | Peut |
|---|---|---|
| `admin` | automatique (groupe OIDC déclaré dans `OIDC_ADMIN_GROUP`) | tout, plus l'attribution des rôles et les comptes de service |
| `gestionnaire` | manuelle, par un admin | créer, modifier, supprimer des incidents ; trier les alertes |
| `lecteur` | manuelle, par un admin | lire les incidents et les statistiques |
| `user` | automatique par défaut | se connecter, **sans aucun accès** |

Plus `svc` pour les comptes de service (accès machine). La macro `auth` prend un tableau de
rôles avec une sémantique OU : `auth: ['gestionnaire', 'admin']` pour l'écriture, `auth: ['admin']`
pour l'administration, et on ajoute `'svc'` pour ouvrir une route aux comptes de service.

Les rôles attribués à la main survivent à une reconnexion SSO : le fournisseur OIDC est déclaré
avec `overrideUserInfo: false`, et le rôle n'est calculé qu'à la création du compte.

## Base de données

```bash
cd packages/database
bunx drizzle-kit generate     # migration depuis le schéma
bunx drizzle-kit migrate      # application
```

Les migrations sont **additives** : pas de `DROP` destructif. Une migration déjà publiée ne se
réécrit pas — on en ajoute une autre.

## Écriture

- Le code, les commentaires, l'interface et la documentation sont **en français**.
- Un commentaire dit **ce qui n'est pas lisible dans le code** : un piège d'API, un invariant,
  une raison de ne pas simplifier. Court et factuel. Ce que le code dit déjà n'a pas à être
  répété.
- Les libellés affichés viennent de `packages/database/src/labels.ts` et
  `severity.ts` — jamais recopiés dans un composant.
- Suivre les variables de `packages/tailwind-config` et l'esthétique de `packages/ui`.

## Données sensibles

Ce dépôt ne contient **aucune donnée d'incident réelle**, aucune adresse nominative, aucun
secret. Les captures d'écran viennent d'une instance de démonstration ; la convention et la
liste de contrôle sont dans [`doc/images/README.md`](doc/images/README.md).

`.gitleaks.toml` refuse en CI les clés de service, les jetons et les adresses nominatives.
Adaptez la règle `adresse-nominative-etablissement` aux domaines de votre établissement.
