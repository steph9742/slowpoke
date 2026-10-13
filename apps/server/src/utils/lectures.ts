import { mainSchema } from '@slowpoke/database/tables'
import { SEVERITY_LEVELS } from '@slowpoke/database/severity'
import { STATUS_LABELS, RESOLUTION_LABELS } from '@slowpoke/database/labels'
import type { Applicabilite } from './conduite'
import { TOUS_FILTRES } from '../models/filtresIncident'

// COMMENT LIRE CE QUE L'API REND — les contresens, écrits noir sur blanc.
//
// Une valeur juste peut être lue de travers, et la lecture naïve est presque toujours la
// fausse : à « a-t-on eu un P1 ? », la réponse rend `severity: "critical"` et le lecteur
// conclut « non » alors que c'est le même niveau.
//
// L'entrée est le COUPLE (champ, valeur), jamais la route : une consigne accrochée à des
// routes déclarées une par une ne vaut que pour celles auxquelles on a pensé.

export type Lecture = {
  /** Identifiant stable, pour désigner une mise en garde sans la recopier. */
  cle: string
  /** Nom du champ tel qu'il apparaît dans la charge utile. */
  champ: string
  /** Valeur concernée, ou `*` quand la mise en garde vaut pour toutes. */
  valeur: string
  /**
   * Deux ou trois mots : ce qu'on écrirait sur une pastille, là où `signifie` est une phrase.
   *
   * Sans ce champ, un lecteur affiche la valeur technique ou tient son propre libellé, et le jour
   * où un état est renommé les deux divergent. Il est dérivé des MÊMES tables que l'interface.
   * Optionnel : les vocabulaires fermés en portent toujours un, les champs ambigus pas tous.
   */
  libelle?: string
  signifie: string
  /** La lecture naïve — celle qu'il faut refuser. C'est la moitié qui fait le travail. */
  neSignifiePas: string
  /** Ce qu'une réponse doit dire, ou s'abstenir de dire. */
  consequence: string
  /** Où la situation se corrige, quand elle se corrige. */
  ouCorriger: string
}

type ValeurSeverite = (typeof mainSchema.incidentSeverity.enumValues)[number]
type ValeurStatut = (typeof mainSchema.incidentStatus.enumValues)[number]

const PAR_VALEUR = new Map(SEVERITY_LEVELS.map(n => [n.value, n]))

/** Textes dérivés de la table de correspondance : la garder à jour ici suffit. */
function lectureSeverite(v: ValeurSeverite): Lecture {
  const n = PAR_VALEUR.get(v)!
  return {
    cle: `severite-${n.code.toLowerCase()}`,
    champ: 'severity',
    valeur: v,
    libelle: `${n.code} — ${n.label}`,
    signifie: `Niveau ${n.code} — ${n.label}. « ${n.code} » et « ${v} » désignent le MÊME niveau, dans deux écritures.`,
    neSignifiePas: `Un niveau autre que ${n.code}. Répondre « pas de ${n.code} » devant un incident portant « ${v} » est un contresens : c'en est un.`,
    consequence: `Une question posée sur « ${n.code} » appelle OUI devant « ${v} ». Les deux écritures sont acceptées en filtre : \`severity=${n.code}\` et \`severity=${v}\` rendent le même ensemble.`,
    ouCorriger: 'Rien à corriger : les deux écritures sont valides et équivalentes.',
  }
}

// Record exhaustif, et non tableau : ajouter une valeur à l'enum `incident_severity` sans
// dire comment la lire ne compile plus. C'est la garantie qui empêche cette liste de
// prendre du retard sur le code.
const SEVERITE: Record<ValeurSeverite, Lecture> = {
  low: lectureSeverite('low'),
  medium: lectureSeverite('medium'),
  high: lectureSeverite('high'),
  critical: lectureSeverite('critical'),
}

