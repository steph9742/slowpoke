# Installation & réglages — Slowpoke (Slowpoke)

Ce document couvre **l'installation** de Slowpoke (via Docker Compose, y compris sur un serveur **YunoHost**) et les **réglages dans l'application** (notifications, webhooks, comptes & rôles, comptes de service).

Voir aussi : [`Exploitation-MCO.md`](Exploitation-MCO.md) (exploitation au quotidien, mises à jour, sauvegardes) et [`Documentation.md`](Documentation.md) (technique/API).

> Valeurs à adapter notées `<…>`.

---

# Partie A — Réglages dans l'application

## A.1 Réglages (`/parametres`) — accessible à tous les connectés

### Procédures — admins uniquement
Branche Slowpoke sur le dépôt Git qui porte vos procédures : **adresse GitLab**, **projet** (`<groupe>/<projet>`), **branche** et **jeton de lecture**. Le jeton demande la portée **`read_api`** et le rôle **Reporter** au minimum : la liste des fichiers passe par l'API REST, que `read_repository` seul ne couvre pas (elle vaut pour les opérations Git). Slowpoke lit les fiches, il ne les écrit jamais : GitLab reste la source de vérité. Le jeton est chiffré et jamais renvoyé au navigateur, comme celui du SOC.

Les fiches `incidents/` et `annexes/` sont relues **toutes les six heures**, et *Synchroniser maintenant* déclenche une relecture immédiate. Une fiche inchangée n'est pas réécrite, pour que la date de synchronisation dise quand la procédure a **changé**, pas quand on l'a relue.

Cette copie locale sert l'onglet **Conduite à tenir** de chaque incident : elle permet d'afficher la procédure même si GitLab ne répond pas, et de savoir quelle **version** était en vigueur le jour d'un incident.

### EDR — listes blanches — admins uniquement
Compare les exclusions consignées dans Slowpoke aux règles de liste blanche réellement posées dans l'EDR : **adresse** et **jeton d'API**. Un compte **sans aucun droit d'écriture** suffit — Slowpoke lit, il n'écrit jamais dans l'outil.

Les règles sont relues toutes les 6 heures, et le résultat se consulte depuis **Listes blanches**. Quatre blocs, dont un seul n'est pas un écart :

- **Règles de l'EDR non consignées** — listes blanches posées dans l'outil, pour la plupart sans incident d'origine : déploiement, scripts d'exploitation, exceptions techniques. Le bouton **Consigner** tranche, et dans les deux cas un motif et une échéance sont exigés : **rattachée à l'incident qui la motive**, la règle devient une exclusion ; **posée hors incident**, elle reçoit une **revue programmée** (depuis le 2026-10-06 — avant, Slowpoke ne savait pas les consigner et renvoyait au registre externe). Une règle qui porte déjà sa décision affiche son échéance et sort du compteur d'écarts ; celles qui n'ont encore rien y entrent, puisqu'on peut désormais les traiter. Les règles fournies par l'éditeur restent écartées, elles ne relèvent d'aucune décision locale.
- **Enregistrées, disparues de l'EDR** — l'exclusion est active dans Slowpoke mais la règle n'existe plus : la détection est revenue sans que personne ne l'ait décidé.
- **Clos « légitime » sans exclusion** — un incident classé légitime signifie qu'on a décidé de ne plus voir quelque chose ; cette décision doit exister quelque part. **Cet écart ne dépend pas de l'EDR** : il s'affiche même sans connecteur configuré.
- **Non rapprochées** — exclusions consignées avant ce rapprochement, ou jamais appariées. **Ce n'est pas un écart** : sans référence vers l'outil, on ne peut rien affirmer. *Chercher la règle* propose des correspondances d'après la portée ; quand elle ne trouve rien — le cas dès que l'exclusion et la règle sont rédigées en termes différents — un champ de **recherche libre** permet de choisir la règle soi-même. Le rattachement part aussi de la règle constatée, depuis le bloc précédent. Dans les deux sens, c'est un humain qui confirme.

⚠️ **La date de la dernière lecture réussie est affichée avec le résultat.** Sans elle, « aucun écart » et « la lecture a échoué » se ressemblent exactement — et une panne silencieuse passerait pour une situation saine.

**Slowpoke est le seul à lire l'EDR.** Le registre des listes blanches lit chez lui, via `GET /api/harfanglab/regles` (voir la documentation technique) : l'inventaire complet, l'appariement décidé ici, et l'état du dernier relevé. Le rapprochement exclusion ↔ règle est un jugement — le faire deux fois avec deux algorithmes donnerait deux réponses, sans personne pour arbitrer.

Le bilan de synchronisation indique **dans quel champ les étiquettes ont été trouvées** (`tags`, `labels`, `categories`, `category`), ou qu'aucun n'existe. Le swagger de l'EDR n'en documente aucun : plutôt que de supposer, Slowpoke relève celui qui répond et le rapporte. Il ne les interprète jamais — le classement « technique » se déclare dans le registre.

