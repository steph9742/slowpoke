import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { UITextArea } from '@slowpoke/ui'
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
    title: 'Forms/Textarea',
    component: UITextArea,
    // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
    tags: ['autodocs'],
    argTypes: {
        size: { control: 'select', options: ['sm', 'md', 'lg'] },
        autocomplete: { control: 'select', options: ['on', 'off'] },
        disabled: { control: 'boolean' },
        helperText: { control: 'text' },
        error: { control: 'text' },
        label: { control: 'text' },
        placeholder: { control: 'text' },
        maxLength: { control: 'number' },
        minLength: { control: 'number' },
        required: { control: 'boolean' },
        rows: { control: 'number' },
        resize: { control: 'select', options: ['none', 'both', 'horizontal', 'vertical'] },
    },
    args: {
        size: 'md',
        placeholder: 'Enter text',
        // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
    },
} satisfies Meta<typeof UITextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {
    args: {
        size: 'sm',
    },
};

export const Medium: Story = {
    args: {
        size: 'md',
    },
};

export const Large: Story = {
    args: {
        size: 'lg',
    },
};

export const WithHelperText: Story = {
    args: {
        helperText: 'This is some helper text',
    },
};

export const WithError: Story = {
    args: {
        error: 'This is an error message',
    },
};

export const WithLabel: Story = {
    args: {
        label: 'Username',
    },
};