const STATUT: Record<ValeurStatut, Lecture> = {
  open: {
    cle: 'statut-open', champ: 'status', valeur: 'open',
    signifie: "Incident déclaré, pas encore pris en main.",
    neSignifiePas: "Un incident négligé : un incident très récent est normalement `open`.",
    consequence: "Ne pas présenter comme un retard sans regarder `createdAt`.",
    ouCorriger: "Onglet Conduite de l'incident.",
  },
  investigating: {
    cle: 'statut-investigating', champ: 'status', valeur: 'investigating',
    signifie: "Analyse en cours, nature et portée non encore établies.",
    neSignifiePas: "Que l'incident est confirmé : la qualification est justement ce qui est en cours.",
    consequence: "Ne pas compter dans les incidents avérés ; `resolution` n'est pas encore fiable.",
    ouCorriger: "Onglet Conduite de l'incident.",
  },
  in_progress: {
    cle: 'statut-in-progress', champ: 'status', valeur: 'in_progress',
    signifie: "Traitement engagé, mesures en cours d'application.",
    neSignifiePas: "Que la menace est écartée.",
    consequence: "Compter parmi les incidents actifs.",
    ouCorriger: "Onglet Conduite de l'incident.",
  },
  surveillance: {
    cle: 'statut-surveillance', champ: 'status', valeur: 'surveillance',
    signifie: "Traité, mais gardé à l'œil un temps donné.",
    neSignifiePas: "Ni ouvert ni clos. C'est un état distinct, créé pour ne pas avoir à choisir entre les deux.",
    consequence: "Ne pas ranger avec les incidents ouverts, ni avec les clos, sans le dire.",
    ouCorriger: "Onglet Conduite de l'incident.",
  },
  resolved: {
    cle: 'statut-resolved', champ: 'status', valeur: 'resolved',
    signifie: "Incident résolu ; le dossier peut rester à compléter.",
    neSignifiePas: "Que les obligations réglementaires ont été remplies — voir `court` et `deposeLe`.",
    consequence: "Un incident résolu peut porter une déclaration NIS 2 encore due.",
    ouCorriger: "Onglet Conduite de l'incident.",
  },
  closed: {
    cle: 'statut-closed', champ: 'status', valeur: 'closed',
    signifie: "Dossier clos.",
    neSignifiePas: "Que rien n'en découle : les listes blanches posées à cette occasion continuent de courir.",
    consequence: "Vérifier les exclusions rattachées avant de conclure qu'il ne reste rien.",
    ouCorriger: "Onglet Conduite de l'incident.",
  },
}

type ValeurResolution = (typeof mainSchema.incidentResolution.enumValues)[number]

// Les six résolutions. `resolution` manquait à cette liste alors que c'est le champ sur
// lequel un lecteur extérieur conclut — « bénin », « faux positif » : des mots qui ressemblent
// et n'appellent pas les mêmes suites. Même garantie que pour la gravité et le statut.
const RESOLUTION: Record<ValeurResolution, Lecture> = {
    true_positive: {
        cle: 'resolution-vrai-positif', champ: 'resolution', valeur: 'true_positive',
        signifie: "Menace réelle et avérée, traitée.",
        neSignifiePas: "Que l'incident est clos : la résolution se pose en vue de la clôture, mais le dossier peut rester ouvert le temps des suites.",
        consequence: "Compter dans les incidents avérés.",
        ouCorriger: "Fiche de l'incident, champ Résolution.",
    },
    risk_accepted: {
        cle: 'resolution-risque-assume', champ: 'resolution', valeur: 'risk_accepted',
        signifie: "L'incident est réel et n'a PAS été corrigé : le risque est assumé, et c'est cette décision qui est tracée.",
        neSignifiePas: "Un incident traité. Rien n'a été réparé — la différence avec `true_positive` est tout l'intérêt de cette valeur.",
        consequence: "Compter dans les incidents avérés, jamais dans les incidents résolus. Un rapport qui fond les deux efface une décision de pilotage.",
        ouCorriger: "Fiche de l'incident, champ Résolution.",
    },
    false_positive: {
        cle: 'resolution-faux-positif', champ: 'resolution', valeur: 'false_positive',
        signifie: "L'outil s'est trompé : il n'y avait rien.",
        neSignifiePas: "Un incident réel mais sans gravité — c'est `benign`. Ici, c'est la DÉTECTION qui était fausse.",
        consequence: "Ne pas compter dans les incidents avérés. Un volume qui monte désigne une règle de détection à corriger, pas une menace qui croît.",
        ouCorriger: "Fiche de l'incident, champ Résolution ; la règle se corrige dans l'outil de détection.",
    },
    benign: {
        cle: 'resolution-benin', champ: 'resolution', valeur: 'benign',
        signifie: "Activité réelle, mais sans conséquence.",
        neSignifiePas: "Un faux positif : la détection avait raison, c'est l'impact qui est nul. Les additionner masquerait la correction que l'un appelle et l'autre non.",
        consequence: "Compter comme réel et sans suite.",
        ouCorriger: "Fiche de l'incident, champ Résolution.",
    },
    legitimate: {
        cle: 'resolution-legitime', champ: 'resolution', valeur: 'legitimate',
        signifie: "Activité réelle, voulue et autorisée.",
        neSignifiePas: "Qu'il n'y a rien à faire : classer « légitime », c'est décider de ne plus voir quelque chose, et cette décision doit être consignée en liste blanche.",
        consequence: "Vérifier qu'une exclusion existe (`GET /api/exclusions?incidentId=…`). Un incident clos « légitime » sans exclusion est un angle mort qui n'est inventorié nulle part.",
        ouCorriger: "Fiche de l'incident : champ Résolution, puis « Déclarer une liste blanche ».",
    },
    duplicate: {
        cle: 'resolution-doublon', champ: 'resolution', valeur: 'duplicate',
        signifie: "Le même fait, déjà traité dans un autre incident.",
        neSignifiePas: "Un incident à ignorer : l'événement a bien eu lieu, il est compté une fois ailleurs.",
        consequence: "Exclure des décomptes pour ne pas compter deux fois le même événement ; l'incident d'origine porte le traitement.",
        ouCorriger: "Fiche de l'incident, champ Résolution.",
    },
}

