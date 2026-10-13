// CONDUITE À TENIR — quelle procédure s'applique, et quels compteurs courent.
//
// Tout est déterministe : choisir une checklist d'après un type et compter des heures depuis
// une date sont des opérations exactes, sur des obligations qui ne se rattrapent pas.
//
// La procédure retenue et l'applicabilité de chaque compteur sont AFFICHÉES et modifiables :
// Slowpoke ne sait pas si un compte est critique, ni si des données personnelles sont en jeu.

type TypeIncident = 'phishing' | 'malware' | 'ransomware' | 'data_breach' | 'ddos' | 'network_intrusion' | 'other'
type Severite = 'low' | 'medium' | 'high' | 'critical'

/** Gravité Slowpoke → niveau P du corpus. Même échelle, autre écriture. */
export const NIVEAU_P: Record<Severite, string> = {
    critical: 'P1', high: 'P2', medium: 'P3', low: 'P4',
}

export type Procedure = { fiche: string, checklist: string, motif: string }

const PAR_TYPE: Record<Exclude<TypeIncident, 'phishing'>, { fiche: string, checklist: string }> = {
    ransomware: { fiche: 'INC-03', checklist: 'INC-03-CL' },
    malware: { fiche: 'INC-04', checklist: 'INC-04-CL' },
    ddos: { fiche: 'INC-05', checklist: 'INC-05-CL' },
    data_breach: { fiche: 'INC-06', checklist: 'INC-06-CL' },
    network_intrusion: { fiche: 'INC-07', checklist: 'INC-07-CL' },
    other: { fiche: 'INC-08', checklist: 'INC-08-CL' },
}

/** Le phishing n'a pas de fiche à lui : ce qui compte est ce qu'il produit — compte compromis
 *  pour un cas isolé, campagne pour plusieurs comptes, compte critique pour un compte à
 *  privilèges, que la gravité approche sans la décider. */
export function procedurePour(
    incident: { type: string, severity: string },
    nbUtilisateurs: number,
): Procedure {
    if (incident.type === 'phishing') {
        if (nbUtilisateurs > 1) {
            return { fiche: 'INC-09', checklist: 'INC-09-CL', motif: `Campagne — ${nbUtilisateurs} comptes concernés.` }
        }
        if (incident.severity === 'critical' || incident.severity === 'high') {
            return { fiche: 'INC-02', checklist: 'INC-02-CL', motif: `Gravité ${NIVEAU_P[incident.severity as Severite]} — traité comme compte critique.` }
        }
        return { fiche: 'INC-01', checklist: 'INC-01-CL', motif: 'Compte compromis isolé.' }
    }

    const p = PAR_TYPE[incident.type as Exclude<TypeIncident, 'phishing'>] ?? PAR_TYPE.other
    return { ...p, motif: `Type « ${incident.type} ».` }
}

export const TOUTES_PROCEDURES: Procedure[] = [
    { fiche: 'INC-01', checklist: 'INC-01-CL', motif: 'Compte compromis' },
    { fiche: 'INC-02', checklist: 'INC-02-CL', motif: 'Compte critique ou multiple' },
    { fiche: 'INC-03', checklist: 'INC-03-CL', motif: 'Ransomware' },
    { fiche: 'INC-04', checklist: 'INC-04-CL', motif: 'Malware' },
    { fiche: 'INC-05', checklist: 'INC-05-CL', motif: 'Déni de service' },
    { fiche: 'INC-06', checklist: 'INC-06-CL', motif: 'Fuite de données' },
    { fiche: 'INC-07', checklist: 'INC-07-CL', motif: 'Intrusion réseau' },
    { fiche: 'INC-08', checklist: 'INC-08-CL', motif: 'Incident chez un tiers' },
    { fiche: 'INC-09', checklist: 'INC-09-CL', motif: 'Campagne de phishing' },
]

// ---------------------------------------------------------------------------------------
// Compteurs réglementaires.
// ---------------------------------------------------------------------------------------

/** Date d'entrée en vigueur des obligations NIS 2, réglée par un administrateur. Vide, P2 reste
 *  « à évaluer » : aucun incident passé ne se voit reprocher un délai qui ne courait pas. */
export const CLE_NIS2_DEPUIS = 'nis2.arme_depuis'

/** `a_evaluer` n'est pas un demi-oui : c'est une décision que Slowpoke ne peut pas prendre. */
export type Applicabilite = 'applicable' | 'a_evaluer' | 'non_applicable'

export type Echeance = {
    cle: string
    nom: string
    delaiHeures: number
    depart: string
    condition: string
    porteur: string
    /** Ce que la grille prévoit pour ce niveau, avant toute décision humaine. */
    defaut: Applicabilite
    /** La décision prise pour cet incident, si quelqu'un a tranché. */
    applicable: boolean | null
    decidePar: string | null
    decideLe: string | null
    echeance: string | null
    heuresRestantes: number | null
    /** L'ACCOMPLISSEMENT : ce qui a été déposé, quand, et sous quelle référence. */
    deposeLe: string | null
    reference: string | null
    deposePar: string | null
}

