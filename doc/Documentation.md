# Documentation Slowpoke

Slowpoke (nom de code **Slowpoke**) est un outil de suivi et de visualisation d'incidents de cybersécurité, développé avec **Nuxt 4** (frontend), **ElysiaJS** sur Bun (backend) et **PostgreSQL** (base de données, via Drizzle ORM). L'ensemble est un monorepo Turborepo.

> Cette documentation est **généralisée** : les valeurs propres à un déploiement (URLs, secrets, clés) sont remplacées par des marqueurs `<…>`. Adaptez-les à votre environnement.

## Fonctionnement

Slowpoke enregistre les incidents via son API, de manière **manuelle** (rempli par un humain) ou **automatique** (via une automatisation, ex. n8n avec un compte de service). Cela permet de répertorier les incidents survenus sur l'infrastructure et d'en assurer le suivi : type d'incident, utilisateurs concernés, détails techniques par type, statut, résolution, chronologie.

Ces informations alimentent des **statistiques** (graphiques) et peuvent être extraites en SQL (query builder).

## Authentification

Slowpoke utilise **OAuth2 via OpenID Connect** contre un fournisseur d'identité (IdP) — par exemple Dex adossé à un annuaire LDAP, Keycloak, etc.

Le provider est configuré côté serveur par les variables `OIDC_*` (voir *Développement*). Il doit rediriger vers l'URL publique du front et, en dev, vers `http://localhost:4000`. L'email et le mot de passe sont également activés en secours.

Le **rôle** de l'utilisateur est dérivé à la connexion : membre du groupe `admins` de l'annuaire → `admin`, sinon → `user`. Ce rôle initial n'est posé qu'à la **création** du compte (`overrideUserInfo: false`), donc les rôles attribués manuellement ensuite survivent aux reconnexions.

## Rôles & permissions

