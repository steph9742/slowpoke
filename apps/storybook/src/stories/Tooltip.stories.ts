import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { UIButton, UITooltip } from '@slowpoke/ui'
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
    title: 'Tooltip',
    component: UITooltip,
    // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
    tags: ['autodocs'],
    argTypes: {
        content: { control: 'text' },
        orientation: { control: 'select', options: ['top', 'bottom', 'left', 'right'] },
        delay: { control: 'number' },
    },
    args: {
        content: 'Tooltip',
        orientation: 'top',
        // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
    },
    render: (args) => ({
        components: { UIButton, UITooltip },
        setup() {
            return { args };
        },
        template: '<UITooltip v-bind="args"><UIButton size="md" variant="primary">Button</UIButton></UITooltip>'
    }),
    decorators: [
        () => ({
            template: '<div style="display: grid; height: 100vh; place-items: center;"><story /></div>',
        }),
    ],
} satisfies Meta<typeof UITooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
    args: {
        orientation: 'top'
    },
};

export const Bottom: Story = {
    args: {
        orientation: 'bottom'
    },
};

export const Left: Story = {
    args: {
        orientation: 'left'
    },
};

export const Right: Story = {
    args: {
        orientation: 'right'
    },
};