### Annuaire (LDAP) — admins uniquement
Sert l'enquête « compte compromis » : dernier changement de mot de passe, MFA et groupes d'un compte. **Adresse** (`ldaps://` **uniquement** — une liaison en clair ferait circuler le mot de passe de liaison sur le réseau, et l'enregistrement est refusé), **base de recherche**, **compte de liaison** et son mot de passe, plus les deux **attributs** à lire (`pwdChangedTime` et `ufcMailPersoMFA` par défaut, modifiables sans toucher au code).

Le compte de liaison doit être en **lecture seule** : Slowpoke ne fait que lire l'état d'un compte. Son mot de passe est chiffré comme les autres secrets et n'est jamais renvoyé au navigateur. *Essayer la liaison* vérifie que la base répond.

### Journaux d'authentification (Wazuh) — admins uniquement
Sert la même enquête : **où et quand le compte s'est authentifié**, et combien de fois il a échoué. Slowpoke lit l'index des archives de Wazuh (`wazuh-archives-*` par défaut) et reconnaît lui-même trois sources — **Zimbra** (`audit.log`), **LemonLDAP::NG** et **OpenLDAP** (`slapd`) — sans dépendre des décodeurs de l'outil.

Réglages : **accès**, **adresse** (`https://` uniquement), **compte de lecture** et mot de passe, **index**, **autorité de certification** et **nom attendu dans le certificat**.

- **Accès** : *Indexeur, port 9200* dans le cas normal. *Tableau de bord* quand l'indexeur n'est pas joignable : le tableau de bord relaie alors la recherche vers l'indexeur **avec les identifiants du compte**, donc avec les mêmes droits et les mêmes limites.
- **Compte** : un rôle limité à l'index des archives, groupe d'actions `read`. Aucun droit d'écriture — Slowpoke ne fait que lire.
- **Autorité de certification** : le `root-ca.pem` de Wazuh, quand son certificat est signé par une autorité interne. On la fournit plutôt que de couper la vérification.
- **Nom attendu dans le certificat** : pour une adresse traduite (NAT). Slowpoke se connecte à l'adresse publique et exige un certificat valable pour le **nom interne** indiqué ici. La vérification reste entière.
- *Essayer la lecture* rapporte **la période couverte par l'index** — donc la rétention réelle — et vérifie que le champ `full_log` est bien indexé en texte, sans quoi la recherche par compte ne trouverait rien.

La recherche part de **30 jours avant la date de connaissance** de l'incident et va jusqu'à son lancement. Le résultat dit toujours ce qui empêche de conclure « rien trouvé » : rétention dépassée, remontée interrompue, plafond de lignes atteint, source absente de l'index, ou annuaire indisponible pour retrouver l'`uid` — LemonLDAP et `slapd` écrivent l'identifiant, pas l'adresse mail.

### Inventaire — admins uniquement
Branche Slowpoke sur GLPI pour rattacher des machines aux incidents sans faute de frappe : **adresse** (racine, sans `/apirest.php`), **jeton d'application**, **jeton utilisateur** d'un compte dédié en lecture, et **groupe critique**.

L'inventaire est **recopié localement** et relu toutes les 12 heures. La recherche interroge cette copie, jamais GLPI : elle est instantanée et **reste disponible quand GLPI ne l'est pas** — ce qui compte au moment où l'on saisit un incident. Une machine sortie de l'inventaire n'est jamais supprimée, seulement marquée : un incident peut la citer, et son nom doit rester lisible.

Le **champ « groupe »** se laisse vide dans le cas courant : il est détecté automatiquement. Mais une instance GLPI expose plusieurs champs de groupe — le groupe de rattachement et le groupe technique — et la détection peut retenir le mauvais : le symptôme est un nombre de machines critiques très inférieur à la réalité. *Essayer la connexion* liste alors les champs disponibles, et un clic en retient un.

*Essayer la connexion* liste aussi les groupes existants : saisir « groupe critique » de mémoire donne un libellé approchant qui ne correspond à rien. Les machines de ce groupe, sous-groupes compris, sont signalées sur les incidents.

Sur une fiche d'incident, le champ **Machines concernées** cherche à la frappe et propose les correspondances. **La recherche n'est jamais un passage obligé** : valider sans rien choisir enregistre ce qui est tapé, et une machine absente de l'inventaire se saisit librement — elle est alors marquée « hors inventaire ». Le nom retenu est stocké en clair à côté de l'identifiant GLPI, pour qu'une fiche reste lisible même si l'inventaire change ou disparaît.

### Assistance — admins uniquement
Branche Slowpoke sur un serveur d'inférence local exposant une API compatible OpenAI (Open WebUI, vLLM…) : **adresse**, **clé d'API**, **modèle** et **contexte de l'établissement**.

Le modèle doit rester **local** : les fiches sont en diffusion interne et les incidents contiennent des données personnelles. Rien ne doit sortir de l'établissement.

La liste des modèles est chargée depuis le serveur dès que l'adresse et la clé sont enregistrées — *Actualiser* la recharge. Un modèle enregistré qui disparaît de la liste reste affiché, signalé comme absent, plutôt que de s'effacer en silence. *Essayer le modèle* vérifie que l'ensemble répond réellement.

Le **contexte de l'établissement** est joint à chaque demande : ce que fait la cellule, ses outils, ses interlocuteurs, ses délais. Sans lui les réponses restent génériques. Les procédures, elles, sont jointes automatiquement selon le type d'incident.

Les **consignes** envoyées au modèle sont éditables (section repliable) : une par tâche, plus un cadre général. Un champ vide reprend la consigne par défaut, affichée en filigrane — c'est le moyen de revenir en arrière. Le **format de réponse attendu n'est pas modifiable** : il est ajouté par l'application, pour qu'une consigne mal réécrite dégrade la réponse sans casser l'analyse.

Deux consignes servent la **file d'alertes** : l'**avis** sur une alerte, écrit pour ne rendre **aucun verdict** — ce qui plaide pour écarter en face de ce qui plaide pour approfondir —, et l'**échange** qui le poursuit. Cette seconde consigne pose que ce qu'un analyste affirme est un **fait établi**, jamais à discuter, et qu'aucun nom de machine ou de domaine ne s'invente : sans cela, le modèle contredit la cellule sur son propre réseau, qu'il ne connaît pas. Les faits consignés dans « ce que la cellule sait » (fiche d'une alerte) lui sont joints au même titre. ⚠️ Réécrire ces deux consignes en leur demandant de **conclure** change la nature de l'outil : la file est faite pour que la décision reste humaine.

