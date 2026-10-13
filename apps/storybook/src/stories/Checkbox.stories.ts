import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { UICheckbox } from '@slowpoke/ui'
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
  title: 'Forms/Checkbox',
  component: UICheckbox,
  // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    checkedIcon: { control: 'text' },
    uncheckedIcon: { control: 'text' },
    indeterminateIcon: { control: 'text' },
    description: { control: 'text' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    helperText: { control: 'text' },
    indeterminate: { control: 'boolean' },
    label: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
  },
  args: {
    size: 'md',
    checkedIcon: 'lucide:check',
    uncheckedIcon: '',
    indeterminateIcon: 'lucide:minus',
    description: '',
    disabled: false,
    // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
  },
} satisfies Meta<typeof UICheckbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: {
    label: 'Checkbox Label',
  },
};

export const WithHelperText: Story = {
  args: {
    helperText: 'This is some helper text', 
  },
};

export const WithError: Story = {
  args: {
    error: 'There is an error',
  },
};

export const WithDescription: Story = {
  args: {
    description: 'This is some description text',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
