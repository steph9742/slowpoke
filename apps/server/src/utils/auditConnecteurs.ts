import { db } from "@slowpoke/database";
import { mainSchema } from "@slowpoke/database/tables";
import { observerAppels } from "@slowpoke/connecteurs/sortie";

// APPELS AUX SYSTÈMES EXTERNES, DANS LE JOURNAL D'AUDIT.
//
// Seuls les échecs : les synchronisations périodiques font des centaines d'appels réussis par
// passage, et les tracer tous noierait le journal. La trace complète d'une recherche lancée
// pendant une enquête est écrite par l'enquête elle-même.
export function brancherAuditConnecteurs(): void {
    observerAppels(async (appel) => {
        const echec = appel.erreur !== null || (appel.statut !== null && appel.statut >= 400)
        if (!echec) return
        await db.insert(mainSchema.auditLog).values({
            table_name: 'connecteur',
            row_id: appel.systeme,
            action: `${appel.methode} ${appel.statut ?? 'erreur réseau'}`,
            details: appel,
        })
    })
}
