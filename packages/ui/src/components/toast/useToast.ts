/**
 * Action proposée dans le bandeau — « Annuler », typiquement.
 *
 * L'appelant fournit la fonction inverse ; le bandeau ne fait que l'exposer. C'est ce qui
 * rend une action groupée osable : sans retour en arrière, personne ne lance une opération
 * sur des centaines de lignes.
 */
export type ToastAction = {
    label: string;
    run: () => void | Promise<void>;
}

export interface Toast {
    id: string;
    title: string;
    message?: string;
    icon?: string;
    type: 'neutral' | 'success' | 'error' | 'warning' | 'info';
    duration?: number;
    action?: ToastAction;
}

import { ref } from 'vue';

const toasts = ref<Toast[]>([]);

/**
 * Durées par défaut, en millisecondes.
 *
 * Un message d'erreur qui disparaît en trois secondes n'est pas lu, et une action proposée
 * doit laisser le temps de la saisir. Une durée passée explicitement l'emporte toujours.
 */
const DUREES = { avecAction: 10_000, erreur: 7_000, defaut: 3_000 } as const

export const useToast = () => {
    const newToast = ({ duration, ...rest }: { title: string, message?: string, icon?: string, type: Toast['type'], duration?: number, action?: ToastAction }) => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const delai = duration
            ?? (rest.action ? DUREES.avecAction : rest.type === 'error' ? DUREES.erreur : DUREES.defaut)
        const content = { duration: delai, ...rest };
        toasts.value.push({ id, ...content });

        setTimeout(() => {
            clearToast(id);
        }, delai);
    }

    const clearToast = (id: string) => {
        const idx = toasts.value.findIndex(t => t.id === id);
        if (idx !== -1) {
            toasts.value.splice(idx, 1);
        }
    }

    const clearAll = () => {
        toasts.value = []
    }

    return {
        toasts,
        newToast,
        clearToast,
        clearAll
    }
}