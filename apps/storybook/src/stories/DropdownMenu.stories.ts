import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { UIDropdownMenu, type UIDropdownMenuSection, UIButton } from '@slowpoke/ui'
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
    title: 'Dropdown Menu',
    component: UIDropdownMenu,
    // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
    tags: ['autodocs'],
    render: (args) => ({
        components: { UIDropdownMenu, UIButton },
        setup() {
            const sections: UIDropdownMenuSection[] = [
                {
                    title: 'Project',
                    items: [
                        { label: 'Settings', onClick: () => alert('Settings clicked') },
                        { label: 'Members', onClick: () => alert('Members clicked') },
                        { label: 'Billing', onClick: () => alert('Billing clicked') },
                        { label: 'Leave', destructive: true, disabled: true, onClick: () => alert('Leave clicked') },
                    ]
                },
                {
                    title: 'Account',
                    items: [
                        { label: 'Profile', onClick: () => alert('Profile clicked') },
                        { label: 'Settings', onClick: () => alert('Settings clicked') },
                        { label: 'Support', disabled: true, onClick: () => alert('Support clicked') },
                        { label: 'Logout', destructive: true, onClick: () => alert('Logout clicked') },
                    ]
                }
            ]

            return { args, sections };
        },
        template: `
        <UIDropdownMenu v-bind="args" :items="sections">
            <UIButton size="md" variant="outline">
                Dropdown Menu
            </UIButton>
        </UIDropdownMenu>`,
    }),
} satisfies Meta<typeof UIDropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        items: [
            {
                title: 'Project',
                items: [
                    { label: 'Settings', onClick: () => alert('Settings clicked') },
                    { label: 'Members', onClick: () => alert('Members clicked') },
                    { label: 'Billing', onClick: () => alert('Billing clicked') },
                    { label: 'Leave', destructive: true, disabled: true, onClick: () => alert('Leave clicked') },
                ]
            },
            {
                title: 'Account',
                items: [
                    { label: 'Profile', onClick: () => alert('Profile clicked') },
                    { label: 'Settings', onClick: () => alert('Settings clicked') },
                    { label: 'Support', disabled: true, onClick: () => alert('Support clicked') },
                    { label: 'Logout', destructive: true, onClick: () => alert('Logout clicked') },
                ]
            }
        ]
    }
}