/** Ce qu'on sait d'un compteur pour un incident donné : la décision, puis le dépôt. */
export type DecisionEcheance = {
    applicable: boolean
    decidePar: string | null
    decideLe: Date
    deposeLe: Date | null
    reference: string | null
    deposePar: string | null
}

/**
 * Compteurs armés par un incident, d'après la section 4 de la grille de classification.
 *
 * NIS2 dépend du niveau : systématique en P1, à évaluer en P2, non en P3 sauf faisceau
 * révélant une campagne, non en P4. Le RGPD dépend des données concernées, que Slowpoke ne
 * connaît pas. Tous partent de `knowledge_at` — la connaissance par l'ÉTABLISSEMENT.
 */
export function echeancesPour(
    incident: { knowledgeAt: Date | null, severity: string, source?: string | null },
    decisions: Record<string, DecisionEcheance> = {},
    nis2ArmeDepuis: Date | null = null,
): Echeance[] {
    const base = incident.knowledgeAt
    const p = NIVEAU_P[incident.severity as Severite] ?? 'P?'
    const renater = /renater|cert/i.test(incident.source ?? '')

    /**
     * P2 arme d'office À PARTIR d'une date réglée, pas avant.
     *
     * Armer se défait par une décision tracée ; ne pas armer ne se rattrape que si quelqu'un y
     * pense. Mais tant que la date n'est pas réglée, P2 reste « à évaluer » : on ne présume pas
     * d'une obligation qui ne court pas encore.
     */
    const nis2P2ArmeDOffice = nis2ArmeDepuis !== null && base !== null && base >= nis2ArmeDepuis

    const nis2: Applicabilite
        = p === 'P1' ? 'applicable'
            : p === 'P2' ? (nis2P2ArmeDOffice ? 'applicable' : 'a_evaluer')
                : p === 'P3' ? 'non_applicable'
                    : 'non_applicable'

    const conditionNis2
        = p === 'P1' ? 'Systématique en P1 — l\'alerte part sans attendre l\'analyse.'
            : p === 'P2' ? (nis2P2ArmeDOffice
                ? 'Armé d\'office en P2 depuis l\'entrée en vigueur : présomption, pas décision. Le RSSI l\'écarte s\'il y a lieu.'
                : 'À évaluer par le RSSI dès la qualification : le doute conduit à alerter.')
                : p === 'P3' ? 'Non en P3, sauf faisceau révélant une campagne.'
                    : 'Non en P4.'

    const modele = (
        cle: string, nom: string, heures: number, depart: string,
        condition: string, porteur: string, defaut: Applicabilite,
    ): Echeance => {
        const t = base ? new Date(base.getTime() + heures * 3_600_000) : null
        const d = decisions[cle]
        return {
            cle, nom, delaiHeures: heures, depart, condition, porteur, defaut,
            applicable: d?.applicable ?? null,
            decidePar: d?.decidePar ?? null,
            decideLe: d?.decideLe?.toISOString() ?? null,
            echeance: t ? t.toISOString() : null,
            heuresRestantes: t ? (t.getTime() - Date.now()) / 3_600_000 : null,
            deposeLe: d?.deposeLe?.toISOString() ?? null,
            reference: d?.reference ?? null,
            deposePar: d?.deposePar ?? null,
        }
    }

    const connaissance = 'Prise de connaissance par l\'établissement'

    return [
        modele('nis2_alerte', 'NIS2 — alerte précoce', 24, connaissance, conditionNis2, 'RSSI', nis2),
        modele('nis2_notification', 'NIS2 — notification', 72, connaissance, conditionNis2, 'RSSI', nis2),
        // Le rapport final n'a de sens que si la notification a eu lieu.
        modele('nis2_rapport', 'NIS2 — rapport final', 720, connaissance, `${conditionNis2} Un mois après la notification.`, 'RSSI', nis2),
        modele('rgpd', 'RGPD — notification CNIL', 72,
            'Prise de connaissance d\'une violation de données à caractère personnel',
            p === 'P4'
                ? 'Non en P4, sauf exception. En cas de doute sur des données personnelles : oui.'
                : 'Si des données personnelles sont concernées. En cas de doute : oui.',
            'DPD, saisi par la cellule', p === 'P4' ? 'non_applicable' : 'a_evaluer'),
        modele('cert_renater', 'CERT RENATER', 72,
            'Réception d\'un signalement du CERT concernant une IP de l\'établissement',
            renater
                ? 'La source de cet incident mentionne le CERT.'
                : 'Si le CERT RENATER a signalé une IP de l\'établissement.',
            'Cellule Cyber', renater ? 'applicable' : 'a_evaluer'),
    ]
}

/** Un compteur court s'il a été déclaré applicable — ou prévu d'office par la grille — ET que
 *  la déclaration n'a pas été déposée. Laisser filer le décompte d'un jalon fait ferait passer
 *  un devoir accompli pour un retard, et userait l'attention due aux vrais. */
export function courtVraiment(e: Echeance): boolean {
    if (e.deposeLe) return false
    return e.applicable ?? (e.defaut === 'applicable')
}
