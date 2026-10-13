import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { UISkeleton } from '@slowpoke/ui'

const meta = {
    title: 'Skeleton',
    component: UISkeleton,
    tags: ['autodocs'],
    decorators: [
        () => ({
            template: '<div style="width: 200px; height: 200px"><story style="width: 100%; height: 100%" /></div>',
        }),
    ],
} satisfies Meta<typeof UISkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {

}