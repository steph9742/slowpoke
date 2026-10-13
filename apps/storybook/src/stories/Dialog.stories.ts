import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { UIButton, UIDialog } from '@slowpoke/ui'
import { ref } from 'vue';
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
    title: 'Dialog',
    component: UIDialog,
    // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
    tags: ['autodocs'],
    argTypes: {
        title: { control: 'text' },
        description: { control: 'text' },
        dismissable: { control: 'boolean' },
        fullscreen: { control: 'boolean' },
    },
    args: {
        title: 'Dialog Title',
        description: 'Dialog description goes here.',
        dismissable: true,
        fullscreen: false,
        // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
    },
    render: (args) => ({
        components: { UIButton, UIDialog },
        setup() {
            const model = ref(false)
            return { model, args };
        },
        template: `
        <UIButton size="md" variant="primary" @click="model = true">Open Dialog</UIButton>
        <UIDialog v-bind="args" v-model="model">
            <template #content>
                <p>Dialog content goes here.</p>
            </template>
        </UIDialog>`
    }),
} satisfies Meta<typeof UIDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTitle: Story = {
    args: {
        description: '',
    }
}

export const WithTitleAndDescription: Story = {
    args: {
        title: 'Dialog Title',
        description: 'Dialog description goes here.',
    }
}

export const WithFooter: Story = {
    render: (args) => ({
        components: { UIButton, UIDialog },
        setup() {
            const model = ref(false)
            return { model, args };
        },
        template: `
        <UIButton size="md" variant="primary" @click="model = true">Open Dialog</UIButton>
        <UIDialog v-bind="args" v-model="model">
            <template #content>
                <p>Dialog content goes here.</p>
            </template>
            <template #footer>
                <UIButton variant="primary" @click="model = false">Confirm</UIButton>
            </template>
        </UIDialog>`
    }),
}

export const Fullscreen: Story = {
    args: {
        title: 'Dialog Title',
        description: 'Dialog description goes here.',
        fullscreen: true,
    }
}