**Le modèle n'écrit jamais dans un incident, ni dans une alerte.** Ses sorties sont stockées à part, avec le modèle et la version du prompt qui les ont produites, et affichées comme des propositions. Un incident peut servir dans une procédure : le constat doit rester distinguable du texte engendré.

### Import SOC — admins uniquement
Visible seulement pour les admins, en tête de la page. Branche Slowpoke sur l'API de tickets d'un SOC externe — l'API **Advens** est la seule implémentée aujourd'hui : trois réglages, **adresse de l'API**, **nom du client** (le tenant) et **jeton**.

Le jeton est **chiffré en base** (AES-256-GCM) et **jamais renvoyé au navigateur** : le champ reste vide et le libellé rappelle ses quatre derniers caractères. La clé de chiffrement vit dans **`.secrets/settings.key`**, engendrée au premier enregistrement — rien à configurer. Elle est délibérément hors de la base : c'est ce qui protège les sauvegardes, qui partent hors-site. ⚠️ **`.secrets/` doit donc être sauvegardé comme le reste** ; le perdre rend les jetons illisibles et impose de les ressaisir (aucune donnée métier n'est perdue). Une variable `SETTINGS_ENCRYPTION_KEY` permet de fournir la clé soi-même, par exemple pour la partager entre plusieurs instances. Le laisser vide conserve celui en place — c'est le cas normal quand on ne corrige que l'adresse. Le bouton *Retirer* l'efface et interrompt l'import.

- **Essayer la connexion** — appelle l'API et rapporte le nombre de tickets vus et retenus. À faire après chaque modification : sans lui, une erreur de jeton ou de tenant ne se découvrirait qu'au passage suivant, une demi-heure plus tard.
- **Importer maintenant** — déclenche un passage immédiat sans attendre le minuteur.

La récupération tourne ensuite toute seule **toutes les 30 minutes**, en relisant les tickets modifiés sur 30 jours glissants. Un ticket déjà importé n'est jamais dupliqué (son identifiant Advens sert de clé) ni écrasé : seule sa **clôture** suit le SOC, parce qu'elle lui appartient, ainsi que les deux champs qui décrivent le ticket lui-même — **statut** et **motif de clôture** — rafraîchis à chaque passage. Le pilote, la gravité ajustée à la main et les commentaires sont le travail de la cellule et lui restent.

⚠️ **Le motif de clôture du SOC ne conclut pas à notre place.** `no_security_risk` et `no_longer_applicable` décrivent SA clôture, pas notre jugement : un P1 a été clos « sans risque de sécurité » parce que la machine avait été **éteinte** — ce n'est pas « bénin », c'est un incident réel dont la source a disparu. Ces deux motifs ne posent donc **aucune résolution** : la fiche se ferme, le motif est affiché à la place de la résolution, et la cellule tranche. `solved` → vrai positif, `risk_accepted` → **risque assumé**, `false_positive` → faux positif, `pentest` → activité légitime restent déduits. Un changement de motif chez le SOC est inscrit dans la chronologie de la fiche.