/** Libellés courts de l'applicabilité. Les trois seules valeurs du type. */
const LIBELLE_APPLICABILITE: Record<Applicabilite, string> = {
    applicable: 'Applicable',
    a_evaluer: 'À évaluer',
    non_applicable: 'Non applicable',
}

// Les trois états d'applicabilité. Même garantie : le type `Applicabilite` gouverne.
const APPLICABILITE: Record<Applicabilite, Lecture> = {
  applicable: {
    cle: 'applicabilite-applicable', champ: 'defaut', valeur: 'applicable',
    signifie: "La grille prévoit ce compteur pour ce niveau, avant toute décision humaine.",
    neSignifiePas: "Qu'un humain l'a décidé. La décision est dans `applicable`, avec `decidePar`.",
    consequence: "Ne jamais fusionner `defaut` et `applicable` : « la grille dit oui » et « quelqu'un a tranché oui » sont deux faits différents, et c'est la différence qu'un dossier doit montrer.",
    ouCorriger: "Onglet Conduite de l'incident, carte du compteur.",
  },
  a_evaluer: {
    cle: 'applicabilite-a-evaluer', champ: 'defaut', valeur: 'a_evaluer',
    signifie: "Personne n'a encore tranché l'applicabilité de ce compteur.",
    neSignifiePas: "Un « non ». Ce n'est pas non plus un demi-oui : c'est une décision que Slowpoke ne peut pas prendre à la place du RSSI.",
    consequence: "Ne pas compter comme non applicable, ni comme en règle. Aucun délai ne court tant que la décision n'est pas enregistrée.",
    ouCorriger: "Onglet Conduite de l'incident, carte du compteur.",
  },
  non_applicable: {
    cle: 'applicabilite-non-applicable', champ: 'defaut', valeur: 'non_applicable',
    signifie: "La grille écarte ce compteur pour ce niveau.",
    neSignifiePas: "Que la question a été examinée par quelqu'un.",
    consequence: "Reste réversible : un RSSI peut déclarer le compteur applicable malgré le défaut.",
    ouCorriger: "Onglet Conduite de l'incident, carte du compteur.",
  },
}

