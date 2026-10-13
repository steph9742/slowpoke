import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue'

import { UITabs, UITabsItem } from '@slowpoke/ui'
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
  title: 'Tabs',
  component: UITabs,
  // This component will have an automatically generated docsPage entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  argTypes: {
    color: { control: 'select', options: ['primary', 'secondary', 'accent'] },
    orientation: { control: 'select', options: ['horizontal', 'vertical'] },
  },
  args: {
    color: 'primary',
    orientation: 'horizontal',
    // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
  },
  render: (args) => ({
    components: { UITabs, UITabsItem },
    setup() {
      const selected = ref('item1')
      return { args, selected };
    },
    template: `
      <UITabs v-bind="args" v-model="selected">
        <UITabsItem value="item1">Item 1</UITabsItem>
        <UITabsItem value="item2">Item 2</UITabsItem>
        <UITabsItem value="item3">Item 3</UITabsItem>
      </UITabs>
    `
  })
} satisfies Meta<typeof UITabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    color: 'primary',
    orientation: 'horizontal',
  },
};

export const Secondary: Story = {
  args: {
    color: 'secondary',
    orientation: 'horizontal',
  },
};

export const Accent: Story = {
  args: {
    color: 'accent',
    orientation: 'horizontal',
  },
};

export const Neutral: Story = {
  args: {
    color: 'neutral',
    orientation: 'horizontal',
  },
};

export const Horizontal: Story = {
  args: {
    color: 'primary',
    orientation: 'horizontal',
  },
};

export const Vertical: Story = {
  args: {
    color: 'primary',
    orientation: 'vertical',
  },
};