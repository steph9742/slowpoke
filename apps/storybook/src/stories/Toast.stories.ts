import type { Meta, StoryObj } from '@storybook/vue3-vite';

import UIToast from '@slowpoke/ui/src/components/toast/UIToast.vue';
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
    title: 'Toast',
    component: UIToast,
    // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
    tags: ['autodocs'],
    argTypes: {
        title: { control: 'text' },
        message: { control: 'text' },
        type: { control: 'select', options: ['neutral', 'success', 'error', 'warning', 'info'] },
    },
    args: {
        title: 'Toast Title',
        message: 'This is a toast message.',
        type: 'neutral'
        // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
    },
    render: (args) => ({
        components: { UIToast },
        setup() {
            return { args }
        },
        template: `
        <ol style="list-style: none; padding: 0; margin: 0;">
            <UIToast v-bind="args"></UIToast>
        </ol>
        `
    })
} satisfies Meta<typeof UIToast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {
    args: {
        id: 'neutral-toast',
        title: 'Neutral Toast',
        message: 'This is a neutral toast message.',
        type: 'neutral',
    },
};

export const Success: Story = {
    args: {
        id: 'success-toast',
        title: 'Success Toast',
        message: 'This is a success toast message.',
        type: 'success',
    },
};

export const Error: Story = {
    args: {
        id: 'error-toast',
        title: 'Error Toast',
        message: 'This is a error toast message.',
        type: 'error',
    },
};

export const Warning: Story = {
    args: {
        id: 'warning-toast',
        title: 'Warning Toast',
        message: 'This is a warning toast message.',
        type: 'warning',
    },
};

export const Info: Story = {
    args: {
        id: 'info-toast',
        title: 'Info Toast',
        message: 'This is a info toast message.',
        type: 'info',
    },
};
/**
 * Bandeau porteur d'une action — « Annuler ».
 *
 * L'appelant fournit la fonction inverse ; le bandeau l'expose et se referme avant de
 * l'exécuter. La durée par défaut passe à dix secondes : une action qu'on n'a pas le temps
 * de saisir n'est pas une action.
 */
export const AvecAction: Story = {
    args: {
        id: 'action-toast',
        title: '12 lignes archivées',
        message: 'Elles sortent des listes et des décomptes.',
        type: 'success',
        action: { label: 'Annuler', run: () => alert('Archivage annulé') },
    },
};