Ce qui atterrit où : la **description** ne reçoit que la synthèse et les détails du ticket ; la référence, le code ETSI et son libellé, l'étape de la chaîne d'attaque, la priorité SOC, l'échéance, le triplet correction/impact/exploitation et le lien Kibana deviennent des **champs structurés** (bloc « Informations supplémentaires »), avec les événements redoutés et l'étape en étiquettes. La description courte de l'incident reprend le **titre** du ticket, pas sa « synthèse » : chez Advens, la synthèse est le rapport complet (journaux, horodatages, IOC, commande d'exploitation, lien EDR), soit plus de mille caractères là où le titre en fait quarante. La **synthèse**, la **description détaillée du SOC**, ses **recommandations** et les **postes concernés** s'affichent en blocs sur la fiche, sous les champs. Les textes sont pris en Markdown (variantes `_md`), qui conserve listes et titres là où le texte brut les aplatit, et sont **rendus après nettoyage** : un ticket SOC cite du contenu d'attaquant — corps de courriel, adresses malveillantes — donc les scripts, images et liens cliquables en sont retirés. Une URL d'hameçonnage se lit et se copie, mais aucun clic ne l'ouvre. Les machines et adresses remontent dans les champs prévus par le type d'incident.

Ce qui entre : tout ticket que le SOC n'a pas classé « sans risque de sécurité », plus tout ticket portant un événement redouté quel qu'en soit le classement. Les vulnérabilités (codes ETSI commençant par `V`) et les mesures d'impact (`IMP_`) sont écartées : ce ne sont pas des incidents. Le détail des correspondances — codes ETSI, priorités, périmètres — est dans `apps/server/src/utils/advens.ts`, en un seul endroit, pour se compléter sans toucher à la mécanique.

### File d'alertes — admins uniquement
Trois réglages, et aucun n'est propre à l'établissement — c'est la raison d'être de cet écran.

- **Adresse du tableau de bord** (`https://…`) : les liens « Ouvrir dans l'outil » reçus des émetteurs sont **réécrits vers cette adresse**, chemin et fragment conservés. Un émetteur fabrique son lien avec l'adresse qu'il connaît — souvent celle d'un réseau interne — que personne ne joint depuis un poste : le lien s'ouvrait sur rien. Vide, le lien est gardé tel quel ; à défaut, l'adresse des réglages Wazuh sert quand l'accès passe par le tableau de bord.
- **Seuil d'ingestion** (niveau 10 par défaut) : en dessous, l'alerte est **refusée avec son motif**, jamais avalée en silence. Descendre le seuil n'a de sens qu'une fois le réglage des règles fait.
- **Rétention** (90 jours) : porte sur les alertes **non escaladées**. Les lignes partent, les décomptes restent dans l'agrégat mensuel.
- **Notifier à partir du niveau** (12 par défaut) : une alerte **neuve** au-dessus de ce niveau prévient les abonnés. Jamais sur une occurrence, jamais sur une série faite taire. **17 = ne jamais notifier.**

L'ingestion se fait par `POST /api/alerts` avec une **clé de service** de portée `write`. ⚠️ Cette portée permet aussi de créer des incidents : une clé dédiée demanderait un scope à part, ce qui n'existe pas encore.

### Notifications sur ce navigateur
Interrupteur **« Notifications sur ce navigateur »** : active/désactive le Web Push sur **cet appareil précis**. À répéter sur chaque navigateur/appareil où vous voulez recevoir les notifications. Nécessite un navigateur compatible et d'accepter la demande d'autorisation.

### Me notifier pour…
Visible une fois le push activé. Deux cases :

