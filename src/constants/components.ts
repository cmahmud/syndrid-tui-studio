// Built-in component library definitions

import type { ComponentType } from '../types';

export interface ComponentDefinition {
  type: ComponentType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'layout' | 'input' | 'display' | 'data' | 'navigation' | 'overlay';
  defaultProps: Record<string, unknown>;
  defaultLayout: {
    type: 'flexbox' | 'grid' | 'absolute' | 'none';
    [key: string]: unknown;
  };
  defaultStyle: Record<string, unknown>;
  defaultEvents?: Record<string, string>;
}

export const COMPONENT_LIBRARY: Record<ComponentType, ComponentDefinition> = {
  // Layout Components
  Screen: {
    type: 'Screen',
    name: 'Screen',
    description: 'Main container/screen',
    icon: 'Square',
    category: 'layout',
    defaultProps: {
      width: 'auto',
      height: 'auto',
      theme: 'dracula', // Default theme
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'column',
      padding: 1,
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  Box: {
    type: 'Box',
    name: 'Box',
    description: 'Container with optional border',
    icon: 'Square',
    category: 'layout',
    defaultProps: {
      width: 'auto',
      height: 'auto',
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'column',
      padding: 1,
      gap: 1,
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  Grid: {
    type: 'Grid',
    name: 'Grid',
    description: 'CSS Grid layout',
    icon: 'Grid3x3',
    category: 'layout',
    defaultProps: {},
    defaultLayout: {
      type: 'grid',
      columns: 2,
      rows: 2,
      columnGap: 1,
      rowGap: 1,
    },
    defaultStyle: {
      color: 'white',
    },
  },

  Spacer: {
    type: 'Spacer',
    name: 'Spacer',
    description: 'Empty space',
    icon: 'Space',
    category: 'layout',
    defaultProps: {
      width: 1,
      height: 1,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {},
  },

  Separator: {
    type: 'Separator',
    name: 'Separator',
    description: 'Horizontal or vertical divider line',
    icon: 'SeparatorHorizontal',
    category: 'layout',
    defaultProps: {
      orientation: 'horizontal',
      lineStyle: 'single',
      width: 'fill',
      height: 1,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
    },
  },

  // Input Components
  TextInput: {
    type: 'TextInput',
    name: 'Text Input',
    description: 'Single-line text input',
    icon: 'Input',
    category: 'input',
    defaultProps: {
      placeholder: 'Enter text...',
      value: '',
      width: 20,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
    defaultEvents: {
      onChange: 'handleChange',
    },
  },

  TextArea: {
    type: 'TextArea',
    name: 'Text Area',
    description: 'Multiline editable text input',
    icon: 'AlignLeft',
    category: 'input',
    defaultProps: {
      placeholder: 'Enter text...',
      value: '',
      width: 30,
      height: 5,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
    defaultEvents: {
      onChange: 'handleChange',
    },
  },

  Button: {
    type: 'Button',
    name: 'Button',
    description: 'Clickable button',
    icon: 'RectangleHorizontal',
    category: 'input',
    defaultProps: {
      label: 'Button',
      disabled: false,
      iconLeft: '', // Icon or key on the left (e.g., '+', '^A', '⑃', '🔥')
      iconLeftEnabled: false, // Whether to show left icon
      iconRight: '', // Icon on the right (e.g., '▾', '→', '✓')
      iconRightEnabled: false, // Whether to show right icon
      number: undefined, // Number to show with left icon
      separated: false, // Whether to use divider between icon and label
      width: 'auto', // Auto-size to content
      height: 'auto',
    },
    defaultLayout: {
      type: 'none',
      padding: 1,
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'rounded',
      borderColor: 'white',
      bold: true,
    },
    defaultEvents: {
      onClick: 'handleClick',
    },
  },

  Checkbox: {
    type: 'Checkbox',
    name: 'Checkbox',
    description: 'Checkbox input',
    icon: 'CheckSquare',
    category: 'input',
    defaultProps: {
      label: 'Option',
      checked: false,
      checkedIcon: '✓',
      uncheckedIcon: ' ',
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      checkedColor: 'green',
      uncheckedColor: 'white',
      labelColor: 'white',
    },
    defaultEvents: {
      onChange: 'handleChange',
    },
  },

  Radio: {
    type: 'Radio',
    name: 'Radio',
    description: 'Radio button input',
    icon: 'Circle',
    category: 'input',
    defaultProps: {
      label: 'Option',
      checked: false,
      selectedIcon: '●',
      unselectedIcon: '○',
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      selectedColor: 'green',
      unselectedColor: 'white',
      labelColor: 'white',
    },
    defaultEvents: {
      onChange: 'handleChange',
    },
  },

  Select: {
    type: 'Select',
    name: 'Select',
    description: 'Dropdown select',
    icon: 'ChevronDown',
    category: 'input',
    defaultProps: {
      options: ['Option 1', 'Option 2', 'Option 3'],
      value: '',
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
    defaultEvents: {
      onChange: 'handleChange',
    },
  },

  Toggle: {
    type: 'Toggle',
    name: 'Toggle',
    description: 'Toggle switch',
    icon: 'ToggleLeft',
    category: 'input',
    defaultProps: {
      label: 'Toggle',
      checked: false,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
    },
    defaultEvents: {
      onChange: 'handleChange',
    },
  },

  // Display Components
  Text: {
    type: 'Text',
    name: 'Text',
    description: 'Static text label',
    icon: 'Type',
    category: 'display',
    defaultProps: {
      content: 'Text',
      wrap: false,
      align: 'left',
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
    },
  },

  Spinner: {
    type: 'Spinner',
    name: 'Spinner',
    description: 'Loading spinner',
    icon: 'Loader2',
    category: 'display',
    defaultProps: {
      spinnerStyle: 'dots',
      label: 'Loading...',
      frame: 0,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
    },
  },

  ProgressBar: {
    type: 'ProgressBar',
    name: 'Progress Bar',
    description: 'Progress indicator',
    icon: 'Activity',
    category: 'display',
    defaultProps: {
      value: 0,
      max: 100,
      width: 20,
      barStyle: 'blocks',
      showPercent: true,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  Gauge: {
    type: 'Gauge',
    name: 'Gauge',
    description: 'Labeled progress metric (e.g. CPU, memory)',
    icon: 'Gauge',
    category: 'display',
    defaultProps: {
      label: 'Gauge',
      value: 45,
      max: 100,
      width: 24,
      barStyle: 'blocks',
      showPercent: true,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  Sparkline: {
    type: 'Sparkline',
    name: 'Sparkline',
    description: 'Inline mini bar chart from a numeric series',
    icon: 'BarChart3',
    category: 'display',
    defaultProps: {
      data: [1, 3, 2, 5, 4, 8, 6, 9, 7, 10, 8, 5],
      width: 20,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
    },
  },

  Log: {
    type: 'Log',
    name: 'Log',
    description: 'Scrolling log/output panel',
    icon: 'ScrollText',
    category: 'display',
    defaultProps: {
      lines: [
        'Starting up...',
        'Connected to server',
        'GET /api/users 200 OK',
        'Processing job #42',
        'Task completed successfully',
      ],
      width: 30,
      height: 6,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  Toast: {
    type: 'Toast',
    name: 'Toast',
    description: 'Non-blocking status notification',
    icon: 'BellRing',
    category: 'display',
    defaultProps: {
      message: 'Saved successfully',
      variant: 'info',
      width: 24,
      height: 3,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  // Data Components
  Table: {
    type: 'Table',
    name: 'Table',
    description: 'Data table',
    icon: 'Table',
    category: 'data',
    defaultProps: {
      columns: ['Column 1', 'Column 2'],
      rows: [
        ['Cell 1', 'Cell 2'],
        ['Cell 3', 'Cell 4'],
      ],
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  List: {
    type: 'List',
    name: 'List',
    description: 'Selectable list',
    icon: 'List',
    category: 'data',
    defaultProps: {
      items: [
        { label: 'Item 1', icon: '•', hotkey: '1' },
        { label: 'Item 2', icon: '•', hotkey: '2' },
        { label: 'Item 3', icon: '•', hotkey: '3' },
      ],
      selectedIndex: 0,
      multiSelect: false,
      width: 'auto',
      height: 'auto',
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'column',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
    defaultEvents: {
      onSelect: 'handleSelect',
    },
  },

  Tree: {
    type: 'Tree',
    name: 'Tree',
    description: 'Hierarchical tree',
    icon: 'Network',
    category: 'data',
    defaultProps: {
      items: [
        {
          label: 'Root',
          icon: '📁',
          expanded: true,
          children: [
            { label: 'Child 1', icon: '📄', children: [] },
            {
              label: 'Child 2',
              icon: '📁',
              expanded: false,
              children: [{ label: 'Nested 1', icon: '📄', children: [] }],
            },
          ],
        },
        { label: 'Root 2', icon: '📁', expanded: false, children: [] },
      ],
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'column',
    },
    defaultStyle: {
      color: 'white',
    },
  },

  // Navigation Components
  Menu: {
    type: 'Menu',
    name: 'Menu',
    description: 'Navigation menu',
    icon: 'Menu',
    category: 'navigation',
    defaultProps: {
      menuStyle: 'plain',
      items: [
        { label: 'Home', icon: '⌂', hotkey: '^H' },
        { label: 'Settings', icon: '⚙', hotkey: '^S' },
        { label: 'Exit', icon: '✕', hotkey: '^Q' },
      ],
      selectedIndex: 0,
      width: 'auto',
      height: 'auto',
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'column',
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'single',
      borderColor: 'white',
    },
  },

  Tabs: {
    type: 'Tabs',
    name: 'Tabs',
    description: 'Tab navigation',
    icon: 'PanelTop',
    category: 'navigation',
    defaultProps: {
      tabs: [
        { label: 'Dashboard', icon: '⌂', status: false, hotkey: '' },
        { label: 'Agent', icon: '', status: true, hotkey: '^1' },
        { label: 'QA Team', icon: '', status: false, hotkey: '^2' },
      ],
      activeTab: 0,
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'column',
    },
    defaultStyle: {
      color: 'white',
    },
  },

  StatusBar: {
    type: 'StatusBar',
    name: 'Status Bar',
    description: 'Footer bar showing keybinding hints',
    icon: 'PanelBottom',
    category: 'navigation',
    defaultProps: {
      items: [
        { key: '^Q', label: 'Quit' },
        { key: '^S', label: 'Save' },
        { key: '^H', label: 'Help' },
      ],
      gap: 2,
      width: 'fill',
      height: 1,
    },
    defaultLayout: {
      type: 'none',
    },
    defaultStyle: {
      color: 'white',
      backgroundColor: 'blue',
    },
  },

  Breadcrumb: {
    type: 'Breadcrumb',
    name: 'Breadcrumb',
    description: 'Breadcrumb navigation',
    icon: 'ChevronRight',
    category: 'navigation',
    defaultProps: {
      items: [
        { label: 'Home', icon: '' },
        { label: 'Documents', icon: '' },
        { label: 'File', icon: '' },
      ],
      separator: ' / ',
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'row',
      gap: 1,
    },
    defaultStyle: {
      color: 'white',
    },
  },

  // Overlay Components
  Modal: {
    type: 'Modal',
    name: 'Modal',
    description: 'Modal dialog',
    icon: 'SquareDashedBottomCode',
    category: 'layout',
    defaultProps: {
      title: 'Modal',
      width: 40,
      height: 12,
    },
    defaultLayout: {
      type: 'flexbox',
      direction: 'column',
      padding: 2,
    },
    defaultStyle: {
      color: 'white',
      border: true,
      borderStyle: 'double',
      borderColor: 'white',
      backgroundColor: 'black',
    },
  },
};

// Get components by category
export function getComponentsByCategory(
  category: ComponentDefinition['category']
): ComponentDefinition[] {
  return Object.values(COMPONENT_LIBRARY).filter((c) => c.category === category);
}

// Get all categories
export const CATEGORIES: Array<{ id: ComponentDefinition['category']; name: string }> = [
  { id: 'layout', name: 'Layout' },
  { id: 'input', name: 'Input' },
  { id: 'display', name: 'Display' },
  { id: 'data', name: 'Data' },
  { id: 'navigation', name: 'Navigation' },
  { id: 'overlay', name: 'Overlay' },
];

// Helper to check if a component type can have children
export function canHaveChildren(type: import('../types').ComponentType): boolean {
  const containerTypes = ['Screen', 'Box', 'Grid', 'Modal', 'Tabs', 'Menu', 'List', 'Tree'];
  return containerTypes.includes(type);
}
