import type { ComponentNode, ComponentType, LayoutProps, StyleProps } from '../../../types';

let counter = 0;
function nextId(): string {
  counter += 1;
  return `n${counter}`;
}

export function node(
  type: ComponentType,
  name: string,
  props: Record<string, unknown> = {},
  children: ComponentNode[] = [],
  style: StyleProps = {},
  layout: Partial<LayoutProps> = {},
  events: Record<string, string> = {}
): ComponentNode {
  return {
    id: nextId(),
    type,
    name,
    props,
    layout: { type: 'flexbox', direction: 'column', gap: 0, padding: 0, ...layout },
    style,
    events,
    children,
    locked: false,
    hidden: false,
    collapsed: false,
  };
}

/** A single Text leaf — exercises minimal-import gating (Ratatui) and empty-Box handling. */
export function textOnlyTree(): ComponentNode {
  return node('Screen', 'Screen', {}, [node('Text', 'Title', { content: 'Hello' })]);
}

/** Screen with no children — every exporter must handle the empty-tree case without crashing. */
export function emptyScreenTree(): ComponentNode {
  return node('Screen', 'Screen', {}, []);
}

/**
 * Exercises the round-trip fidelity fixes: a background gradient (should
 * degrade to its first stop as a flat color, with a warning), a 3-digit hex
 * and a "bright" named color (ansi16 resolution), and justify/align/gap on
 * both axes (Fill-spacer emulation in Ratatui, lipgloss Join position in
 * BubbleTea, Yoga flexbox in OpenTUI).
 */
export function styleEdgeCasesTree(): ComponentNode {
  return node('Screen', 'Screen', {}, [
    node(
      'Box',
      'Banner',
      {},
      [],
      {
        backgroundGradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { color: '#ff0000', position: 0 },
            { color: '#0000ff', position: 100 },
          ],
        },
      }
    ),
    node(
      'Box',
      'CenteredRow',
      {},
      [
        node('Text', 'A', { content: 'A' }, [], { color: '#800' }), // 3-digit hex, nearest-matches dim "red"
        node('Text', 'B', { content: 'B' }, [], { color: 'brightGreen' }),
      ],
      {},
      { direction: 'row', justify: 'center', align: 'center', gap: 3 }
    ),
    node(
      'Box',
      'SpacedColumn',
      {},
      [node('Text', 'C', { content: 'C' }), node('Text', 'D', { content: 'D' })],
      {},
      { direction: 'column', justify: 'space-between' }
    ),
  ]);
}

/**
 * One tree touching every component type, nested containers, a Grid, a Modal,
 * duplicate names (collision-safe var/id generation), quotes and angle
 * brackets in text (escaping), hex + named colors, gap/padding, and fill
 * sizing (drives the BubbleTea "fill unsupported" warning).
 */
export function kitchenSinkTree(): ComponentNode {
  return node('Screen', 'Screen', {}, [
    node(
      'Box',
      'Header',
      {},
      [
        node('Text', 'Title', { content: 'Say "hi" to <all>' }, [], {
          bold: true,
          color: '#7dcfff',
        }),
        node('Tabs', 'Nav', {
          tabs: [{ label: 'Dashboard' }, { label: 'Agent' }],
          activeTab: 1,
        }),
      ],
      { border: true, borderStyle: 'rounded', borderColor: '#414868' },
      { direction: 'row', gap: 2, padding: 1 }
    ),
    node(
      'Box',
      'Body',
      { width: 'fill' },
      [
        node(
          'List',
          'Files',
          {
            items: [
              { label: 'main.rs', icon: '•', hotkey: '1', checked: true },
              { label: 'lib.rs', icon: '•', hotkey: '2', checked: false },
            ],
            selectedIndex: 0,
            multiSelect: true,
          },
          [],
          { border: true, borderColor: 'red' },
          {},
          { onSelect: 'handleFileSelect', onKeyPress: 'handleFzfKeys' }
        ),
        node('Tree', 'Explorer', {
          items: [
            {
              label: 'Root',
              expanded: true,
              children: [
                { label: 'Child 1', children: [] },
                { label: 'Child 2', expanded: false, children: [{ label: 'Nested', children: [] }] },
              ],
            },
          ],
        }),
        node(
          'Table',
          'Stats',
          {
            columns: ['PID', 'CPU'],
            rows: [
              ['123', '45%'],
              ['456', '2%'],
            ],
          },
          [],
          {},
          {},
          { onKeyPress: 'handleTableKeys' }
        ),
        node('Menu', 'Nav2', {
          items: [{ label: 'Home', icon: '⌂', hotkey: '^H' }],
        }),
      ],
      {},
      { direction: 'row' }
    ),
    node(
      'Grid',
      'Controls',
      {},
      [
        node('Button', 'OK', { label: 'OK' }, [], {}, {}, { onClick: 'handleOk' }),
        // duplicate name on purpose — regression test for collision handling
        node('Button', 'OK', { label: 'Cancel' }, [], { color: 'red' }),
        node(
          'TextInput',
          'Search',
          { placeholder: 'type "here"...' },
          [],
          {},
          {},
          { onChange: 'handleSearchChange' }
        ),
        node(
          'TextArea',
          'Notes',
          { value: 'Line one\nLine two', placeholder: 'Enter notes...', height: 3 },
          [],
          {},
          {},
          { onChange: 'handleNotesChange' }
        ),
        node(
          'Checkbox',
          'Opt',
          { label: 'Enable', checked: true },
          [],
          {},
          {},
          { onChange: 'handleOptChange' }
        ),
        node('Radio', 'R1', { label: 'Choice A', checked: true }, [], {}, {}, { onChange: 'handleR1Change' }),
        node(
          'Toggle',
          'Dark',
          { label: 'Dark mode', value: true },
          [],
          {},
          {},
          { onChange: 'handleDarkChange' }
        ),
        node(
          'Select',
          'Sel',
          { options: ['One', 'Two'], selectedIndex: 1 },
          [],
          {},
          {},
          { onChange: 'handleSelChange' }
        ),
        node('Spinner', 'Load', { spinnerStyle: 'bouncingBar', frame: 4, label: 'Working' }),
        node('ProgressBar', 'Prog', { value: 67, max: 100, width: 24, barStyle: 'equals' }),
        node('Gauge', 'CPU', { label: 'CPU', value: 42, max: 100, width: 24, barStyle: 'blocks' }),
        node('Sparkline', 'Trend', { data: [1, 3, 2, 5, 4, 8, 6, 9, 7, 10], width: 10 }),
        node('Log', 'Output', {
          lines: ['Starting up...', 'Connected', '200 OK'],
          width: 20,
          height: 3,
        }),
        node('StatusBar', 'Footer', {
          items: [
            { key: '^Q', label: 'Quit' },
            { key: '^S', label: 'Save' },
          ],
          gap: 2,
        }),
        node('Breadcrumb', 'Crumb', {
          items: [{ label: 'Home' }, { label: 'Docs' }],
          separator: ' / ',
        }),
        node('Toast', 'Notice', { message: 'Saved successfully', variant: 'success' }),
        node('Spacer', 'Sp'),
        node('Separator', 'Div', { orientation: 'horizontal', lineStyle: 'double' }),
      ],
      {},
      { columns: 2 }
    ),
    node('Box', 'Empty', {}, [], { border: true }),
    node(
      'Modal',
      'Confirm',
      {},
      [node('Text', 'Msg', { content: 'Sure?' })],
      { border: true, borderStyle: 'double', borderColor: 'red' }
    ),
  ]);
}