- **« Nouveaux incidents »** : à chaque incident créé.
- **« Revue des listes blanches »** : sept jours avant une date de revue, puis tant qu'elle est dépassée — exclusions, règles posées hors incident et silences d'alertes confondus. Une seule notification groupée par passage, pas une par échéance.
- **« Alertes graves »** : à l'arrivée d'une alerte neuve au-dessus du niveau réglé (section *File d'alertes*).

(Le suivi d'un incident précis se règle depuis sa fiche, bouton *Suivre l'incident* — voir le [guide utilisateur](Guide-Utilisateur.md).)

### Webhooks
Le gestionnaire de webhooks est affiché ici, mais **toutes ses actions sont réservées aux admins** (un non-admin voit l'interface mais reçoit une erreur). Voir A.4.

## A.2 Comptes → Utilisateurs (`/accounts/users`) — admins uniquement

Liste des utilisateurs. Pour chacun, un admin peut :
- **Changer le rôle applicatif** : `user` / `lecteur` / `gestionnaire` / `admin`. C'est ici qu'on donne un accès à un nouveau venu (arrivé en `user` sans accès).
- **Promouvoir admin**, **supprimer** l'utilisateur, **révoquer ses sessions**.

Garde-fou anti-verrouillage : un admin **ne peut pas changer son propre rôle** ni se supprimer (protection contre la perte d'accès).

## A.3 Comptes → Comptes de service (`/accounts/service`) — admins uniquement

Pour l'accès **machine/API** (orchestrateur, scripts d'import…).

1. **Créer un compte de service** : un nom + des scopes (`Lecture` / `Écriture` / `Suppression` / `Admin`).
2. **Créer une clé** rattachée : durée de vie (`1 jour` / `7 jours` / `30 jours` / `Jamais`) + métadonnées libres. La clé (`sk_…`) s'affiche floutée : **survol** ou bouton **œil** pour la révéler (l'œil est le seul moyen sur écran tactile), **clic sur la clé** pour la copier.
3. **Utilisation** : en-tête HTTP `x-service-key: sk_…` **ou** `Authorization: Bearer sk_…`. Une clé expirée renvoie `401`.

### Ce que les scopes autorisent

Les scopes sont **appliqués par l'API** : une clé sans le bon scope reçoit `403`.

| Scope | Autorise |
|-------|----------|
| **Lecture** (`read`) | les requêtes `GET` (lister et consulter les incidents, utilisateurs, identités, logs, artéfacts) |
| **Écriture** (`write`) | `POST` / `PATCH` (créer et modifier incidents, utilisateurs, logs…) |
| **Suppression** (`delete`) | `DELETE` (sur les routes ouvertes aux comptes de service) |
| **Admin** | passe-partout : tout ce qui précède |

Un compte **sans aucun scope** ne peut rien faire. Choisissez le minimum nécessaire : un flux qui ne fait qu'importer des incidents n'a besoin que d'**Écriture**.

> ⚠️ Une clé reste un secret sensible : donnez-lui une **expiration** et **rotez-la** régulièrement.
> ⚠️ La suppression d'un incident (`DELETE /api/incidents/:id`) n'est **pas** ouverte aux comptes de service, quel que soit leur scope — elle reste réservée aux gestionnaires et admins connectés.

## A.4 Webhooks (Réglages) — admins uniquement

Webhooks **sortants** (vers un orchestrateur ou toute URL) déclenchés par les événements d'incident.

Par webhook : **nom**, **URL** (`http(s)://…`), **événements** abonnés (au moins un), **secret** optionnel (signature HMAC), **activé** on/off. Bouton **Tester** pour envoyer un payload de test.

Événements disponibles : *Incident créé, Changement de statut, Mise à jour, Commentaire, Utilisateur ajouté / retiré, Artéfact ajouté / retiré, Clôturé, Liste blanche appariée / détachée de sa règle, Revue de liste blanche proche (7 jours), Revue de liste blanche dépassée, **Alerte reçue**, **Alerte écartée**, **Alerte escaladée en incident***.

Livraison : à chaque événement abonné, un `POST` JSON `{ event, timestamp, message, changes, incident }` avec l'en-tête `X-Slowpoke-Event`, et — si un secret est défini — `X-Slowpoke-Signature: sha256=<HMAC>` (badge *signé* dans l'UI). Envoi *fire-and-forget*, délai 5 s.