| Rôle | Attribution | Droits |
|------|-------------|--------|
| **admin** | auto (groupe `admins` de l'IdP) | tout + attribution des rôles + création de comptes de service |
| **gestionnaire** | manuelle (par un admin) | créer / modifier / supprimer des incidents, gérer les utilisateurs |
| **lecteur** | manuelle (par un admin) | lecture seule (incidents + statistiques) |
| **user** | auto (défaut) | connecté mais **aucun accès** tant qu'un rôle n'est pas attribué |

Plus les **comptes de service** (`svc`) : clés à *scopes* pour l'accès machine/API (ex. n8n). Un admin les crée dans *Comptes → Comptes de service*.

Les **scopes sont appliqués** par l'API, d'après le verbe HTTP de la requête :

| Scope | Verbes autorisés |
|-------|------------------|
| `read` | `GET` (lister/consulter incidents, utilisateurs, identités, logs, artéfacts) |
| `write` | `POST`, `PATCH` |
| `delete` | `DELETE` (routes ouvertes aux comptes de service) |
| `admin` | tout ce qui précède |

Hors périmètre → `403`. Un compte sans scope ne peut rien faire. `DELETE /api/incidents/:id` reste **fermé aux comptes de service** (gestionnaires et admins connectés uniquement).

Les rôles applicatifs s'attribuent dans *Comptes → Utilisateurs* (endpoint `PATCH /api/accounts/:userId/role`).

## Niveaux de gravité

Le vocabulaire de référence du dispositif est **P1–P4** ; les valeurs stockées ne changent pas.

| Niveau | Valeur technique | Libellé |
|---|---|---|
| **P1** | `critical` | Critique |
| **P2** | `high` | Majeur |
| **P3** | `medium` | Modéré |
| **P4** | `low` | Mineur |

L'affichage porte les deux — « **P1 — Critique** » — dans les listes, les fiches, les filtres et les statistiques. La correspondance vit dans un seul fichier, `@slowpoke/database/severity`, importé côté serveur comme côté interface : aucun libellé n'est recopié.

L'enum `incident_severity` n'est **pas renommé** : le renommer casserait les intégrations existantes, les comptes de service et les données en base, pour un gain purement cosmétique.

## Origine des dates

Quatre instants, souvent confondus — les distinguer est la raison d'être de ces champs :

| Champ | Répond à | Porté par |
|---|---|---|
| `knowledgeAt` | quand l'**établissement** a su | `incident` |
| `referredAt` | quand la **cellule** a été saisie | `incident` |
| `createdAt` | quand la **fiche** a été créée | `incident` |
| `detectedAt` | quand l'incident a été **techniquement** détecté | tables de détail |

Seul `knowledgeAt` a une portée réglementaire. Le calculer depuis `createdAt` — ce qui était le cas — produit des échéances fausses, **toujours dans le sens rassurant** : un signalement reçu vendredi soir et saisi lundi décalait le départ de 60 heures.

`detectedAt` n'a plus de valeur par défaut : quand la source ne la transmet pas, elle reste **vide** plutôt que de prendre l'heure d'insertion. Une date inventée est indiscernable d'une date réelle une fois enregistrée.

## Notifications push

Notifications Web Push, **multi-navigateurs** (un même compte reçoit sur tous ses appareils) :

- **Nouveaux incidents** — à activer dans les Réglages ; notifie à chaque incident créé.
- **Suivi d'un incident** — bouton *Suivre l'incident* sur la page d'un incident ; notifie à chaque modification de cet incident précis.

L'auteur d'une action n'est jamais notifié de sa propre action. Chaque notification a pour **titre** le type d'incident + sa date de détection, et pour **corps** le message de la modification (identique à la timeline). Les souscriptions mortes (navigateur désinscrit) sont purgées automatiquement.

Nécessite les clés **VAPID** (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`).

## Webhooks

Webhooks **sortants** (vers n8n ou toute URL externe), configurables dans les Réglages (admin). À chaque événement d'incident abonné, un payload est envoyé :

```json
{
  "event": "status_change",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "message": "Statut : Ouvert → Résolu",
  "changes": [{ "field": "status", "from": "open", "to": "resolved" }],
  "incident": { "...": "l'incident complet" }
}
```

Signature optionnelle en HMAC-SHA256 (header `X-Slowpoke-Signature`) si un secret est défini.

### Événements qui ne portent pas d'incident

`revue_liste_blanche_proche` (sept jours avant) et `revue_liste_blanche_depassee` (puis
chaque semaine) concernent **aussi** les règles posées hors incident. Leur charge utile a
donc `incident: null` — plutôt qu'un incident inventé pour remplir le champ — et un objet
`listeBlanche` :

```json
{
  "event": "revue_liste_blanche_depassee",
  "message": "Liste blanche à revoir : srv-01 / hash 4d88 (échéance du 26 sept. 2026)",
  "incident": null,
  "listeBlanche": {
    "origine": "exclusion",
    "id": "…", "regleRef": "a1b2c3d4", "incidentId": "FF7LXN",
    "objet": "srv-01 / hash 4d88", "motif": "Binaire métier signé",
    "echeance": "2026-09-26T00:00:00.000Z", "niveau": "depassee"
  }
}
```

Trois autres événements n'en portent pas non plus : `alerte_nouvelle` (à la réception d'une
série neuve, jamais sur une occurrence), `alerte_ecartee` et `alerte_escaladee`. Ils portent
`incident: null` et l'alerte complète dans `alerte` — `alerte_escaladee` ajoute `incidentId`.

`origine` vaut `exclusion` (née d'un incident, `incidentId` renseigné), `regle` (posée hors
incident, `incidentId` à `null`) ou `silence` (série d'alertes faite taire). Un webhook part **par échéance** ; la notification Web
Push, elle, est groupée — six notifications d'affilée se font couper, une automatisation a
besoin du détail.


### Appariement d'une liste blanche

`exclusion_appariee` et `exclusion_detachee` portent, en plus de l'incident, un objet
`exclusion` :

```json
{
  "event": "exclusion_appariee",
  "exclusion": {
    "id": "…", "incidentId": "FF7LXN", "outilRef": "a1b2c3d4",
    "motif": "Binaire métier signé", "reviewDate": "2027-08-27T00:00:00.000Z", "state": "active"
  }
}
```

L'appariement fait **basculer l'autorité sur l'échéance** vers Slowpoke : le registre qui
l'apprendrait seulement au relevé suivant vivrait un cycle entier avec une date périmée, et
c'est pendant ce cycle que deux dates coexistent. `outilRef` à `null` signifie un
détachement — l'autorité repart alors au registre.

### ⚠️ Monter better-auth : à lire avant

**La version est épinglée à `1.6.11`** dans les trois `package.json`. Ce n'est pas de la prudence de principe.

**À partir de `1.6.12`, la création d'un compte OAuth ne retient que les champs déclarés inscriptibles.** Le greffon `admin()` déclare `role` en `input: false`, puis impose sa valeur par défaut. Le `role` calculé par `mapProfileToUser` — groupe `OIDC_ADMIN_GROUP` présent dans la claim `groups` → `admin` — **serait donc ignoré**.

Or tout le contrôle d'accès de Slowpoke lit cette colonne : `middleware/auth.ts` la relit à chaque requête, et `allowUserToManageServiceAccounts` s'en sert pour les comptes de service. Conséquence d'une montée sans correctif :

- un **nouvel** administrateur est créé en `user` — il se connecte, ne voit rien d'administrable, et rien n'est journalisé ;
- les comptes **existants** gardent leur rôle, la colonne étant déjà écrite : la panne reste invisible en production jusqu'au premier nouvel arrivant ;
- sur une **installation neuve**, aucun compte n'obtient `admin`. Le compte de secours non plus, puisqu'il est créé par mot de passe et subit le même filtre.

**Le correctif évident est une faille.** Redéclarer `role` en `input: true` rouvrirait le champ à l'inscription par mot de passe, où n'importe qui pourrait se déclarer administrateur. Ce filtre protège justement cette voie.

**La voie sûre** est de mémoriser le rôle calculé dans `mapProfileToUser`, puis de le réappliquer dans un point d'accroche base de données à la création de l'utilisateur — l'écriture directe n'étant pas soumise au filtre. À faire et à **tester contre la version cible** avant de lever l'épinglage. 

### SSO absent : l'application démarre quand même

Le fournisseur OIDC n'est déclaré que si `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` et `OIDC_DISCOVERY_URL` sont tous renseignés. Sinon, la liste des fournisseurs est vide et un avertissement est émis au démarrage.

Déclaré à vide, better-auth tente la découverte, échoue, et le serveur refuse de démarrer — précisément le jour où le SSO est tombé et où l'on cherche à se connecter en secours. La porte de secours doit tenir debout quand l'autre est fermée.

La liste des fournisseurs est vidée, **le greffon reste dans le tableau** : `plugins` doit rester un littéral, sans quoi better-auth cesse d'inférer le type de la session et `user.role` disparaît du typage.

### Liste des incidents, total et version déployée

`GET /api/incidents/liste` rend **`{ total, tri, resultats }`** : le total porte sur les filtres appliqués et se compte **dans le même appel** que la page. `GET /api/incidents` (tableau nu) et `GET /api/incidents/count` lisent à deux instants et peuvent se contredire — « 3 incidents » affiché au-dessus d'une liste qui en montre 4. Les deux anciennes routes restent : les remplacer casserait les intégrations sans préavis.

Chaque résultat porte `urlAbsolue`, adresse citable. Sans origine publique déclarée (`PUBLIC_APP_URL`, à défaut la première de `TRUSTED_ORIGINS`), c'est le chemin relatif qui est rendu — une adresse reconstituée depuis l'en-tête `Host` serait fausse derrière un proxy, et une citation fausse est pire qu'une citation incomplète.

`GET /health` rend aussi **`construitLe`**, la date de construction en ISO 8601 (`null` si l'image a été bâtie sans). Deux abrégés de commit ne s'ordonnent pas — rien dans `9d08b6c` ne dit s'il précède `02ba656` — donc un appelant vérifiant « au moins telle version » ne peut pas conclure sur le commit seul. Une date se compare.

⚠️ **`GET /health` et l'OpenAPI rendent le commit déployé** (`version`). Il vaut `inconnue` si l'image a été construite sans l'argument `GIT_COMMIT` — ce que la valeur dit franchement plutôt que d'afficher un numéro figé. Construire avec :

```bash
GIT_COMMIT=$(git rev-parse --short HEAD) BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) docker compose build server
```

Sans cela, un consommateur ne peut pas vérifier qu'un correctif est en service : il doit croire l'exploitant sur parole.

### Composantes : un code derrière deux vocabulaires

Deux rattachements circulent, et ils ne parlent pas la même langue :

- **les personnes** — `incident_user.composante`, saisi à la main sous six écritures au moins : `cmpi-901`, `cmpa-901`, `cmpg-901`, `PT (cmpi-903)`, libellé tronqué suivi du code, et au moins une valeur à l'encodage cassé ;
- **les machines** — `glpi_machine.entite_complet`, abréviation hiérarchique d'inventaire : `Établissement > IUT`, `Établissement > IUT > Dept-INFO`.

**Seul le code à trois chiffres est fiable.** Les libellés stockés sont périmés — « IUT de Belfort-Montbéliard » pour 912 — ou coupés par la saisie. `packages/database/src/composantes.ts` porte la correspondance code → libellé, et les deux fonctions qui y mènent : `normaliserComposante()` pour les saisies, `composanteDeLEntite()` pour l'inventaire.

`incident_user.composante_code` est dérivée à l'écriture et remplie rétroactivement par la migration `0037`. La saisie d'origine est conservée intacte à côté : c'est la trace de ce que quelqu'un a écrit.

⚠️ **Aucun rattachement n'est déduit d'une ressemblance de nom.** `ST - Dépt. Ens. Informatique` ressemble à `ST` mais constitue une entité distincte dans l'inventaire : ses 311 machines ne comptent pas dans le 903. En revanche `IUT NFC > Dept-INFO` est un enfant de `IUT NFC` et compte dans le 912 — la hiérarchie s'hérite, la ressemblance non.

**Ce qui est automatique, et ce qui ne l'est pas.** Une personne saisie avec n'importe laquelle des six écritures voit son code dérivé à l'écriture ; une machine placée sous une entité déclarée est traduite à la lecture, y compris dans un département créé plus tard sous cette entité. En revanche, **une entité d'inventaire nouvelle ou renommée n'est rattachée à rien** : GLPI ne prévient pas. `GET /api/stats/composantes` rend donc `entitesNonResolues`, la liste de ces entités avec leur volume — une composante dont le décompte baisse sans raison s'explique souvent là. La déclarer dans `composantes.ts` suffit à la rattacher.

**Les laboratoires se lisent seuls.** Le référentiel les nomme par un code d'unité suivi du libellé — « UMR0000 SIGLE: intitulé complet ». Tout est dans la valeur : aucune table à tenir, et une unité créée demain sera lue comme les autres. Côté inventaire, seul le sigle apparaît (`Établissement > SIGLE`) : les sigles à reconnaître se déclarent dans `packages/database/src/organisation.ts`, avec les composantes et les entités.

Ils sont comptés **à part**, jamais rangés sous une composante : une UMR n'a pas de tutelle d'UFR à lui inventer. `GET /api/stats/composantes` rend `laboratoires` distinct de `sansComposante`, lequel ne garde plus que ce dont le rattachement est réellement inconnu. À l'affichage, c'est le **sigle** qui fait office de nom — le libellé complet est une définition, pas un intitulé.

**Les directions internes n'ont pas de code** — DSIN, DEQ, DAR, Cyber, Mésocentre — non plus que `ST - Dépt. Ens. Informatique`, entité distincte de `ST` dans l'inventaire. `GET /api/stats/composantes` les compte dans `sansComposante`, sans jamais les répartir.

⚠️ **Un nom change, un code non.** Le 924 s'appelait « Service universitaire de médecine préventive et de promotion de la santé » et se nomme désormais « Service de santé des étudiants », sigle `SSE`. Une saisie portant l'ancien libellé reste correctement rattachée et s'affiche sous le nouveau nom : c'est précisément ce que permet une correspondance portée par le code plutôt que par le texte. Une composante renommée se traite donc en une ligne dans `composantes.ts`, sans toucher aux données.

### Filtrer les incidents : période, résolution, veilles

Les mêmes paramètres sur **`GET /api/incidents`, `/liste` et `/count`** — le filtre est écrit une fois et appelé par les trois.

| Paramètre | Effet |
|---|---|
| `depuis` · `jusqua` | Bornes ISO 8601 sur **`knowledgeAt`** |
| `resolution` | `true_positive` `false_positive` `benign` `legitimate` `duplicate` |
| `veilleExpireAvant` | Veilles dont `surveillanceExpiresAt` tombe avant cette date |

**Les bornes portent sur `knowledgeAt`, jamais sur `createdAt`.** « Combien d'incidents ce mois-ci » porte sur ce que l'établissement a SU ce mois-là : un incident de mars enregistré en avril appartient à mars. C'est aussi la date d'où partent tous les délais réglementaires — une même borne pour le dénombrement et pour la conformité évite deux comptes qui ne se recoupent pas.

⚠️ **Un incident dont `knowledgeAt` est nul sort silencieusement de tout résultat borné.** Le cas ne concerne que d'anciens incidents, la date étant obligatoire à la création depuis, mais un décompte mensuel peut s'en trouver minoré. Publié sous `periode-exclut-sans-connaissance`.

`veilleExpireAvant` se combine avec `status=surveillance` pour lister les veilles arrivant à terme — le statut exige une échéance, rien ne permettait jusqu'ici de demander lesquelles arrivent à échéance.

### Aller du général au particulier, en appels successifs

`GET /api/incidents/liste` est le point de départ. Chaque résultat porte déjà **`niveau`** (`P1`…`P4`) à côté de `severity`, et **`urlAbsolue`**. Avec **`avecMachines=true`**, chaque incident porte ses machines — nom, **entité**, groupe, lieu, type, système, criticité, présence à l'inventaire — jointes en **une seule requête pour toute la page**, pas une par incident.

Le parcours, du plus large au plus précis :

| Besoin | Appel | Coût |
|---|---|---|
| Les incidents P1, avec machines et entités | `GET /api/incidents/liste?severity=P1&avecMachines=true` | 1 appel |
| Les compteurs réglementaires de tous ces incidents | `GET /api/echeances?depuis=…` | 1 appel |
| Tout le détail d'un incident (blocs par type) | `GET /api/incidents/{id}` | 1 par incident |
| Sa chronologie, ses analyses, sa conduite | `GET /api/incidents/{id}/timeline` · `/analyses` · `/conduite` | 1 chacun |
| L'historique d'une machine | `GET /api/machines/{glpiId}/incidents` | 1 par machine |

Les deux premiers suffisent à répondre à « a-t-on eu un P1, sur quelles machines, et où en sont les déclarations » — **deux appels, quel que soit le nombre d'incidents**. Les suivants ne se justifient que pour un incident déjà identifié.

⚠️ `avecMachines` a un coût : ne le demander que si la question porte sur le parc. Une machine saisie librement dans Slowpoke n'a pas de fiche d'inventaire — elle apparaît avec `glpiId: null` et une entité nulle, ce qui n'est pas l'absence d'enjeu.

### `GET /api/exclusions/registre` — le vide, distingué de la panne

`GET /api/exclusions` rend un tableau nu : zéro exclusion et un dispositif défaillant s'y lisent pareil. Le registre rend `{ total, actives, revuesSansIncident, revues, alimentation, releveEdr, resultats }`.

**Un registre vide est un fait, pas une donnée manquante.** Rien n'écrit ici automatiquement : une exclusion se consigne depuis un incident, une règle posée hors incident se consigne comme **revue programmée** (`revues`, voir `/api/exclusions/revues`). `alimentation` le dit dans la charge utile.

Ce que le connecteur conditionne est une **autre** question : existe-t-il dans l'EDR des règles qui auraient dû être consignées ? `releveEdr` porte l'état du dernier relevé. À `null` ou en échec, cet écart n'est pas calculable — au dernier relevé réel, 4 797 règles existaient dans l'outil pour zéro exclusion consignée, ce qui montre que les deux registres ne se déduisent pas l'un de l'autre.

### `GET /api/lectures` — comment lire ce que l'API rend

Rend les contresens connus, par couple **(champ, valeur)** et non par route : une consigne accrochée à des routes nommées une par une ne vaut que pour celles auxquelles on a pensé, et rate la suivante.

Chaque entrée porte `cle`, `champ`, `valeur`, `signifie`, **`neSignifiePas`**, `consequence`, `ouCorriger` — et un **`libelle`** optionnel.

**`libelle` est le libellé court**, deux ou trois mots : ce qu'on écrirait sur une pastille, là où `signifie` est une phrase qui explique. Il est **dérivé des mêmes tables que l'interface de Slowpoke** (`@slowpoke/database/labels`), donc un état renommé l'est partout ou nulle part — un lecteur qui tient son propre libellé finit par diverger du nôtre sans que personne ne le voie. Les vocabulaires fermés en portent **toujours** un ; les champs ambigus seulement quand la valeur s'affiche comme une pastille (`Sans pilote`, `Hors inventaire`, `Règle disparue`…). Champ **optionnel et additif** : un consommateur peut le préférer au sien dès qu'il arrive, et garder le sien en repli.

La réponse porte aussi un bloc **`filtres`** : pour chaque catalogue, les champs filtrables avec leur **nature** — `vocabulaire` (valeurs énumérées), `referentiel` (avec le point d'entrée qui donne les identifiants), `booleen`, `nombre`, `texte`, `date` — plus `commentCroiser` et `neJamaisFaire`. Les valeurs des vocabulaires sont **dérivées des énumérations** : la liste publiée ne peut pas s'écarter de celle qu'accepte le serveur. Un appelant qui ignore qu'un filtre existe ne pose pas la question — il rapatrie tout et trie lui-même, ou renonce.

`neSignifiePas` est la moitié qui travaille. La lecture naïve est presque toujours la fausse, et c'est celle qu'un lecteur produit spontanément : `severity: "critical"` a déjà été lu comme « pas de P1 » sur un incident qui en était un.

**Ce qui est garanti, et ce qui ne l'est pas.** Les vocabulaires fermés — `severity`, `status`, **`resolution`**, applicabilité — sont décrits **exhaustivement, par construction** : chaque catalogue est un `Record` indexé par le type de l'enum, donc ajouter une valeur sans écrire sa lecture ne compile plus. Les champs ambigus (`applicable: null`, `court: false`, …) se tiennent à la main : rien ne relie un champ nouvellement ajouté à cette liste. La réponse le dit dans `garantie`, plutôt que de laisser croire à une exhaustivité qui n'existe pas.

### Vocabulaires fermés : gravité, statut, type

| Champ | Valeurs |
|---|---|
| `severity` | `low` `medium` `high` `critical` — **et** `P4` `P3` `P2` `P1`, équivalents deux à deux |
| `status` | `open` `investigating` `in_progress` `surveillance` `resolved` `closed` |
| `type` | `phishing` `malware` `ransomware` `data_breach` `ddos` `network_intrusion` `other` |
| `resolution` | `true_positive` `risk_accepted` `false_positive` `benign` `legitimate` `duplicate` — **ou `null`**, y compris sur un incident clos |

**`risk_accepted` n'est pas `true_positive`.** L'incident est réel et n'a **pas** été corrigé : le risque est assumé, et c'est cette décision qui est tracée. Les fondre efface une décision de pilotage.

**`resolution: null` sur un incident clos ne vaut pas « bénin ».** C'est le cas quand le SOC a clos son ticket pour un motif qui ne conclut rien chez nous (`no_security_risk`, `no_longer_applicable`) : le motif brut est lisible dans les métadonnées de la fiche (`motif_cloture_soc`), la résolution reste à poser par la cellule. Les deux mises en garde sont publiées par `GET /api/lectures` (`resolution-risque-assume`, `resolution-absente`).

**`P1` et `critical` désignent la même chose.** La cellule parle en P1–P4, la base stocke les valeurs techniques ; la création d'incident admettait déjà les deux écritures, le **filtre** non — une question posée dans le vocabulaire de la cellule recevait donc zéro résultat alors que la réponse existait. Les deux sont désormais acceptées partout, et normalisées à la lecture.

Ces listes sont dérivées des `enumValues` : ajouter une valeur à l'enum l'expose sans rien à recopier, et aucune liste ne peut diverger du code. Elles figurent dans `/openapi`, à lire là plutôt qu'ici.

⚠️ **Le `summary` d'un 422 n'énumère pas les valeurs** : Elysia y écrit le type de chaque branche (`'string', 'string', …`), littéraux ou non. Les valeurs sont dans `errors[0].schema.anyOf[].const` de la même réponse, et dans `/openapi`.

### Tri et pagination des incidents

`GET /api/incidents` accepte `sort` (`updatedAt` par défaut, `createdAt`, `knowledgeAt`, `severity`) et `order` (`desc` par défaut). Le tri est **toujours appliqué** et **départagé par `id`** : sans clé unique, deux incidents de même rang permutent d'un appel à l'autre, et la pagination répète une ligne en omettant une autre.

⚠️ **`updatedAt` est la date de MODIFICATION.** « Les derniers incidents » au sens du tri par défaut, ce sont les derniers *modifiés* — pas les derniers signalés. Pour l'ordre de signalement, `sort=createdAt`.

## Routes API

Les routes sont auto-documentées en **OpenAPI**, exposées à **`/openapi`** (ex. `https://<votre-domaine>/openapi`).

### Conduite à tenir

- `GET /api/incidents/:id/conduite` — procédure applicable, cases de la checklist avec leur état, échéances.
- `PATCH /api/incidents/:id/conduite/cases/:cle` — cocher une case. L'état appartient à l'incident, pas à la personne.
- `GET /api/incidents/:id/echeances` — les seules échéances, sans la checklist (sert à la pastille d'onglet).
- `PATCH` / `DELETE /api/incidents/:id/echeances/:cle` — déclarer un compteur applicable ou non ; `DELETE` revient au défaut de la grille.
- `PATCH /api/incidents/:id/echeances/:cle/depot` — enregistrer **ce qui a été déposé** : date, référence rendue par l'autorité, auteur. `deposeLe: null` retire le dépôt.
- `GET /api/echeances` (admin, `svc`) — les cinq compteurs de **tous** les incidents, pour le registre de conformité. Voir ci-dessous.

#### Applicabilité, accomplissement, entrée en vigueur

Trois choses distinctes, qu'il ne faut pas confondre :

- **`defaut`** — ce que la grille prévoit pour ce niveau, avant toute intervention humaine.
- **`applicable`** — ce qu'un humain a tranché, avec son nom (`decidePar`) et la date. `null` tant que personne n'a décidé : **ce n'est pas un « non »**.
- **`deposeLe` / `reference` / `deposePar`** — ce qui a effectivement été déposé. Un jalon déposé **cesse de courir** (`court` passe à faux) : laisser son décompte filer vers le rouge ferait passer un devoir accompli pour un retard.

La déclaration se saisit **dans l'onglet Conduite de l'incident**, par la personne qui le conduit — pas dans un outil de conformité rouvert trois semaines plus tard, quand la référence s'est perdue.

⚠️ **NIS 2 en P2 dépend d'une date réglable** (Paramètres → *NIS 2 — entrée en vigueur*, admin). À partir d'elle, un P2 arme les compteurs **d'office** : armer se défait par une décision tracée, ne pas armer ne se rattrape que si quelqu'un y pense. **Tant qu'aucune date n'est réglée, P2 reste « à évaluer »** — la transposition française n'étant pas connue, Slowpoke ne fait pas courir un délai qui ne court pas encore, et ne crée pas rétroactivement des retards sur des incidents que la règle ne régissait pas. Les P1 arment d'office quoi qu'il arrive.

#### Compteurs en lot (`GET /api/echeances`)

Destiné au registre de conformité, en **lecture seule**. Paramètres : `depuis` (filtre sur `knowledgeAt`, ISO 8601), `limit` (200 par défaut, 1000 au plus), `offset`. Réponse : `{ total, etat, resultats }`.

Sous `/api/echeances` et **non** `/api/incidents/…` : le paramètre dynamique `:id` de `/incidents/:id/echeances` capturerait une route en lot placée sous le même préfixe, et le lecteur recevrait un sous-ensemble amputé sans la moindre erreur.

Trois garanties :

- **Les cinq compteurs sont toujours rendus**, `applicable: null` compris. Un compteur absent du tableau se lirait comme non applicable — l'erreur exacte que l'état à trois valeurs existe pour supprimer.
- **`defaut` et `applicable` restent séparés.** Les fusionner effacerait la différence entre « la grille dit oui » et « quelqu'un a décidé oui », qui est justement ce qu'un dossier doit pouvoir montrer.
- **`etat.incidentsSansDecision`** sépare « rien à signaler » de « personne n'a encore tranché ». `etat.derniereDecision` donne la fraîcheur.
- `GET /api/playbooks`, `POST /api/playbooks/sync` — procédures synchronisées et relecture immédiate.

### File d'alertes (`/api/alerts`)

Le triage, à côté du registre. Une alerte n'engage rien — pas de pilote, pas d'échéance
réglementaire ; un incident, si. C'est toute la raison de la séparation.

| Route | Rôles | Effet |
|---|---|---|
| `POST /api/alerts` | `svc`, gestionnaire, admin | **Ingestion idempotente** — voir ci-dessous. |
| `GET /api/alerts` | + `svc` | La file. Filtres : `status` (séparés par des virgules), `level_min`, `machine`, `ruleId`, `assignee`, `since`, `limit`, `offset`. Rend `{ total, resultats }`, triés par niveau puis dernière vue. |
| `GET /api/alerts/etat` | + `svc` | Décomptes, **plus ancienne non triée**, **dernière reçue**, seuil, rétention, niveau de notification, adresse du tableau de bord. |
| `GET /api/alerts/stats` | + `svc` | `jours` (30 par défaut) : volumes, taux d'escalade, délai médian de triage, top des règles écartées, machines. |
| `GET /api/alerts/:id` | + `svc` | L'alerte, son journal de triage, ses **précédents**, ce que la cellule sait, le dernier avis du modèle et le fil. |
| `PATCH /api/alerts/:id` | gestionnaire, admin | Triage : `status`, `dismissReason`, `dismissNote`, `assignee`. |
| `POST /api/alerts/:id/escalate` | gestionnaire, admin | Crée l'incident ou rattache. |
| `POST /api/alerts/:id/avis` | gestionnaire, admin | Avis du modèle — sans verdict. |
| `POST /api/alerts/:id/chat` | gestionnaire, admin | Fil partagé avec le modèle. |
| `GET /api/alerts/connaissances?machine=&ruleId=` | + `svc` | Ce que la cellule sait de cette machine, de cette règle. |
| `POST /api/alerts/connaissances` · `DELETE /api/alerts/connaissances/:id` | gestionnaire, admin | Consigner, retirer. `portee` = `machine` \| `regle`, `valeur`, `note`. |
| `GET` / `POST /api/alerts/silences` · `PATCH /api/alerts/silences/:id/lever` | lecture / gestionnaire, admin | Faire taire une série, avec motif et **échéance obligatoire**. |
| `POST /api/alerts/dismiss-bulk` · `POST /api/alerts/reopen-bulk` | gestionnaire, admin | Écartement en masse, et son annulation. |

**Ce que la cellule sait.** Une note est attachée à la **machine** ou à la **règle**, jamais à
l'alerte : un fil de conversation meurt avec son alerte, et le fait qu'une machine soit le
reverse proxy de l'établissement serait à réapprendre au modèle chaque semaine. La note est
jointe au bloc que lit le modèle, annoncée comme un fait **à ne pas contredire**, et affichée
à qui trie. Clé unique `(portee, valeur)` : réécrire remplace.

**Ingestion.** Corps : `ruleId`, `ruleDescription`, `level` (0–16), `machine` et `observedAt`
obligatoires ; `sourceIps`, `username`, `mitre`, `source`, `dashboardUrl`, `rawLog` (2 ko) et
`context` (20 clés) facultatifs. **`externalKey` et `severity` ne sont pas acceptés** : la clé
de regroupement est calculée par le serveur et la gravité dérivée du niveau — deux tables de
correspondance dans deux dépôts donnent deux réponses.

Le **panier** vaut `source:règle:machine:jour`, le jour étant celui d'`Europe/Paris` : avec le
jour UTC, une alerte de 00h30 serait rattachée à la veille et la série se scinderait une nuit
sur deux. `201` à la création, `200` sur une occurrence — `firstSeen` ne bouge jamais,
`lastSeen` avance, adresses et techniques s'accumulent. **Une alerte écartée n'est pas
rouverte** par une occurrence ; une alerte escaladée en inscrit une ligne dans la chronologie
de son incident. Refus : `422` sous le seuil ou sans horodatage d'alerte, `429` au-delà de
300 appels par minute.

**Escalade.** `knowledgeAt` vaut la **première vue**, jamais l'heure du clic. Sur un
rattachement, la date de connaissance de l'incident **recule** si l'alerte est antérieure.

**Attribution.** Un gestionnaire ne prend que ce qui est libre ; attribuer à quelqu'un d'autre
est `403`, reprendre une alerte déjà portée `409` — les deux réservés aux admins, comme pour
le pilote d'un incident.

**Avis du modèle.** Sortie volontairement **sans champ « décision » ni score** : `lecture`,
`pourEcarter`, `pourApprofondir`, `aVerifier`. Stocké à part, n'écrit rien dans l'alerte, et
la demande est inscrite au journal de triage.

**Rétention.** Les alertes non escaladées sont purgées au-delà de la rétention réglée (90
jours par défaut), mais leur décompte rejoint un **agrégat mensuel** par règle, machine et
motif : les alertes écartées sont la matière du réglage des règles, et un top 10 amnésique
chaque trimestre ne servirait à rien. Les escaladées suivent leur incident.

### Enquête guidée (`/api/incidents/:id/enquete`)

Les cases de la checklist qui portent un bloc `enquete` dans le dépôt de procédures,
avec la requête de la bibliothèque (`_requetes/*.yml`), sa **version** et le dernier état
enregistré.

- `GET /api/incidents/:id/enquete` — étapes applicables, avec leur résultat et leur verdict.
- `POST /api/incidents/:id/enquete/:cle/lancer` (gestionnaire, admin) — exécute la requête
  **en lecture seule**, avec les paramètres de l'incident. Le résultat et le commit exact de
  la requête sont enregistrés ; la chronologie en garde la trace.
- `PUT /api/incidents/:id/enquete/:cle/verdict` (gestionnaire, admin) — `aucun` | `trouve` |
  `impossible`. **`impossible` exige un motif** : sans lui, une étape sans source se lirait
  comme vérifiée.

`cle` identifie l'étape par **sa case et sa requête** (`<case>.<requete>`) : une case peut
porter plusieurs recherches, et ajouter une source ne déplace pas les verdicts déjà rendus
sur les autres.

**Aucune requête libre.** Seuls les identifiants de la bibliothèque sont exécutables, et
parmi eux ceux que Slowpoke sait exécuter — une requête décrite dans le dépôt mais pas encore
outillée le dit, au lieu de prétendre chercher. Les sources actuelles : Slowpoke lui-même,
l'annuaire LDAP, les archives Wazuh (journaux d'authentification Zimbra, LemonLDAP, slapd),
et les étapes « à la main », qui rendent la commande à exécuter.

⚠️ **Un résultat vide dit toujours pourquoi** : source non configurée, rétention dépassée,
remontée interrompue, plafond de lignes atteint, annuaire injoignable. Sans cela, « aucune
authentification suspecte » et « on n'a pas pu regarder » se liraient pareil.

### Chercher un indicateur (`/api/indicateurs`)

`GET /api/indicateurs?valeur=…` — est-ce que ceci est déjà connu ? La nature de la valeur est
déduite (IP, domaine, URL, empreinte, adresse, identifiant, nom de personne), puis cherchée
dans les incidents, les listes blanches et l'inventaire. Chaque source dit ce qu'elle a
trouvé **ou pourquoi elle n'a pas pu répondre** : une source non interrogée n'est jamais
rendue comme « rien trouvé ». La recherche est journalisée dans l'audit.

> Le bloc des incidents est rendu **deux fois** : sous `slowpoke`, et sous `sniff` — ancien nom
> de l'application, conservé pour les appelants en place. Même objet, pas une seconde vérité.
> Les nouveaux appelants lisent `slowpoke` ; `sniff` disparaîtra quand plus personne ne le lira.

`GET /api/indicateurs/incident/:id` — le « déjà-vu » d'un incident : ses valeurs qui
apparaissent dans d'autres incidents.

### Assistance

- `POST /api/incidents/:id/analyses/:genre` — `resume` | `iocs` | `avancement` | `procedure`. Le résultat est **stocké à part**, jamais écrit dans les champs de l'incident.
- `GET /api/incidents/:id/analyses` — dernière analyse de chaque genre.
- `GET` / `POST` / `DELETE /api/incidents/:id/chat` — fil de conversation, partagé (`?partagee=true`) ou personnel. **Hors de la chronologie** : le journal est une pièce de dossier.

Ces routes peuvent dépasser la minute — un modèle local est lent. La connexion peut tomber avant la réponse **alors que le traitement aboutit** : le résultat est en base, l'interface relit avant de conclure à un échec.

### Réglages (admins)

`GET` / `PUT /api/settings/{advens,gitlab,ia,glpi,harfanglab,ldap,wazuh,alertes}`, plus les essais et synchronisations associés (`POST …/test`, `POST …/sync`, `POST …/import`). `ldap` n'accepte qu'une adresse `ldaps://`, `wazuh` qu'une adresse `https://` : une liaison en clair ferait circuler le mot de passe de lecture. **Aucun jeton n'est jamais renvoyé au navigateur** — seulement un aperçu de ses derniers caractères. Ils sont chiffrés en base (AES-256-GCM), la clé vivant dans `.secrets/`, hors de la base : c'est ce qui protège les sauvegardes.

### Machines et jointure inter-applications

- `GET /api/incidents/:id/machines` — machines rattachées à un incident, enrichies de l'inventaire quand elles y correspondent.
- `GET /api/machines/recherche?q=` — recherche dans la **copie locale** de l'inventaire, jamais dans GLPI : instantanée, et disponible quand GLPI ne l'est pas.
- `GET /api/machines/:glpiId/incidents?limit=` — incidents rattachés à une machine. **Ouverte aux comptes de service** en lecture (`x-service-key`, scope `read`), les autres routes de ce groupe ne l'étant pas.

L'**identifiant GLPI est la clé de jointure avec une application tierce** — un registre d'actifs, par exemple : les deux synchronisent le même inventaire, aucune n'a donc à connaître les identifiants internes de l'autre. C'est ce qui permet d'afficher, sur une fiche d'actif, les incidents que Slowpoke connaît — en un appel plutôt qu'en parcourant tous les incidents.

Une machine saisie librement n'a pas d'identifiant GLPI : elle n'est donc jamais renvoyée par cette route. Un appelant ne peut pas distinguer « aucun incident » de « machine hors inventaire » sans le dire explicitement.

La route `POST /api/incidents` accepte un payload dont la forme dépend du `type`. Champs de base communs :

- `type` : `phishing` | `malware` | `ransomware` | `ddos` | `network_intrusion` | `data_breach` | `other`
- `severity` : accepte **trois écritures** — le code (`P1`…`P4`), la valeur technique (`critical`…) ou le libellé (`Critique`…), normalisées vers la valeur technique. Une écriture non reconnue est refusée (`422`).
- `status` : `open` | `investigating` | `in_progress` | `surveillance` | `resolved` | `closed`
- `resolution` *(optionnel)* : `true_positive` | `false_positive` | `benign` | `legitimate` | `duplicate`
- `perimeter` *(optionnel)* : `composante` | `laboratoire` | `service_central` | `infrastructure` | `etablissement_raccorde` | `inconnu`
- `surveillanceExpiresAt` *(optionnel)* : échéance de la mise sous surveillance. Passée cette date, une tâche horaire clôt l'incident **en conservant sa résolution** et l'inscrit à la chronologie.
- `source` : chaîne libre (IP, domaine, outil source…)
- `knowledgeAt` **(obligatoire)** : quand l'**établissement** a eu connaissance de l'incident — détection interne, ou réception d'un signalement tiers. **Point de départ des échéances réglementaires.** Un incident créé sans ce champ est refusé (`422`).

> **Fuseau horaire.** Une date **sans fuseau** (« 2026-08-19 10:44:00 ») est lue à l'heure de l'établissement — `Europe/Paris` — et non dans celui du serveur, qui tourne en UTC. Une date **avec fuseau** (`…Z`, `+02:00`) est respectée telle quelle. Vaut pour tous les champs de date : connaissance, saisine, rétro-datation, dates de détail, journaux de connexion. L'affichage suit la même règle : les heures présentées sont celles de l'établissement, identiques côté serveur et côté navigateur.
- `knowledgeEstimated` *(optionnel, défaut `false`)* : vrai quand `knowledgeAt` est une approximation.
- `referredAt` *(optionnel)* : saisine de la cellule. À défaut, la date de création.
- `details` : objet `{ type, data }` où `type` répète le type de l'incident.

La plupart des champs techniques des détails sont des **tableaux** (machines, IOC, IP, cibles, ports, vecteurs…).

### Automatiser la création d'incidents

Tout ce que fait l'interface passe par l'API, et un **compte de service** permet à une machine
d'en faire autant. Le cas courant : un signalement arrive par courriel ou par webhook, un
orchestrateur (n8n, Node-RED, un script `cron`) le met en forme et appelle `POST /api/incidents`.

1. Un admin crée le compte et sa clé dans *Comptes → Comptes de service*, avec le scope
   **`write`** — et rien de plus : `read` seulement si le flux relit des incidents.
2. La clé voyage en en-tête, `x-service-key: sk_…` ou `Authorization: Bearer sk_…`.
3. Le corps est celui décrit ci-dessous, type par type. `knowledgeAt` est **obligatoire** :
   c'est la date d'où partent les échéances réglementaires.

```bash
curl -X POST https://<votre-domaine>/api/incidents \
  -H "x-service-key: sk_…" \
  -H "content-type: application/json" \
  -d '{
    "type": "phishing",
    "severity": "P3",
    "status": "open",
    "shortDescription": "Compte compromis signalé par la messagerie",
    "knowledgeAt": "2026-03-04 09:12:00",
    "source": "webhook-messagerie",
    "details": { "type": "phishing", "data": { "users": [{ "email": "agent@exemple.fr" }] } }
  }'
```

Ce qu'il faut savoir avant de brancher un flux :

- **L'idempotence est à votre charge.** L'API ne déduplique pas : un orchestrateur qui réessaie
  crée deux incidents. Portez votre propre clé dans `source` ou dans la description, et vérifiez
  avant de créer (`GET /api/incidents?...`).
- **`silent: true`** crée l'incident **sans notifier** : indispensable pour un import de
  rattrapage, sauf à réveiller tout le monde pour des incidents vieux de six mois.
- **Un refus est explicite** : `422` avec le champ en cause (gravité non reconnue,
  `knowledgeAt` manquant), `403` quand le scope ne couvre pas le verbe. Faites remonter le corps
  de la réponse dans les journaux du flux — sans lui, un import qui ne crée rien reste muet.
- **Les dates sans fuseau sont lues à l'heure de l'établissement** (voir l'encadré ci-dessus) :
  une source qui écrit en UTC doit le dire (`…Z`).
- La **suppression** d'un incident n'est ouverte à aucun compte de service, quel que soit le scope.

### Phishing

Les identités usurpées et les logs d'activité sont rattachés à l'utilisateur concerné.

```json
{
  "type": "phishing",
  "severity": "low",
  "status": "resolved",
  "resolution": "true_positive",
  "source": "",
  "details": {
    "type": "phishing",
    "data": {
      "detectedAt": "2026-01-01T08:00:00.000Z",
      "identities": [
        {
          "identity_name": "",
          "fromDisplayName": "",
          "fromAddress": "",
          "replyDisplayName": "",
          "replyAddress": "",
          "createdAt": ""
        }
      ],
      "logs": [
        {
          "activityStart": "",
          "activityEnd": "",
          "ipAddress": "",
          "countryCode": "",
          "countryName": "",
          "actions": [
            { "actionType": "messages_deleted", "amount": 27, "label": "27 message(s) supprimé(s)" }
          ]
        }
      ],
      "user": { "fullName": "", "email": "", "composante": "", "affiliation": "" }
    }
  }
}
```

- `actionType` : `messages_sent` | `messages_deleted` | `contacts_added` | `identity_modified` | `other`
- `amount` : entier (ex. nombre de messages) ; `label` : texte libre décrivant l'action (utile surtout pour `other`).

### Malware

```json
{
  "type": "malware",
  "severity": "low",
  "status": "resolved",
  "source": "",
  "details": {
    "type": "malware",
    "data": {
      "rntCertId": "",
      "malwareType": "trojan",
      "detectedAt": "",
      "machines": [""],
      "iocs": [""],
      "c2": [""],
      "networkLocations": [""],
      "additionalInfo": {},
      "users": [
        { "fullName": "", "email": "", "composante": "", "affiliation": "" }
      ]
    }
  }
}
```

- `malwareType` : `worm` | `trojan` | `spyware` | `adware` | `other`
- `users` : liste des utilisateurs concernés (peut être vide).

### DDoS

```json
{
  "type": "ddos",
  "severity": "low",
  "status": "resolved",
  "source": "",
  "details": {
    "type": "ddos",
    "data": {
      "durationMinutes": 0,
      "startedAt": "",
      "endedAt": "",
      "peakBandwidthMbps": 0,
      "targets": [""],
      "sourceIps": [""],
      "vectors": [""],
      "targetPorts": [""]
    }
  }
}
```

### Intrusion réseau

```json
{
  "type": "network_intrusion",
  "severity": "low",
  "status": "resolved",
  "source": "",
  "details": {
    "type": "network_intrusion",
    "data": {
      "intrusionType": "brute_force",
      "detectedAt": "",
      "sourceIps": [""],
      "compromisedAccounts": [""],
      "machines": [""],
      "networkLocations": [""],
      "additionalInfo": {}
    }
  }
}
```

- `intrusionType` : `port_scan` | `brute_force` | `vulnerability_exploit` | `defacement` | `other`

### Ransomware

```json
{
  "type": "ransomware",
  "severity": "low",
  "status": "resolved",
  "source": "",
  "details": {
    "type": "ransomware",
    "data": {
      "rntCertId": "",
      "ransomCurrency": "",
      "ransomAmount": 0,
      "networkLocation": [""],
      "concernedEntities": [""],
      "machines": [""],
      "iocs": [""],
      "entrypoint": "",
      "detectedAt": "",
      "additionalInfo": {}
    }
  }
}
```

### Fuite de données

```json
{
  "type": "data_breach",
  "severity": "low",
  "status": "resolved",
  "source": "",
  "details": {
    "type": "data_breach",
    "data": {
      "detectedAt": "",
      "dataCategories": [""],
      "exfilDestinations": [""],
      "recordsAffected": 0,
      "additionalInfo": {},
      "users": [
        { "fullName": "", "email": "", "composante": "", "affiliation": "" }
      ]
    }
  }
}
```

### Autre

```json
{
  "type": "other",
  "severity": "low",
  "status": "resolved",
  "source": "",
  "details": {
    "type": "other",
    "data": {
      "tags": [""],
      "customType": "",
      "customFields": {}
    }
  }
}
```

### Prise en charge

Qui **suit** un incident est distinct de qui l'a créé, et ne se déduit jamais du statut : passer un incident en « en traitement » ne désigne personne.

| Route | Rôles | Effet |
|---|---|---|
| `POST /api/incidents/:id/pilot` | gestionnaire, admin | Sans corps : auto-attribution. Avec `{ "pilotId": "<id>" }` : désigne un tiers — **admins uniquement**, y compris en réattribution. |
| `DELETE /api/incidents/:id/pilot` | pilote lui-même, admin | Remet l'incident à l'état non pris en charge. |
| `GET /api/incidents/unassigned/list` | tous rôles en lecture | Incidents **ouverts** que personne ne suit. Les incidents clos en sont écartés : ils n'appellent plus d'action. |

Un gestionnaire ne prend la main que sur un incident **libre** ; réattribuer un incident déjà suivi renvoie `409` sauf pour un admin, et désigner quelqu'un d'autre sans être admin renvoie `403`.

`GET /api/incidents/:id` renvoie toujours la relation **`pilotUser`** (`{ id, name }`, ou `null`) en plus du champ `pilot`. Elle n'a pas à être demandée via `with` : « pris en charge » sans dire par qui ne répond pas à la question.

Les colonnes `takenOverAt` et `takenOverBy` tracent **quand** et **par qui** l'attribution a été faite. Lorsqu'un admin désigne un tiers, `pilot` ≠ `takenOverBy` — c'est précisément ce que la distinction des deux colonnes permet de retrouver.

### Listes blanches (`/api/exclusions`)

Inventaire des angles morts volontaires. Deux règles inscrites **dans le schéma** : motif obligatoire et non vide, date de revue obligatoire. Sans elles, une exclusion devient permanente par simple oubli.

| Route | Rôles | Effet |
|---|---|---|
| `GET /api/exclusions` | + `svc` | Liste, triée par date de revue croissante. Filtres : `state` (`active`/`revoquee`), `incidentId`, `overdue=true` (revues dépassées). |
| `GET /api/exclusions/champs-portee` | lecture | Critères de portée disponibles **par outil** — le formulaire les lit plutôt que de les redéclarer. |
| `POST /api/exclusions` | gestionnaire, admin | Création. |
| `PATCH /api/exclusions/:id/review` | gestionnaire, admin | Reporte la date de revue après examen. |
| `PATCH /api/exclusions/:id/revoke` | gestionnaire, admin | Révoque — l'exclusion **reste consultable**. |
| `PATCH /api/exclusions/:id/rapprocher` | gestionnaire, admin | Apparie l'exclusion à une règle de l'EDR (`outilRef`), ou l'en détache (`null`). Une règle ne porte **qu'une décision active** : l'apparier une seconde fois est refusé en **`409`**, en nommant l'incident qui la détient. Émet un webhook `exclusion_appariee` / `exclusion_detachee`. |
| `GET /api/exclusions/regles-libres` | gestionnaire, admin | Règles de l'EDR encore libres d'appariement, filtrées par `q` sur le commentaire, la cible ou les critères. Sert l'appariement manuel quand la suggestion automatique ne trouve rien. |
| `GET /api/harfanglab/regles` | admin, `svc` | **Inventaire complet** des règles de liste blanche de l'EDR — voir ci-dessous. |
| `GET /api/exclusions/revues` | + `svc` | Revues des règles posées **hors incident**, triées par échéance. Filtre `etat` (`active`/`remplacee`/`levee`). |
| `POST /api/exclusions/revues` | gestionnaire, admin | Programme la revue d'une règle sans incident : `{ regleRef, libelle?, motif, echeance, tool? }`. **`409`** si une exclusion active cite déjà la règle (c'est son échéance qui fait autorité) ou si une revue existe ; **`422`** si la référence est inconnue du dernier relevé de l'EDR. |
| `PATCH /api/exclusions/revues/:id` | gestionnaire, admin | Reporte l'échéance — et remet la mémoire du rappel à zéro, sinon reporter vaudrait extinction. |
| `PATCH /api/exclusions/revues/:id/lever` | gestionnaire, admin | Lève la revue, **motif obligatoire**. La ligne reste consultable. |

Corps de création :

```json
{
  "incidentId": "FF7LXN",
  "tool": "harfanglab",
  "scopeDetails": { "path": "C:\\Program Files\\Metier\\agent.exe", "machine": "srv-metier-01" },
  "reason": "Binaire métier signé, déployé par le service applicatif",
  "reviewDate": "2026-11-02"
}
```

- `tool` : `harfanglab` | `wazuh` | `pare_feu` | `autre` (`toolOther` porte le nom quand `tool` vaut `autre`).
- `scopeDetails` : critères **combinables**, dont l'API compose le libellé lisible (`scope`). Un `scope` en texte libre reste accepté mais est ignoré si `scopeDetails` est fourni — les critères sont recherchables, le texte non.
- Une portée manifestement large (racine de disque, joker seul, plage plus large qu'un `/16`, répertoire système) est refusée en **`409`** tant que `acknowledgeBroadScope: true` n'est pas transmis. La réponse détaille les critères en cause et pourquoi.
- Motif vide ou portée vide : **`422`**.
- `outilRef` facultatif : la **règle de l'EDR** désignée dès la création — c'est le chemin du bouton *Consigner*, qui évite un appariement en deux temps. **`409`** si une exclusion active la cite déjà, en nommant l'incident qui la détient. Une revue de règle active sur la même référence passe alors en « remplacée ».

**Le registre a deux moitiés, et c'est assumé.** `exclusion` naît d'un incident — `incident_id` est NOT NULL, et l'invariant tient. `revue_regle` porte les règles de l'outil posées **hors** incident, avec le même motif obligatoire et la même échéance. Rendre `incident_id` nullable aurait rendu l'inventaire ambigu et l'index d'unicité sur la règle indécidable. Les deux moitiés sont rappelées par la même tâche périodique (voir [Exploitation & MCO](Exploitation-MCO.md#revue-des-listes-blanches--rappelée-automatiquement-décidée-par-un-humain)).

Une révocation ne supprime rien : savoir qu'un angle mort a existé éclaire un incident ultérieur sur le même périmètre.

#### Inventaire des règles de l'EDR (`GET /api/harfanglab/regles`)

Destiné au **registre des listes blanches**, qui lit ici au lieu d'appeler l'EDR lui-même. Le rapprochement exclusion ↔ règle est un **jugement** : calculé deux fois par deux heuristiques, il donnerait deux réponses, et l'arbitrage entre elles n'appartiendrait à personne. Slowpoke lit l'EDR, apparie, et expose la décision.

Paramètres : `limit` (200 par défaut, 1000 au plus) et `offset`. Réponse : `{ total, etat, resultats }` — le total est compté en base, séparément de la page.

**Rendu sans aucun filtre**, règles de l'éditeur et règles disparues comprises. Filtrer à l'affichage est une décision d'écran, réversible ; filtrer à la source rendrait l'absence indistinguable d'une règle qui n'existe pas, et aucun lecteur en aval ne pourrait le rattraper.

| Champ | Contenu |
|---|---|
| `ref` | Identifiant de la règle dans l'EDR. |
| `libelle`, `commentaire` | **La même valeur** : dans l'EDR, le commentaire de la règle est ce qui lui tient lieu de libellé. Les deux clés existent pour la commodité du lecteur, pas parce qu'il y a deux informations. |
| `criteres`, `cible`, `active` | Le contenu de la règle et son état dans l'outil. |
| `fourniParEditeur` | `provided_by_hlab` — la règle ne relève d'aucune décision locale. |
| `creeeLe` | **Date de création dans l'outil**, jamais celle de l'import. Une règle posée il y a trois ans et jamais réexaminée ne mérite pas une échéance repartie de zéro. |
| `presente` | La règle est-elle encore dans l'EDR. **Slowpoke est seul à le savoir** : une règle disparue alors qu'une exclusion la cite encore signifie qu'une détection est revenue sans décision. |
| `tags`, `champTags` | Les étiquettes **telles quelles**, et le champ de l'API qui les portait. |
| `exclusion` | `{ id, incidentId, motif, reviewDate, state }` quand la règle est appariée — **y compris à la main** — `null` sinon. C'est ce qui dispense le lecteur de deviner l'appariement. |
| `etat` | Date du dernier relevé de l'EDR et son résultat. Sans lui, un inventaire vide et un connecteur en panne se ressemblent. |

⚠️ **Les étiquettes ne sont pas interprétées ici.** Slowpoke n'en dérive aucun booléen « technique » et ne filtre pas dessus : le classement se déclare dans le registre, là où la cellule peut le corriger sans toucher au code. Deux endroits qui interpréteraient la même étiquette finiraient par diverger.

`champTags` nomme le champ qui a répondu, cherché dans cet ordre : `tags`, `labels`, `categories`, `category`. **Le swagger HarfangLab n'en documente aucun** — plutôt que de supposer lequel porte le marqueur, on relève celui qui existe et on le rapporte. `null` signifie qu'aucun n'a répondu, et c'est cette valeur qui l'apprendra pour de bon ; le bilan de synchronisation l'affiche également.

Le `comment` de l'EDR est **volontairement exclu** de cette recherche : c'est du texte libre, et y chercher un marqueur ferait passer une phrase pour une étiquette. Il est exposé tel quel (`commentaire`), à qui veut y appliquer sa propre convention en connaissance de cause.

### Valeurs récurrentes (`GET /api/stats/correlation`)

Machines, IOC, IP sources, serveurs C2 et comptes compromis apparaissant dans **au moins `min` incidents distincts** sur les `days` derniers jours. `days` vaut 30 par défaut et est borné à 365 ; `min` vaut 3 par défaut et ne descend jamais sous 2. Ouvert à tous les rôles en lecture, comptes de service compris — volontairement hors du query builder, réservé aux admins, alors que cette lecture intéresse d'abord les gestionnaires.

Le comptage porte sur les **incidents distincts** : une même valeur citée plusieurs fois dans un seul incident ne constitue pas une récurrence.

## Développement

Prérequis :

- [Bun v1.3.14+](https://bun.sh/)
- [Node.js](https://nodejs.org/en)
- Docker
- Une instance **PostgreSQL** locale (base nommée `slowpoke`)

### Cloner le repo

```sh
git clone <url-du-repo-git>
```

### Installer les dépendances

```sh
bun install
```

### Variables d'environnement

À définir dans `apps/app` **et** `apps/server`.

`apps/app` :

```
NUXT_PUBLIC_SERVER_BASE_URL=http://localhost:4000
```

`apps/server` :

```
PORT=4000
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/slowpoke
READONLY_DATABASE_URL=postgresql://query_builder:<password>@<host>:5432/slowpoke
OIDC_CLIENT_ID=<client id OIDC>
OIDC_CLIENT_SECRET=<client secret OIDC>
OIDC_DISCOVERY_URL=https://<votre-idp>/.well-known/openid-configuration
OIDC_PROVIDER_LABEL=Connexion SSO
OIDC_ADMIN_GROUP=admins
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:4000
VAPID_PUBLIC_KEY=<clé publique VAPID>
VAPID_PRIVATE_KEY=<clé privée VAPID>
SITE_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:4000
```

> Générer une paire VAPID : `npx web-push generate-vapid-keys`.
> La base **doit** s'appeler `slowpoke` (la migration `0004` crée le rôle `query_builder` et référence ce nom).

### Migrations

```sh
cd packages/database
bunx drizzle-kit generate   # génère une migration depuis le schéma
bunx drizzle-kit migrate    # applique la chaîne de migrations
```

### Démarrer en développement

```sh
bun run dev
```

## Déploiement

Via **Docker Compose** : `docker compose up -d --build app server`. Exposer uniquement le reverse proxy ; les migrations sont appliquées au démarrage (ou à la main sur les environnements gérés manuellement).