// CHAMPS AMBIGUS — sans garantie de complétude, et il faut le dire.
//
// Le compilateur impose que toute VALEUR d'un vocabulaire fermé soit expliquée, mais rien ne
// relie un CHAMP nouvellement ajouté à cette liste. Cette moitié se tient à la main, et
// `garantie: false` l'annonce.
const CHAMPS: Lecture[] = [
  {
    cle: 'decision-absente', champ: 'applicable', valeur: 'null',
    libelle: 'Non tranché',
    signifie: "Aucune décision enregistrée pour ce compteur.",
    neSignifiePas: "Non applicable. `null` est l'absence de décision, pas une décision négative.",
    consequence: "Un compteur à `null` n'est ni en règle ni en faute : il attend quelqu'un.",
    ouCorriger: "Onglet Conduite de l'incident.",
  },
  {
    cle: 'compteur-ne-court-pas', champ: 'court', valeur: 'false',
    libelle: 'Compteur arrêté',
    signifie: "Ce compteur n'est pas à surveiller : soit il n'est pas applicable, soit la déclaration a été déposée.",
    neSignifiePas: "Un retard, même quand les heures restantes sont négatives. Un jalon déposé cesse de courir.",
    consequence: "C'est `court` qui dit s'il faut surveiller, jamais le signe de `heuresRestantes`. Afficher du rouge sur un devoir accompli use l'attention due aux vrais retards.",
    ouCorriger: "Onglet Conduite de l'incident, « Enregistrer le dépôt ».",
  },
  {
    cle: 'connaissance-approximative', champ: 'knowledgeEstimated', valeur: 'true',
    libelle: 'Date estimée',
    signifie: "La date de prise de connaissance est une approximation.",
    neSignifiePas: "Que l'échéance calculée dessus est ferme. Tous les délais réglementaires en découlent.",
    consequence: "Toute échéance citée à partir de cet incident doit être présentée comme approximative.",
    ouCorriger: "Fiche de l'incident, date de connaissance.",
  },
  {
    cle: 'regle-disparue', champ: 'presente', valeur: 'false',
    libelle: 'Règle disparue',
    signifie: "La règle était absente de l'EDR au dernier relevé.",
    neSignifiePas: "Qu'elle a été retirée volontairement, ni que le relevé est à jour — voir `etat`.",
    consequence: "Une règle absente ne s'applique plus. Si une exclusion y est encore appariée, la détection est revenue sans que personne ne l'ait décidé.",
    ouCorriger: "Écran Listes blanches.",
  },
  {
    cle: 'regle-non-appariee', champ: 'exclusion', valeur: 'null',
    libelle: 'Non appariée',
    signifie: "Cette règle de l'EDR n'est appariée à aucune exclusion consignée.",
    neSignifiePas: "Qu'elle est illégitime. La plupart des règles sont fournies avec le produit — voir `fourniParEditeur`.",
    consequence: "Ne compter comme écart que les règles non fournies par l'éditeur.",
    ouCorriger: "Écran Listes blanches, appariement.",
  },
  {
    cle: 'etiquettes-inexistantes', champ: 'champTags', valeur: 'null',
    signifie: "L'API de l'EDR n'expose aucun champ d'étiquettes sur cette règle.",
    neSignifiePas: "Que la règle n'a pas d'étiquettes : la question ne peut pas être posée à l'outil.",
    consequence: "Ne bâtir aucun tri sur les étiquettes. Le tri disponible est l'origine, `fourniParEditeur`.",
    ouCorriger: "Rien à corriger côté Slowpoke : la donnée n'existe pas à la source.",
  },
  {
    cle: 'version-non-verifiable', champ: 'version', valeur: 'inconnue',
    signifie: "L'image a été construite sans l'argument `GIT_COMMIT`.",
    neSignifiePas: "Une version ancienne. La version n'est pas VÉRIFIABLE, ce qui est différent d'obsolète.",
    consequence: "Ne pas conclure qu'un correctif manque. Comparer `construitLe`, qui s'ordonne, plutôt que deux abrégés de commit qui ne s'ordonnent pas.",
    ouCorriger: "Reconstruire l'image en passant `GIT_COMMIT` et `BUILD_DATE`.",
  },
  {
    cle: 'url-relative', champ: 'urlAbsolue', valeur: '/incidents/…',
    signifie: "Aucune origine publique n'est déclarée côté serveur : le chemin relatif est rendu tel quel.",
    neSignifiePas: "Une adresse à compléter en devinant l'hôte. Une adresse reconstituée serait fausse derrière le proxy.",
    consequence: "Citer sans lien plutôt que fabriquer un lien faux.",
    ouCorriger: "Renseigner `PUBLIC_APP_URL` ou `TRUSTED_ORIGINS` côté serveur.",
  },
  {
    cle: 'connaissance-non-estimee', champ: 'knowledgeEstimated', valeur: 'false',
    signifie: "Le champ n'a pas été mis à `true`. Il est FACULTATIF à la création et vaut `false` par défaut.",
    neSignifiePas: "Que la date a été constatée. Un incident où personne ne s'est posé la question porte la même valeur qu'un incident où la date est certaine — les deux sont indistinguables.",
    consequence: "`false` n'atteste de rien. Ne jamais présenter une échéance comme ferme sur ce seul fondement : c'est `knowledgeAt` qui arme les compteurs NIS 2, CNIL et CERT, et une date estimée ne se présente pas comme constatée.",
    ouCorriger: "Fiche de l'incident, date de connaissance et sa case « estimée ».",
  },
  {
    cle: 'connaissance-absente', champ: 'knowledgeAt', valeur: 'null',
    libelle: 'Date de connaissance absente',
    signifie: "Aucune date de prise de connaissance enregistrée. Le cas ne survient que sur d'anciens incidents : la date est obligatoire à la création depuis.",
    neSignifiePas: "Que l'incident est hors délai, ni qu'il est dans les temps.",
    consequence: "Aucun compteur réglementaire ne peut être calculé : ils partent tous de cette date. Le dire, plutôt que de rendre une échéance depuis `createdAt`, qui daterait la SAISIE et non la connaissance.",
    ouCorriger: "Fiche de l'incident, date de connaissance.",
  },
  {
    cle: 'sans-pilote', champ: 'pilot', valeur: 'null',
    libelle: 'Sans pilote',
    signifie: "Personne n'a pris cet incident en charge. C'est un FAIT enregistré, pas un champ laissé vide : la prise en charge est toujours explicite, jamais déduite d'un changement de statut.",
    neSignifiePas: "Que le champ n'est pas alimenté. Slowpoke filtre là-dessus — « qu'est-ce qui n'est suivi par personne » est la question la plus posée à la base.",
    consequence: "Un incident en cours sans pilote est un incident que personne ne suit ; sur un P1, c'est à signaler en propre. Déclarer un incident n'est pas le prendre en charge : `createdBy` ne répond pas à cette question.",
    ouCorriger: "Fiche de l'incident, « Prendre en charge ».",
  },
  {
    cle: 'preneur-inconnu', champ: 'takenOverBy', valeur: 'null',
    signifie: "Nul n'est enregistré comme ayant effectué la prise en charge.",
    neSignifiePas: "Qu'il n'y a pas de pilote : c'est `pilot` qui le dit. `takenOverBy` distingue QUI a agi — un administrateur peut attribuer l'incident à quelqu'un d'autre.",
    consequence: "Pour savoir si un incident est suivi, lire `pilot`. `takenOverBy` sert à retracer l'attribution, pas à établir le suivi.",
    ouCorriger: "Fiche de l'incident, prise en charge.",
  },
  {
    cle: 'titre-inexistant', champ: 'titre', valeur: 'absent',
    signifie: "Slowpoke n'a pas de champ titre. `description` est le seul texte libre, et il tient ce rôle.",
    neSignifiePas: "Qu'il manque une donnée à aller chercher ailleurs : le champ n'existe pas dans le modèle.",
    consequence: "Pour un intitulé court, composer `id`, `niveau` et `type` — tous trois présents et normalisés — plutôt que de tronquer `description` à une longueur arbitraire, qui coupe au milieu d'une phrase et varie d'un lecteur à l'autre.",
    ouCorriger: "Sans objet aujourd'hui.",
  },
  {
    cle: 'machine-hors-inventaire', champ: 'glpiId', valeur: 'null',
    libelle: 'Hors inventaire',
    signifie: "Machine saisie librement, sans correspondance dans l'inventaire GLPI.",
    neSignifiePas: "Une machine sans enjeu. Son entité, son groupe et sa criticité sont inconnus, pas nuls.",
    consequence: "Ne pas conclure qu'aucune machine critique n'est touchée : la question ne peut pas être tranchée pour celle-ci.",
    ouCorriger: "Onglet Machines de l'incident, rattacher la fiche d'inventaire.",
  },
  {
    cle: 'composante-sans-code', champ: 'composanteCode', valeur: 'null',
    signifie: "La saisie ne contenait aucun code `cmp[iag]-NNN`, ou la personne n'a pas de composante renseignée.",
    neSignifiePas: "Que la personne n'appartient à aucune composante. La saisie est libre, et six écritures coexistent.",
    consequence: "Ces lignes ne sont réparties sur aucune composante. Un décompte par composante les omet : le citer sans mentionner `sansComposante` surestimerait la couverture.",
    ouCorriger: "Onglet Personnes de l'incident, champ Composante.",
  },
  {
    cle: 'entite-non-resolue', champ: 'entitesNonResolues', valeur: '(liste non vide)',
    signifie: "Ces entités d'inventaire ne sont rattachées à aucune composante par la table de correspondance.",
    neSignifiePas: "Forcément une anomalie : les laboratoires et les directions internes n'ont légitimement pas de composante. Mais une entité NOUVELLE ou RENOMMÉE dans GLPI y apparaît aussi.",
    consequence: "Une composante dont le décompte baisse sans raison a peut-être été renommée dans l'inventaire : la chercher ici avant de conclure à une baisse réelle des incidents.",
    ouCorriger: "Déclarer l'entité dans `packages/database/src/composantes.ts` si elle relève d'une composante.",
  },
  {
    cle: 'composante-hors-perimetre', champ: 'sansComposante', valeur: '(nombre)',
    signifie: "Incidents rattachés à aucune composante : laboratoires, directions internes, ou saisie absente.",
    neSignifiePas: "Une erreur de données. Les laboratoires et les directions internes n'ONT PAS de code de composante — leur en attribuer un inventerait un rattachement.",
    consequence: "Ne jamais répartir ce nombre sur les autres composantes, ni le passer sous silence : il représente une part réelle du parc.",
    ouCorriger: "Sans objet : c'est une catégorie légitime.",
  },
  {
    cle: 'periode-exclut-sans-connaissance', champ: 'depuis', valeur: '(borne posée)',
    signifie: "Le filtre porte sur `knowledgeAt`. Les incidents dont cette date est nulle sont donc HORS du résultat, silencieusement.",
    neSignifiePas: "Que le total borné couvre tous les incidents de la période. Il couvre ceux dont la date de connaissance est renseignée.",
    consequence: "Un décompte mensuel peut être inférieur à la réalité. Le vérifier en comparant avec `GET /api/incidents/count` sans bornes, ou signaler la réserve.",
    ouCorriger: "Fiche des incidents concernés, renseigner la date de connaissance.",
  },
  {
    cle: 'periode-sur-connaissance', champ: 'depuis', valeur: '(sémantique)',
    signifie: "La borne porte sur ce que l'établissement a SU, jamais sur la date de saisie.",
    neSignifiePas: "Une borne sur `createdAt`. Un incident de mars enregistré en avril appartient à mars.",
    consequence: "« Combien d'incidents ce mois-ci » se répond sur cette base, la même que celle d'où partent les délais réglementaires — deux comptes sur deux dates ne se recouperaient pas.",
    ouCorriger: "Sans objet : c'est la sémantique du filtre.",
  },
  {
    cle: 'registre-exclusions-vide', champ: 'exclusions', valeur: '[] (vide)',
    signifie: "Aucune exclusion n'est consignée. C'est un FAIT : les exclusions se saisissent à la main depuis un incident, aucun connecteur ne les écrit. Un registre vide ne peut donc pas venir d'une panne d'alimentation.",
    neSignifiePas: "Qu'aucune liste blanche n'existe dans l'EDR. Les deux registres sont distincts : au dernier relevé, 4 797 règles existaient dans l'outil pour zéro exclusion consignée.",
    consequence: "Dire « aucune exclusion consignée », jamais « aucune liste blanche ». Pour savoir s'il MANQUE des exclusions, il faut le relevé de l'EDR : voir `releveEdr` sur `/api/exclusions/registre`.",
    ouCorriger: "Onglet Exclusions d'un incident, ou écran Listes blanches pour apparier une règle existante.",
  },
  {
    cle: 'releve-edr-absent', champ: 'releveEdr', valeur: 'null',
    signifie: "Le connecteur EDR n'a jamais abouti : aucun relevé de règles n'existe.",
    neSignifiePas: "Que l'EDR ne comporte aucune règle. La question n'a pas été posée à l'outil.",
    consequence: "L'écart entre les règles de l'EDR et les exclusions consignées n'est PAS CALCULABLE. Ne pas conclure à la conformité du registre, ni à son insuffisance.",
    ouCorriger: "Paramètres → EDR, vérifier la configuration et relancer la synchronisation.",
  },
  {
    cle: 'machines-absentes', champ: 'machines', valeur: 'undefined',
    signifie: "Les machines n'ont pas été demandées : ajouter `avecMachines=true`.",
    neSignifiePas: "Qu'aucune machine n'est rattachée. Un tableau vide, lui, signifie bien aucune.",
    consequence: "Ne rien conclure sur le parc sans avoir demandé les machines.",
    ouCorriger: "Sans objet : c'est un paramètre d'appel.",
  },
  {
    cle: 'incident-archive', champ: 'archiveLe', valeur: '(date)',
    libelle: 'Archivé',
    signifie: "L'incident est archivé : il ne figure plus dans les listes, les décomptes ni les statistiques.",
    neSignifiePas: "Qu'il a été supprimé, ni qu'il n'a pas eu lieu. Son dossier est conservé intact et se consulte par son identifiant.",
    consequence: "Un total ou une statistique n'inclut pas les incidents archivés. Pour un historique exhaustif, le dire, ou interroger les incidents concernés par leur identifiant.",
    ouCorriger: "Un administrateur peut désarchiver l'incident.",
  },
  {
    cle: 'total-vs-page', champ: 'total', valeur: '*',
    signifie: "Total des incidents correspondant aux filtres, indépendant de la pagination.",
    neSignifiePas: "Le nombre de lignes reçues. Compter `resultats` donne la taille de la page, jamais le total.",
    consequence: "Citer `total`, jamais la longueur du tableau.",
    ouCorriger: "Sans objet.",
  },
]