⚠️ **Cinq événements ne portent pas d'incident.** Les rappels de revue concernent aussi les règles posées hors incident : leur charge utile a donc `incident: null` et un objet `listeBlanche` à la place — plutôt qu'un incident inventé pour remplir le champ. Voir la [documentation technique](Documentation.md#webhooks).

## A.5 Connexion / SSO

L'application utilise un **SSO OpenID Connect**. À la première connexion, le rôle est dérivé : membre du groupe déclaré dans `OIDC_ADMIN_GROUP` → **admin**, sinon → **user** (sans accès). Les rôles `lecteur`/`gestionnaire` s'attribuent ensuite à la main (A.2).

## A.6 Connexion de secours (`/login-secours`)

> **Pourquoi elle existe.** Le SSO est la seule voie normale. Si l'annuaire tombe, si le client OIDC est mal déclaré ou si le claim `groups` disparaît, **tout le monde est enfermé dehors — y compris les administrateurs** : plus personne ne peut attribuer de rôle ni corriger la configuration.

Une page `/login-secours` propose une connexion **e-mail + mot de passe**, indépendante de l'annuaire.

- Elle est **séparée de `/login`** : un formulaire de mot de passe affiché en permanence à côté du bouton SSO inviterait à contourner l'annuaire au quotidien.
- Un **lien discret** y mène depuis `/login` (« Le SSO est indisponible ? »). Le masquer n'apporterait aucune sécurité — l'adresse est dans le code — et rendrait la page introuvable au seul moment où elle sert.
- **Chaque usage est tracé** : une ligne `login_secours` au journal d'audit (table `audit_log`) et un avertissement dans les journaux du serveur.

### Le compte de secours

Il est créé par le **seed**, à lancer une fois après les migrations.

> ⚠️ **Préparez d'abord le dossier `.secrets/`.** Le conteneur tourne en utilisateur non-root (**uid 1001**, `bunjs`). Si le dossier n'existe pas, Docker le crée en `root:root` au montage et le seed **ne peut pas y écrire** : le mot de passe s'affiche alors une seule fois à l'écran et n'est conservé nulle part.

```bash
mkdir -p .secrets && chown 1001:1001 .secrets && chmod 700 .secrets
docker compose run --rm server /app/seed
```

Si le seed affiche `⚠️ Impossible d'écrire .secrets/admin-password`, c'est exactement ce cas : **notez le mot de passe affiché immédiatement**, corrigez les droits, puis déposez-le à la main :

```bash
umask 077 && printf '%s\n' '<le-mot-de-passe-affiché>' > .secrets/admin-password
chown 1001:1001 .secrets/admin-password
```

### Protection contre la force brute

La connexion par mot de passe contourne l'annuaire : rien ne freinerait des tentatives répétées. Un limiteur compte les échecs sur **deux dimensions**, en fenêtre glissante de 15 minutes :

| Dimension | Seuil | Ce qu'elle arrête |
|-----------|:-----:|-------------------|
| par **adresse IP** | 10 échecs | mille mots de passe essayés sur un compte |
| par **compte visé** | 5 échecs | un même mot de passe essayé sur mille comptes depuis mille IP (*password spraying*) |

Au-delà, l'API répond **`429`** avec un en-tête `Retry-After`, pendant une durée qui **croît avec l'acharnement** : 1 min, puis 5, 15, 30, 60 au maximum. Une **connexion réussie efface le compteur** — un utilisateur légitime ne traîne pas l'historique de ses fautes de frappe.

> Le compteur vit **en mémoire** : il repart à zéro au redémarrage du serveur et ne serait pas partagé entre plusieurs instances. Pour un déploiement à une instance c'est suffisant, et cela évite d'écrire en base à chaque tentative — ce qui offrirait au passage un levier de saturation. À revoir si l'application est répliquée.

### Fermer la connexion de secours (`AUTH_SECOURS`)

Si votre politique l'exige, la voie par mot de passe se ferme entièrement :

```dotenv
AUTH_SECOURS=false
```

Le lien disparaît de `/login`, la page `/login-secours` redirige, et **l'API refuse en `403`** — masquer la page sans fermer l'API n'aurait été que cosmétique.

> 🛡️ **Garde-fou** : la fermeture n'est appliquée **que si le SSO est configuré** (`OIDC_CLIENT_ID` renseigné). Sur une installation sans OIDC, `AUTH_SECOURS=false` est ignoré — sans quoi cette option fermerait la dernière porte et rendrait l'application inaccessible à tous, sans recours depuis l'interface. Une option de durcissement ne doit pas pouvoir se retourner en panne totale.

### Copier le compte de secours vers un autre serveur

C'est précisément ce que permet le choix d'un fichier plutôt qu'une variable : **le même identifiant de secours peut servir sur plusieurs installations**.

```bash
# depuis le serveur qui détient déjà le secret
scp /opt/slowpoke/.secrets/admin-password <autre-serveur>:/opt/slowpoke/.secrets/

# sur le serveur de destination
chown 1001:1001 /opt/slowpoke/.secrets/admin-password
chmod 600 /opt/slowpoke/.secrets/admin-password
docker compose run --rm server /app/seed    # crée le compte AVEC ce mot de passe
```

Le seed lit le fichier existant (priorité n° 3) au lieu d'en engendrer un : les deux installations partagent alors le même compte de secours. Sans cette copie, chaque serveur aurait son propre mot de passe — ce qui fonctionne aussi, mais fait deux secrets à ranger au lieu d'un.

> Transférez ce fichier par un canal sûr (`scp`, coffre d'équipe) — **jamais par Git**, le dossier en est exclu.

Le mot de passe s'affiche **une seule fois** dans un encadré : rangez-le dans le coffre de l'équipe. Rejouer le seed est sans danger — il confirme le rôle admin et **ne réinitialise jamais** le mot de passe d'un compte existant (le remplacer invaliderait celui qui est noté).

**D'où vient le mot de passe**, par ordre de priorité :

| # | Source | Usage |
|---|--------|-------|
| 1 | `SEED_ADMIN_PASSWORD_FILE` | chemin d'un fichier (convention des secrets Docker) |
| 2 | `SEED_ADMIN_PASSWORD` | variable, pour les installations automatisées |
| 3 | `.secrets/admin-password` | fichier local, s'il existe déjà |
| 4 | *engendré aléatoirement* | puis **déposé** dans ce fichier en droits `0600` |

Le fichier prime volontairement sur la variable : une variable se lit dans `docker inspect`, dans la liste des processus et dans les journaux de l'orchestrateur ; un fichier en `0600` non. Et surtout il se **copie**, ce qui permet à deux installations de partager le même identifiant de secours.

L'adresse par défaut est `secours@incidents.local`, modifiable par `SEED_ADMIN_EMAIL`. ⚠️ Si `AUTH_DOMAIN` est défini, l'adresse doit appartenir à ce domaine.

> `.secrets/` est **exclu du dépôt** : ce dossier se recopie d'un environnement à l'autre à la main, jamais par Git.

---

# Partie B — Installation via Docker Compose

Méthode de déploiement de référence. Quatre services (`app`, `server`, `postgres:18-alpine`, `reverse` nginx) définis dans `docker-compose.yml`. Seul `reverse` publie un port — réglable par `REVERSE_PUBLISH` (défaut **`8080`**) → placez votre TLS devant.

## B.1 Prérequis
- Docker + Docker Compose.
- Un **fournisseur d'identité OIDC** (client déclaré, `client_id`/`client_secret`, URL de découverte).
- Un **nom de domaine** public et un reverse proxy TLS devant (voir Partie C pour YunoHost).

## B.2 Fichier `.env`
Créez `.env` à la racine (il est **ignoré par Git**). Variables clés :

```dotenv
# Base de données (le nom est libre : la migration 0004 le résout à l'exécution)
POSTGRES_USER=<user>
POSTGRES_PASSWORD=<mot-de-passe-fort>
POSTGRES_DB=slowpoke
DATABASE_URL=postgresql://<user>:<mot-de-passe-fort>@postgres:5432/slowpoke
READONLY_DATABASE_URL=postgresql://query_builder:<mdp-lecture>@postgres:5432/slowpoke

# API / front
PORT=4000
NUXT_PUBLIC_SERVER_BASE_URL=https://<votre-domaine>
SITE_URL=https://<votre-domaine>
BETTER_AUTH_URL=https://<votre-domaine>
TRUSTED_ORIGINS=https://<votre-domaine>

# SSO OIDC
OIDC_CLIENT_ID=<client-id>
OIDC_CLIENT_SECRET=<client-secret>
OIDC_DISCOVERY_URL=https://<idp>/.well-known/openid-configuration
OIDC_PROVIDER_LABEL=Connexion SSO       # libellé du bouton de connexion (optionnel)
OIDC_ADMIN_GROUP=admins                 # groupe dont les membres sont créés admin (défaut : admins)
OIDC_SCOPES=openid profile email groups # scopes demandés (optionnel)
OIDC_AVATAR_URL_TEMPLATE=               # ex. https://<nuage>/avatar/{id}/512 (optionnel)
AUTH_DOMAIN=<domaine-email>             # optionnel

# Web Push (VAPID) — générer : npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=<clé-publique>
VAPID_PRIVATE_KEY=<clé-privée>

# Port publié par le reverse proxy interne (défaut 8080).
# Accepte « 8076 » ou « 127.0.0.1:8076 » pour n'écouter que sur la boucle locale.
REVERSE_PUBLISH=8080
```

### ⚠️ Étape obligatoire : le mot de passe du rôle `query_builder`

La migration `0004` crée le rôle en lecture seule avec `CREATE USER query_builder WITH LOGIN;` — **sans mot de passe**. Tant que vous ne lui en donnez pas un et que `READONLY_DATABASE_URL` n'est pas renseignée, le **query builder** et les **widgets de statistiques** ne fonctionnent pas (ils passent tous les deux par cette connexion).

À faire **après les migrations** (voir B.3), depuis la racine du déploiement :

```bash
PW="$(openssl rand -hex 24)"
docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"ALTER USER query_builder WITH PASSWORD '$PW';\""
printf 'READONLY_DATABASE_URL=postgresql://query_builder:%s@postgres:5432/slowpoke\n' "$PW" >> .env
unset PW
docker compose up -d server
```

- `openssl rand -hex` ne produit que `0-9a-f` : aucun caractère à échapper dans l'URL.
- L'hôte est **`postgres`** (nom du service Compose), pas `localhost`.
- Le mot de passe posé sur le rôle et celui de `READONLY_DATABASE_URL` doivent rester identiques.

**Symptôme d'un oubli** : `docker compose` affiche `WARN The "READONLY_DATABASE_URL" variable is not set` à chaque commande, et la page *Statistiques → Query Builder* échoue.

Côté IdP, déclarez l'**URL de redirection** de callback vers votre domaine (et, en dev, `http://localhost:4000`). Scopes attendus : `openid profile email groups` — ajustables par `OIDC_SCOPES` si votre fournisseur en demande d'autres. Le groupe nommé par `OIDC_ADMIN_GROUP` doit remonter dans la claim `groups` pour l'attribution automatique du rôle admin.

## B.3 Démarrer
```bash
docker compose up -d --build
docker compose run --rm server /app/migrate    # applique les migrations
mkdir -p .secrets && chown 1001:1001 .secrets && chmod 700 .secrets   # sinon le seed ne peut pas écrire
docker compose run --rm server /app/seed       # compte de secours — NOTEZ le mot de passe affiché (A.6)
# ⚠️ puis l'étape « mot de passe query_builder » ci-dessus (B.2) — sinon stats/query builder KO
docker compose ps                              # les 4 services « healthy »
curl -f http://localhost:8080/health           # => {"status":"ok"}
```

Le premier utilisateur du groupe `admins` qui se connecte devient **admin** et peut attribuer les rôles aux autres (A.2).

## B.4 Développement local
Voir [`Documentation.md`](Documentation.md) § *Développement* (`bun install`, `bun run dev`, base Postgres locale nommée `slowpoke`, `bunx drizzle-kit migrate`).

---

# Partie C — Installation sur YunoHost

> ⚠️ **Il n'existe pas de paquet YunoHost natif** pour Slowpoke. YunoHost sert ici d'**hôte Docker** et de **terminaison TLS / reverse proxy** devant la pile Docker Compose. L'authentification reste celle de l'application (son SSO OIDC) — on **n'utilise pas** le SSO de YunoHost. Les étapes ci-dessous sont à valider sur votre installation.

## C.1 Principe
```
Internet ──HTTPS──> nginx YunoHost (TLS, domaine) ──HTTP──> 127.0.0.1:8080 (nginx interne de la pile) ──> app / server
```

## C.2 Préparer le domaine
Dans l'admin YunoHost (ou en CLI), ajoutez un domaine/sous-domaine dédié et son certificat :
```bash
yunohost domain add <slowpoke.mondomaine.fr>
yunohost domain cert install <slowpoke.mondomaine.fr>   # Let's Encrypt
```

## C.3 Installer Docker et déployer la pile
Sur le serveur YunoHost (Debian) :
```bash
curl -fsSL https://get.docker.com | sh
# déposer le dépôt + .env (Partie B), puis :
cd /opt/slowpoke                       # racine du déploiement
docker compose up -d --build
docker compose run --rm server /app/migrate
```

**Limiter l'exposition** : publiez le reverse proxy **uniquement sur la boucle locale** pour que seul nginx YunoHost y accède. Une ligne dans `.env` suffit, **sans modifier `docker-compose.yml`** :
```dotenv
REVERSE_PUBLISH=127.0.0.1:8080
```
Puis appliquez : `docker compose up -d reverse`.

Dans le `.env`, mettez les URLs publiques sur le domaine YunoHost :
`NUXT_PUBLIC_SERVER_BASE_URL`, `SITE_URL`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS` = `https://<slowpoke.mondomaine.fr>`.

## C.4 Brancher le reverse proxy YunoHost
Ajoutez un fragment nginx pour ce domaine (YunoHost inclut automatiquement les fichiers de `*/conf.d/`) :

```bash
sudoedit /etc/nginx/conf.d/<slowpoke.mondomaine.fr>.d/slowpoke.conf
```
```nginx
location / {
    proxy_pass          http://127.0.0.1:8080;
    proxy_http_version  1.1;
    proxy_set_header    Host              $host;
    proxy_set_header    X-Real-IP         $remote_addr;
    proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header    X-Forwarded-Proto $scheme;
    proxy_set_header    Upgrade           $http_upgrade;   # WebSocket / SSE
    proxy_set_header    Connection        "upgrade";
    client_max_body_size 25m;                               # uploads d'artéfacts
}
```
```bash
nginx -t && systemctl reload nginx
```

## C.5 Accès public (SSOwat)
Slowpoke gère sa propre authentification : le domaine doit être **servi publiquement**, sans interposer le portail SSOwat de YunoHost sur ce sous-domaine (sinon double authentification / blocage). Selon votre configuration YunoHost, assurez-vous que ce domaine n'est pas rattaché à une application YunoHost protégée, ou déclarez son accès public. **À vérifier sur votre instance** avant mise en production.

## C.6 Callback OIDC & vérification
- Déclarez côté IdP l'URL de redirection `https://<slowpoke.mondomaine.fr>` (callback OAuth2).
- Testez : `https://<slowpoke.mondomaine.fr>/health` doit répondre `{"status":"ok"}`, puis la page de connexion doit rediriger vers le SSO.

## C.7 Mises à jour, sauvegardes
La pile reste pilotée par Docker Compose : suivez [`Exploitation-MCO.md`](Exploitation-MCO.md) pour les mises à jour (`git pull` → `build` → `migrate` → `up`), les sauvegardes `pg_dump` du volume Postgres, et la supervision via `/health`. La sauvegarde YunoHost (`yunohost backup`) **ne couvre pas** les volumes Docker : sauvegardez la base séparément.
