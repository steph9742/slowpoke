import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { UIButton } from '@slowpoke/ui'
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
  title: 'Buttons/Button',
  component: UIButton,
  // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg', 'icon'] },
    variant: { control: 'select', options: ['primary', 'secondary', 'outline', 'danger', 'ghost', 'link'] },
  },
  args: {
    size: 'md',
    variant: 'primary',
    // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
  },
  render: (args) => ({
    components: { UIButton },
    setup() {
      return { args };
    },
    template: '<UIButton v-bind="args">Button</UIButton>'
  })
} satisfies Meta<typeof UIButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    size: 'md',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    size: 'md',
    variant: 'secondary',
  },
};

export const Outline: Story = {
  args: {
    size: 'md',
    variant: 'outline',
  },
};

export const Ghost: Story = {
  args: {
    size: 'md',
    variant: 'ghost',
  },
};

export const Danger: Story = {
  args: {
    size: 'md',
    variant: 'danger',
  },
};

export const Link: Story = {
  args: {
    size: 'md',
    variant: 'link',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    variant: 'primary',
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
    variant: 'primary',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    variant: 'primary',
  },
};
