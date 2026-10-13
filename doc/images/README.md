# Captures d'écran de la documentation

Ce dossier contient les captures utilisées par [`../Guide-Utilisateur.md`](../Guide-Utilisateur.md).

## ⚠️ Avant de déposer une capture : anonymiser

Slowpoke affiche de **vraies données personnelles et sensibles** (victimes de phishing, adresses e-mail, IP, composantes, incidents réels). Une capture commitée entre dans **l'historique Git de façon quasi définitive** — la supprimer plus tard ne l'efface pas des clones ni des anciens commits.

**Check-list avant chaque capture :**

- [ ] **Noms et prénoms** d'utilisateurs réels → masqués ou remplacés
- [ ] **Adresses e-mail** → masquées (`p****@exemple.fr`)
- [ ] **Adresses IP** publiques et **noms de machines/domaines** internes → masqués
- [ ] **Clés de compte de service** (`sk_…`), jetons, secrets de webhook → **jamais** visibles
- [ ] **URLs de webhooks** internes → masquées
- [ ] Descriptions d'incidents pouvant identifier une personne ou une faille non corrigée → recadrer ou masquer

> La meilleure solution reste une **instance de démonstration avec des données fictives**. À défaut, flouter/caviarder à l'export (un rectangle plein, pas un flou léger : un flou peut parfois être inversé).

## Convention

- Format **PNG**, largeur ~1400 px (lisible sans être lourd), thème clair.
- Nommage : `NN-nom-de-la-page.png` (préfixe numérique = ordre d'apparition dans le guide).
- Une capture = **un écran entier ou une zone cohérente**, pas un patchwork.
- Insertion dans le guide :
  ```markdown
  ![Description accessible](images/NN-nom-de-la-page.png)
  *Légende expliquant ce qu'il faut regarder.*
  ```

## Inventaire attendu

| Fichier | Page | Données sensibles ? |
|---|---|---|
| `02-tableau-de-bord.png` | Accueil : KPI + incidents récents | **oui** |
| `03-liste-incidents.png` | Liste avec filtres et pastille de total | **oui** |
| `04-fiche-incident-details.png` | Fiche : onglet Détails | **oui** |
| `05-fiche-incident-activite.png` | Fiche : Activité & chronologie | **oui** |
| `06-reglages-notifications.png` | Réglages : push + « Nouveaux incidents » | non |
| `07-stats-vue-ensemble.png` | Statistiques : KPI et graphiques | **oui** (composantes) |
| `08-stats-widgets.png` | Widgets + mode « Modifier la disposition » | **oui** |
| `09-query-builder.png` | Query builder : requête et résultat | **oui** (résultat) |
| `10-comptes-utilisateurs.png` | Comptes → Utilisateurs : attribution des rôles | **oui** |
| `11-comptes-service.png` | Comptes de service | **oui — clés à masquer** |
| `12-listes-blanches.png` | Listes blanches : filtre d'état, bandeau de revues dépassées | **oui** (chemins, machines) |
| `13-declarer-liste-blanche.png` | Modale de déclaration : critères par outil + alerte de portée large | **oui** |
| `14-valeurs-recurrentes.png` | Statistiques → Valeurs récurrentes | **oui** (IP, machines) |

## Refaire la série

Les captures ont été reprises le **2 août 2026** après les lots §1–§9, sur une instance de
démonstration locale dont **toutes les données sont fictives**. Aucune n'est issue de la
production ; la check-list ci-dessus n'a donc pas eu à s'appliquer, mais elle reste la règle
si vous repartez d'une instance réelle.

Le jeu de démonstration nécessaire :

- **neuf incidents** couvrant les sept types, avec des statuts, sévérités et résolutions variés
  — dont un *sous surveillance* et un résolu en *activité légitime* ;
- **deux incidents qui se recoupent** (même machine, même IP) sans quoi la page *Valeurs
  récurrentes* n'a rien à afficher ;
- **un incident pris en charge** et un autre attribué à un tiers, pour le contrôle de pilote ;
- **trois listes blanches** dont une à revue dépassée et une de portée large ;
- **trois widgets** et **trois comptes de service**, sinon ces deux pages sont vides ;
- **deux comptes** au moins (un admin, un gestionnaire) pour la page Utilisateurs.

Les captures sont prises en **1400 × 950 à l'échelle 1** (soit ~1400 px de large, conformément
à la convention ci-dessus) et le badge Nuxt DevTools est masqué avant chaque prise — sans quoi
il s'invite en bas de l'écran.

### Le script

[`captures.mjs`](captures.mjs) enchaîne les 14 vues, se connecte, ouvre les menus et les
modales, et enregistre les PNG. Il a été conservé cette fois-ci : la série précédente avait dû
être refaite à la main faute d'avoir gardé le sien.

Il dépend de `playwright-core`, que le dépôt n'embarque pas — installez-le dans un dossier de
travail **hors du dépôt** et copiez-y le script (la résolution des paquets se fait depuis
l'emplacement du fichier, le lancer directement depuis `doc/images/` échoue) :

```bash
bunx playwright install chromium
mkdir -p /tmp/captures-slowpoke && cd /tmp/captures-slowpoke && bun init -y && bun add playwright-core
cp ~/Code/Slowpoke/doc/images/captures.mjs .
CAPTURES_MDP="<mot de passe du compte de démo>" bun run captures.mjs ./out
```

Le mot de passe n'est **pas** dans le script : il se passe par `CAPTURES_MDP`. `CAPTURES_URL`,
`CAPTURES_EMAIL`, `CAPTURES_INCIDENT` et `CAPTURES_CHROMIUM` permettent de viser une autre
instance. Vérifiez ensuite chaque image avant de la committer — certaines pages se chargent en
différé et une capture prise trop tôt montre une liste vide (c'est arrivé sur la page
Utilisateurs).