/** Tout le catalogue, à plat. L'appelant applique par couple (champ, valeur). */
export const LECTURES: Lecture[] = [
  ...Object.values(SEVERITE),
  // Libellés tirés des mêmes tables que l'interface : une valeur renommée l'est partout, ou
  // nulle part. Les recopier ici aurait reconstitué exactement la divergence qu'on évite.
  ...Object.entries(STATUT).map(([v, l]) => ({ ...l, libelle: STATUS_LABELS[v as ValeurStatut] })),
  ...Object.entries(RESOLUTION).map(([v, l]) => ({ ...l, libelle: RESOLUTION_LABELS[v as ValeurResolution] })),
  ...Object.entries(APPLICABILITE).map(([v, l]) => ({ ...l, libelle: LIBELLE_APPLICABILITE[v as Applicabilite] })),
  {
    cle: 'resolution-absente', champ: 'resolution', valeur: 'null',
    libelle: 'Résolution non posée',
    signifie: "La cellule n'a posé aucune résolution. Sur un incident clos, c'est fréquent quand le SOC a clos son ticket pour un motif qui ne conclut rien chez nous — voir `motif_cloture_soc` dans les métadonnées.",
    neSignifiePas: "Un incident bénin. Un ticket clos « sans risque de sécurité » peut l'être parce que la machine a été ÉTEINTE : l'incident était réel, c'est sa source qui a disparu.",
    consequence: "Ne jamais déduire la résolution du motif du SOC, ni compter ces incidents comme bénins. Les présenter comme « clos, résolution non posée ».",
    ouCorriger: "Fiche de l'incident, champ Résolution.",
  },
  ...CHAMPS,
]

