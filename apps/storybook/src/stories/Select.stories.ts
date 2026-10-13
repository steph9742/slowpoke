import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';

import { UISelect, UIDialog, UIButton } from '@slowpoke/ui'

const meta = {
    title: 'Forms/Select',
    component: UISelect,
    tags: ['autodocs'],
    argTypes: {
        orientation: { control: 'select', options: ['top', 'bottom', 'left', 'right'] },
        multiSelect: { control: 'boolean' },
        disabled: { control: 'boolean' },
        searchable: { control: 'boolean' },
        placeholder: { control: 'text' },
    },
    args: {
        orientation: 'bottom',
        multiSelect: true,
        disabled: false,
        searchable: false,
        placeholder: 'Sélectionner une option',
    },
} satisfies Meta<typeof UISelect>;

export default meta;
type Story = StoryObj<typeof meta>;

const basicOptions = [
    { label: 'Option 1', value: 1 },
    { label: 'Option 2', value: 2 },
    { label: 'Option 3', value: 3 },
    { label: 'Option 4', value: 4 },
];

const categorizedOptions = [
    {
        title: 'Fruits',
        options: [
            { label: 'Pomme', value: 'apple' },
            { label: 'Banane', value: 'banana' },
            { label: 'Orange', value: 'orange' },
        ]
    },
    {
        title: 'Légumes',
        options: [
            { label: 'Carotte', value: 'carrot' },
            { label: 'Brocoli', value: 'broccoli' },
            { label: 'Épinard', value: 'spinach' },
        ]
    }
];

export const MultiSelectBasic: Story = {
    args: {
        items: basicOptions,
        multiSelect: true,
        placeholder: 'Sélectionner plusieurs options',
    },
    render: (args) => ({
        components: { UISelect },
        setup() {
            const modelValue = ref<(string | number)[]>([]);
            return { args, modelValue };
        },
        template: '<UISelect v-bind="args" v-model="modelValue" />'
    })
};

export const SingleSelect: Story = {
    args: {
        items: basicOptions,
        multiSelect: false,
        placeholder: 'Sélectionner une option',
    },
    render: (args) => ({
        components: { UISelect },
        setup() {
            const modelValue = ref<string | number>();
            return { args, modelValue };
        },
        template: '<UISelect v-bind="args" v-model="modelValue" />'
    })
};

export const WithCategories: Story = {
    args: {
        items: categorizedOptions,
        multiSelect: true,
        placeholder: 'Sélectionner des aliments',
    },
    render: (args) => ({
        components: { UISelect },
        setup() {
            const modelValue = ref<(string | number)[]>([]);
            return { args, modelValue };
        },
        template: '<UISelect v-bind="args" v-model="modelValue" />'
    })
};

export const WithSearch: Story = {
    args: {
        items: categorizedOptions,
        multiSelect: true,
        searchable: true,
        placeholder: 'Rechercher et sélectionner',
    },
    render: (args) => ({
        components: { UISelect },
        setup() {
            const modelValue = ref<(string | number)[]>([]);
            return { args, modelValue };
        },
        template: '<UISelect v-bind="args" v-model="modelValue" />'
    })
};

export const Disabled: Story = {
    args: {
        items: basicOptions,
        disabled: true,
        placeholder: 'Désactivé',
    },
    render: (args) => ({
        components: { UISelect },
        setup() {
            const modelValue = ref<(string | number)[]>([]);
            return { args, modelValue };
        },
        template: '<UISelect v-bind="args" v-model="modelValue" />'
    })
};

export const WithPreselection: Story = {
    args: {
        items: categorizedOptions,
        multiSelect: true,
    },
    render: (args) => ({
        components: { UISelect },
        setup() {
            const modelValue = ref<(string | number)[]>(['apple', 'carrot']);
            return { args, modelValue };
        },
        template: '<div><UISelect v-bind="args" v-model="modelValue" /><p class="mt-4 text-sm">Valeur: {{ modelValue }}</p></div>'
    })
};

export const LargeList: Story = {
    args: {
        items: [
            {
                options: Array.from({ length: 50 }, (_, i) => ({
                    label: `Option ${i + 1}`,
                    value: i + 1
                }))
            }
        ],
        multiSelect: true,
        searchable: true,
    },
    render: (args) => ({
        components: { UISelect },
        setup() {
            const modelValue = ref<(string | number)[]>([]);
            return { args, modelValue };
        },
        template: '<UISelect v-bind="args" v-model="modelValue" />'
    })
};

/**
 * Dans une modale, et dans un formulaire : les deux pièges d'un sélecteur téléporté.
 *
 * Le menu doit passer AU-DESSUS du panneau (étage z-[100], au-dessus du z-60 du panneau) et
 * non derrière, et ouvrir la liste ne doit PAS soumettre le formulaire qui l'entoure.
 */
export const DansUneModaleEtUnFormulaire: Story = {
    args: {
        items: [
            { options: Array.from({ length: 30 }, (_, i) => ({ label: `Option ${i + 1}`, value: i + 1 })) },
        ],
        multiSelect: false,
        searchable: true,
        placeholder: 'Choisir…',
    },
    render: (args) => ({
        components: { UISelect, UIDialog, UIButton },
        setup() {
            const ouvert = ref(true);
            const modelValue = ref<string | number | null>(null);
            const soumissions = ref(0);
            return { args, ouvert, modelValue, soumissions };
        },
        template: `
        <div>
            <UIButton @click="ouvert = true">Ouvrir la modale</UIButton>
            <p style="margin-top: .5rem; font-family: monospace; font-size: 12px">
                soumissions du formulaire : {{ soumissions }} (doit rester à 0)
            </p>
            <UIDialog v-model="ouvert" title="Sélecteur dans une modale" description="Le menu doit couvrir le panneau, et le formulaire ne doit pas se soumettre.">
                <template #content>
                    <form @submit.prevent="soumissions++">
                        <UISelect v-bind="args" v-model="modelValue" />
                        <p style="margin-top: .5rem; font-size: 12px">choix : {{ modelValue ?? '—' }}</p>
                    </form>
                </template>
            </UIDialog>
        </div>
        `
    })
};
