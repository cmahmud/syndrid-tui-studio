import type {
  ComponentEcosystemSpec,
  RatatuiAdapterDefinition,
  RatatuiEcosystemLibrary,
} from '../types/ecosystem';

export const RATATUI_ECOSYSTEM_LIBRARIES: RatatuiEcosystemLibrary[] = [
  { id: 'ratatui', crateName: 'ratatui', version: '0.30.2', purpose: 'Core terminal rendering and layout', status: 'core', desktop: true, embedded: true },
  { id: 'tachyonfx', crateName: 'tachyonfx', version: '0.25.1', purpose: 'Effects, timing, composition and spatial patterns', status: 'integrated', desktop: true, embedded: true },
  { id: 'ratatui-textarea', crateName: 'ratatui-textarea', version: '0.9.2', purpose: 'Stateful multiline text and code editing', status: 'integrated', desktop: true, embedded: false },
  { id: 'tui-widgets', crateName: 'tui-widgets', version: '0.7.10', purpose: 'Big text, cards, popup, prompts, scrollbar and scrollview', status: 'integrated', desktop: true, embedded: false },
  { id: 'ratatui-image', crateName: 'ratatui-image', version: '11.0.6', purpose: 'Kitty, Sixel, iTerm2 and half-block images', status: 'integrated', desktop: true, embedded: false },
  { id: 'mousefood', crateName: 'mousefood', version: '0.5.2', purpose: 'Embedded-graphics backend for physical displays', status: 'integrated', desktop: false, embedded: true },
  { id: 'ansi-to-tui', crateName: 'ansi-to-tui', version: '8.0.1', purpose: 'Convert ANSI terminal output into Ratatui text', status: 'integrated', desktop: true, embedded: false },
  { id: 'tui-tree-widget', crateName: 'tui-tree-widget', version: 'managed', purpose: 'Stateful hierarchical tree rendering', status: 'optional', desktop: true, embedded: false },
  { id: 'tui-widget-list', crateName: 'tui-widget-list', version: 'managed', purpose: 'Rich arbitrary-widget list rendering', status: 'optional', desktop: true, embedded: false },
  { id: 'tui-term', crateName: 'tui-term', version: 'managed', purpose: 'PTY/terminal content rendered as a Ratatui widget', status: 'optional', desktop: true, embedded: false },
  { id: 'ratatui-interact', crateName: 'ratatui-interact', version: 'managed', purpose: 'Focus, mouse and interaction primitives', status: 'optional', desktop: true, embedded: false },
  { id: 'tui-syntax-highlight', crateName: 'tui-syntax-highlight', version: 'managed', purpose: 'Syntax-highlighted code blocks', status: 'optional', desktop: true, embedded: false },
  { id: 'tui-nodes', crateName: 'tui-nodes', version: 'managed', purpose: 'Node graph visualization', status: 'optional', desktop: true, embedded: false },
  { id: 'termprofile', crateName: 'termprofile', version: 'managed', purpose: 'Terminal capability profiling', status: 'optional', desktop: true, embedded: false },
];

export const RATATUI_ADAPTERS: RatatuiAdapterDefinition[] = [
  { id: 'native', label: 'Native Ratatui', description: 'Use Syndrid core Ratatui export for this component.', library: 'ratatui', recommendedTypes: [] },
  { id: 'textarea', label: 'Ratatui Textarea', description: 'Stateful multiline editing, cursor movement, selection and search.', library: 'ratatui-textarea', recommendedTypes: ['TextArea', 'TextInput'] },
  { id: 'image', label: 'Ratatui Image', description: 'Render a bound image asset with terminal-protocol negotiation.', library: 'ratatui-image', recommendedTypes: ['Box', 'Text'] },
  { id: 'big-text', label: 'Big Text', description: 'Render large terminal typography from tui-widgets.', library: 'tui-widgets', recommendedTypes: ['Text'] },
  { id: 'card', label: 'Card', description: 'Use tui-widgets cards for structured card surfaces.', library: 'tui-widgets', recommendedTypes: ['Box'] },
  { id: 'popup', label: 'Popup', description: 'Use tui-widgets popup positioning and overlay behavior.', library: 'tui-widgets', recommendedTypes: ['Modal', 'Box'] },
  { id: 'prompt', label: 'Prompt', description: 'Use tui-widgets prompts for interactive flows.', library: 'tui-widgets', recommendedTypes: ['TextInput', 'Select', 'Radio'] },
  { id: 'scrollview', label: 'Scroll View', description: 'Scrollable viewport backed by tui-scrollview via tui-widgets.', library: 'tui-widgets', recommendedTypes: ['Box', 'Log', 'Table', 'List'] },
  { id: 'tree-widget', label: 'Tree Widget', description: 'Stateful hierarchy rendering via tui-tree-widget.', library: 'tui-tree-widget', recommendedTypes: ['Tree'] },
  { id: 'widget-list', label: 'Widget List', description: 'Rows can be arbitrary widgets with selection and scrolling.', library: 'tui-widget-list', recommendedTypes: ['List', 'Menu'] },
  { id: 'terminal', label: 'Terminal / PTY', description: 'Render real terminal output through tui-term.', library: 'tui-term', recommendedTypes: ['Box', 'Log'] },
  { id: 'interactive', label: 'Interactive', description: 'Use ratatui-interact focus and pointer hit-testing primitives.', library: 'ratatui-interact', recommendedTypes: ['Button', 'List', 'Table', 'Tree'] },
  { id: 'syntax-highlight', label: 'Syntax Highlight', description: 'Use tui-syntax-highlight for code-oriented content.', library: 'tui-syntax-highlight', recommendedTypes: ['Text', 'TextArea', 'Log'] },
  { id: 'node-graph', label: 'Node Graph', description: 'Visual graph surface backed by tui-nodes.', library: 'tui-nodes', recommendedTypes: ['Box'] },
  { id: 'ansi-text', label: 'ANSI Text', description: 'Import/convert ANSI terminal output through ansi-to-tui.', library: 'ansi-to-tui', recommendedTypes: ['Text', 'Log'] },
];

export function defaultEcosystemSpec(adapter: ComponentEcosystemSpec['adapter'] = 'native'): ComponentEcosystemSpec {
  return {
    adapter,
    textarea: { search: true, softWrap: true, lineNumbers: false, tabWidth: 4, editorMode: 'standard' },
    image: { fit: 'contain', alignment: 'center', protocol: 'auto', fallback: 'alt-text', preserveAspectRatio: true },
    scroll: { axis: 'vertical', showScrollbar: true, step: 1 },
    terminal: { scrollback: 10_000, readOnly: true },
    syntax: { language: 'rust', theme: 'base16-ocean.dark', lineNumbers: false },
    interaction: { focusable: true, mouse: true, hover: true, click: true },
    nodeGraph: { orientation: 'horizontal', showPorts: true, showLabels: true },
    embedded: { enabled: false, backend: 'mousefood', target: 'simulator', colorMode: 'rgb565' },
  };
}

export function recommendedAdapterForType(componentType: string): ComponentEcosystemSpec['adapter'] {
  return RATATUI_ADAPTERS.find((adapter) => adapter.recommendedTypes.includes(componentType))?.id ?? 'native';
}