// LES FILTRES, PUBLIÉS PLUTÔT QUE DÉCOUVERTS.
//
// Un appelant qui ignore qu'un filtre existe rapatrie tout et trie lui-même, ou renonce.
//
// Les vocabulaires sont DÉRIVÉS des énumérations : ajouter une valeur l'expose ici sans que
// personne y pense, et la liste publiée ne peut pas s'écarter de celle qu'accepte le serveur.

export type NatureFiltre = 'vocabulaire' | 'referentiel' | 'booleen' | 'nombre' | 'texte' | 'date'

export type Filtre = {
  champ: string
  nature: NatureFiltre
  /** Valeurs admises, pour un vocabulaire fermé. Dérivées de l'énumération. */
  valeurs?: string[]
  /** Où obtenir les identifiants valides, pour un référentiel. */
  pointEntree?: string
  description: string
}

export type CatalogueFiltrable = {
  routes: string[]
  description: string
  filtres: Filtre[]
  commentCroiser: string
  neJamaisFaire: string[]
}

/**
 * Filtres DÉRIVÉS d'un schéma de requête TypeBox.
 *
 * La source de vérité est le schéma que la route valide. Publier une liste tenue à part
 * décrirait une API voisine de la vraie ; ajouter un filtre au schéma le publie sans y penser.
 */
function filtresDuSchema(schema: unknown, descriptions: Record<string, string> = {}): Filtre[] {
  const props = (schema as { properties?: Record<string, Record<string, unknown>> }).properties ?? {}
  return Object.entries(props).map(([champ, brut]) => {
    // `t.Optional` enveloppe : la forme utile est dessous.
    const d = (brut.anyOf ? brut : brut) as Record<string, unknown>
    const branches = d.anyOf as { const?: string, type?: string }[] | undefined
    const litteraux = branches?.map(b => b.const).filter((v): v is string => typeof v === 'string')

    const description = (d.description as string | undefined) ?? descriptions[champ] ?? ''

    if (litteraux?.length) {
      return { champ, nature: 'vocabulaire' as const, valeurs: litteraux, description }
    }
    if (champ in REFERENTIELS) {
      return { champ, nature: 'referentiel' as const, pointEntree: REFERENTIELS[champ]!, description }
    }
    const type = d.type as string | undefined
    const nature: NatureFiltre = type === 'boolean'
      ? 'booleen'
      : type === 'number' || type === 'integer'
        ? 'nombre'
        : /^(depuis|jusqua|.*Avant|.*Apres)$/.test(champ)
          ? 'date'
          : 'texte'
    return { champ, nature, description }
  })
}

/** Champs dont la valeur est un identifiant : dire OÙ l'obtenir évite de le deviner. */
const REFERENTIELS: Record<string, string> = {
  incidentId: 'GET /api/incidents/liste',
  glpiId: 'GET /api/incidents/{id}/machines',
}

export const FILTRES: CatalogueFiltrable[] = [
  {
    routes: ['GET /api/incidents', 'GET /api/incidents/liste', 'GET /api/incidents/count'],
    description: "Les incidents. Un seul filtre sert les trois routes : le total du décompte porte donc exactement sur ce que la liste montre. `avecMachines` n'existe que sur `/liste`.",
    filtres: filtresDuSchema(TOUS_FILTRES),
    commentCroiser: "Tous les filtres se combinent par ET. « Les faux positifs de type phishing en août » : `type=phishing&resolution=false_positive&depuis=2026-08-01&jusqua=2026-08-31`. Pour un décompte seul, `/count` avec les mêmes paramètres : il ne rapatrie aucune ligne. Pour compter ET montrer, `/liste`, qui rend le total dans le même appel.",
    neJamaisFaire: [
      "Compter la longueur du tableau reçu : c'est la taille de la page. Le total est dans `/count` ou dans `total` de `/liste`.",
      "Présenter un décompte borné comme exhaustif sans réserve : un incident dont `knowledgeAt` est nul en sort silencieusement.",
      "Prendre `sort=updatedAt` — le défaut — pour l'ordre de signalement : c'est celui des dernières MODIFICATIONS. Employer `createdAt`, ou `knowledgeAt` pour l'ordre réglementaire.",
      "Conclure « pas de P1 » devant `severity: \"critical\"` : c'est le même niveau. `niveau` est rendu à côté, pour n'avoir plus à y penser.",
    ],
  },
  {
    routes: ['GET /api/echeances'],
    description: "Les cinq compteurs réglementaires de tous les incidents, pour un registre de conformité.",
    filtres: [
      { champ: 'depuis', nature: 'date', description: "Ne retenir que les incidents connus à partir de cette date (ISO 8601)." },
      { champ: 'limit', nature: 'nombre', description: "Taille de page, 200 par défaut, 1000 au plus." },
      { champ: 'offset', nature: 'nombre', description: "Décalage de pagination." },
    ],
    commentCroiser: "Se croise avec les incidents par `incidentId`. Deux appels suffisent à « quels P1 ce mois-ci, et où en sont les déclarations » : la liste bornée, puis les compteurs. Ne pas interroger incident par incident.",
    neJamaisFaire: [
      "Traiter un compteur absent du tableau comme non applicable : les cinq sont toujours rendus, `applicable: null` compris.",
      "Fusionner `defaut` et `applicable` : la grille et la décision humaine sont deux faits distincts, et c'est la différence qu'un dossier doit montrer.",
      "Lire un `heuresRestantes` négatif comme un retard sans regarder `court` : un jalon déposé cesse de courir.",
    ],
  },
  {
    routes: ['GET /api/exclusions', 'GET /api/exclusions/registre'],
    description: "Les exclusions consignées par la cellule, chacune rattachée à l'incident qui la justifie.",
    filtres: [
      { champ: 'state', nature: 'vocabulaire', valeurs: ['active', 'revoquee'], description: "État de l'exclusion." },
      { champ: 'incidentId', nature: 'referentiel', pointEntree: 'GET /api/incidents/liste', description: "Identifiant d'incident." },
      { champ: 'overdue', nature: 'booleen', description: "Ne retenir que les actives dont la date de revue est dépassée." },
    ],
    commentCroiser: "`/registre` rend en plus le décompte et le témoin du relevé EDR : l'employer quand la question porte sur le VOLUME ou sur la fiabilité, `/` quand elle porte sur le contenu.",
    neJamaisFaire: [
      "Lire un registre vide comme une panne : aucun connecteur n'écrit ici, les exclusions se saisissent à la main. Un registre vide est un fait.",
      "Dire « aucune liste blanche » devant zéro exclusion : au dernier relevé, 4 797 règles existaient dans l'EDR pour zéro exclusion consignée.",
    ],
  },
  {
    routes: ['GET /api/harfanglab/regles'],
    description: "L'inventaire complet des règles de liste blanche de l'EDR, sans filtre — règles de l'éditeur et règles disparues comprises.",
    filtres: [
      { champ: 'limit', nature: 'nombre', description: "Taille de page, 200 par défaut, 1000 au plus." },
      { champ: 'offset', nature: 'nombre', description: "Décalage de pagination." },
    ],
    commentCroiser: "Chaque règle porte `exclusion`, l'appariement décidé dans Slowpoke. C'est ce jugement qu'il faut importer, jamais le recalculer : deux heuristiques donneraient deux réponses et personne n'arbitrerait.",
    neJamaisFaire: [
      "Compter les règles sans distinguer `fourniParEditeur` : la quasi-totalité vient du produit, le travail de la cellule s'y noie.",
      "Bâtir un tri sur les étiquettes : aucun champ d'étiquettes n'existe dans l'API de l'EDR, `champTags` vaut `null` partout.",
    ],
  },
]
