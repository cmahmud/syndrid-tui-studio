import type { ComponentNode } from '../../../types';
import { escPy } from '../escape';
import { ANSI16_NAMES, ansi16IndexOfName, resolveBackgroundColor } from './shared';

// Generates a runnable Textual app: containers preserve the tree, widgets map to
// real Textual classes, styles become TCSS in App.CSS, and data widgets
// (DataTable/Tree/ProgressBar) are populated in on_mount.

// Which real Textual message class + handler method a node's event maps to,
// keyed by the bucket name used in Ctx.handlers.
const HANDLER_METHODS: Record<string, { method: string; eventType: string }> = {
  click: { method: 'on_button_pressed', eventType: 'Button.Pressed' },
  input: { method: 'on_input_changed', eventType: 'Input.Changed' },
  checkbox: { method: 'on_checkbox_changed', eventType: 'Checkbox.Changed' },
  radio: { method: 'on_radio_button_changed', eventType: 'RadioButton.Changed' },
  switch: { method: 'on_switch_changed', eventType: 'Switch.Changed' },
  select: { method: 'on_select_changed', eventType: 'Select.Changed' },
  listSelect: { method: 'on_list_view_selected', eventType: 'ListView.Selected' },
  selectionListChanged: {
    method: 'on_selection_list_selected_changed',
    eventType: 'SelectionList.SelectedChanged',
  },
  textArea: { method: 'on_text_area_changed', eventType: 'TextArea.Changed' },
};

interface Ctx {
  widgets: Set<string>;
  containers: Set<string>;
  ids: Map<string, string>; // node.id -> css id
  usedIds: Set<string>;
  css: string[];
  mount: string[];
  needsSpacerCss: boolean;
  modals: { className: string; node: ComponentNode }[];
  usedClassNames: Set<string>;
  footerBindings: string[];
  // Handler names collected per real Textual message class, so a shared
  // on_X method can dispatch to whichever named stub(s) the design uses.
  handlers: Record<keyof typeof HANDLER_METHODS, Set<string>> & { key: Set<string> };
}

export function exportToTextual(root: ComponentNode): string {
  const ctx: Ctx = {
    widgets: new Set(),
    containers: new Set(),
    ids: new Map(),
    usedIds: new Set(),
    css: [],
    mount: [],
    needsSpacerCss: false,
    modals: [],
    usedClassNames: new Set(),
    footerBindings: [],
    handlers: {
      click: new Set(),
      input: new Set(),
      checkbox: new Set(),
      radio: new Set(),
      switch: new Set(),
      select: new Set(),
      listSelect: new Set(),
      selectionListChanged: new Set(),
      textArea: new Set(),
      key: new Set(),
    },
  };

  const topNodes = root.type === 'Screen' ? root.children : [root];
  if (root.type === 'Screen') {
    const rules = tcssRules(root, true);
    if (rules.length) ctx.css.push(`    Screen {\n${rules.map((r) => `        ${r}`).join('\n')}\n    }`);
  }

  let body = '';
  for (const child of topNodes) body += genNode(child, ctx, 8);
  if (!body) body = `${' '.repeat(8)}yield Static("")\n`;

  // Modal nodes hoist into ModalScreen subclasses with their own compose/on_mount.
  const modalClasses: string[] = [];
  for (const { className, node } of ctx.modals) {
    const outerMount = ctx.mount;
    ctx.mount = [];
    const cls =
      node.layout.type === 'grid' ? 'Grid' : node.layout.direction === 'row' ? 'Horizontal' : 'Vertical';
    ctx.containers.add(cls);
    const sizing: string[] = [];
    if (node.props.width == null) sizing.push('width: auto;');
    if (node.props.height == null) sizing.push('height: auto;');
    const id = registerStyles(node, ctx, sizing, true)!;
    ctx.css.push(`    ${className} {\n        align: center middle;\n    }`);
    let modalBody = '';
    for (const child of node.children) modalBody += genNode(child, ctx, 12);
    const modalMount = ctx.mount.length
      ? `\n    def on_mount(self) -> None:\n${ctx.mount.map((l) => `        ${l}`).join('\n')}\n`
      : '';
    ctx.mount = outerMount;
    modalClasses.push(
      `class ${className}(ModalScreen):\n` +
        `    def compose(self) -> ComposeResult:\n` +
        `        with ${cls}(id="${id}"):\n` +
        (modalBody || `            pass\n`) +
        modalMount
    );
  }

  if (ctx.needsSpacerCss) ctx.css.push('    .spacer {\n        width: 1fr;\n        height: 1fr;\n    }');
  ctx.widgets.add('Static');

  const importLines = [
    'from textual.app import App, ComposeResult',
    ctx.handlers.key.size ? 'from textual import events' : '',
    ctx.containers.size
      ? `from textual.containers import ${[...ctx.containers].sort().join(', ')}`
      : '',
    ctx.modals.length ? 'from textual.screen import ModalScreen' : '',
    `from textual.widgets import ${[...ctx.widgets].sort().join(', ')}`,
  ].filter(Boolean);

  const bindingsBlock = ctx.footerBindings.length
    ? `    BINDINGS = [\n${ctx.footerBindings.map((b) => `        ${b},`).join('\n')}\n    ]\n\n`
    : '';

  const cssBlock = ctx.css.length ? `    CSS = """\n${ctx.css.join('\n\n')}\n    """\n\n` : '';

  const mountBlock = ctx.mount.length
    ? `\n    def on_mount(self) -> None:\n${ctx.mount.map((l) => `        ${l}`).join('\n')}\n`
    : '';

  const handlerBlock = buildHandlerMethods(ctx);

  const modalBlock = modalClasses.length ? `${modalClasses.join('\n\n')}\n\n` : '';

  return `${importLines.join('\n')}


${modalBlock}class MyApp(App):
${bindingsBlock}${cssBlock}    def compose(self) -> ComposeResult:
${body}${mountBlock}${handlerBlock}

if __name__ == "__main__":
    MyApp().run()
`;
}

/**
 * Real Textual message-handler methods (Button.Pressed -> on_button_pressed,
 * etc. — verified per-widget handler naming, not guessed) that dispatch to
 * whichever named stub(s) the design's events reference, plus a `pass`-body
 * stub definition for every distinct handler name so the generated class is
 * self-consistent and compiles. `on_key` is the one generic exception (no
 * per-widget message class for raw keypresses) — it fires for every key
 * press in the app, not scoped to the specific List/Table/Tree that
 * declared it, since Textual's focus system isn't otherwise modeled here.
 */
function buildHandlerMethods(ctx: Ctx): string {
  const blocks: string[] = [];
  const stubs = new Set<string>();

  for (const [bucket, { method, eventType }] of Object.entries(HANDLER_METHODS)) {
    const names = ctx.handlers[bucket as keyof typeof HANDLER_METHODS];
    if (!names.size) continue;
    names.forEach((n) => stubs.add(n));
    blocks.push(
      `    def ${method}(self, event: ${eventType}) -> None:\n` +
        [...names].map((n) => `        self.${n}()`).join('\n') +
        '\n'
    );
  }

  if (ctx.handlers.key.size) {
    ctx.handlers.key.forEach((n) => stubs.add(n));
    blocks.push(
      `    def on_key(self, event: events.Key) -> None:\n` +
        [...ctx.handlers.key].map((n) => `        self.${n}()`).join('\n') +
        '\n'
    );
  }

  for (const name of [...stubs].sort()) {
    blocks.push(`    def ${name}(self) -> None:\n        pass  # TODO: implement\n`);
  }

  return blocks.length ? `\n${blocks.join('\n')}` : '';
}

function genNode(node: ComponentNode, ctx: Ctx, indent: number): string {
  if (node.hidden) return '';
  const sp = ' '.repeat(indent);

  switch (node.type) {
    case 'Modal': {
      // Hoisted out of compose into a ModalScreen subclass, pushed in on_mount.
      const className = allocClassName(node.name, ctx);
      ctx.modals.push({ className, node });
      ctx.mount.push(`self.push_screen(${className}())`);
      return '';
    }

    case 'Screen':
    case 'Box':
    case 'Grid': {
      const cls =
        node.type === 'Grid' ? 'Grid' : node.layout.direction === 'row' ? 'Horizontal' : 'Vertical';
      ctx.containers.add(cls);
      const extraCss: string[] = [];
      if (node.type === 'Grid') {
        const cols = Math.max(1, Number(node.layout.columns ?? 2));
        const rows = Math.max(1, Number(node.layout.rows ?? Math.ceil(node.children.length / cols)));
        extraCss.push(`grid-size: ${cols} ${rows};`);
        const rowGap = Number(node.layout.rowGap ?? node.layout.gap ?? 0);
        const colGap = Number(node.layout.columnGap ?? node.layout.gap ?? 0);
        if (rowGap || colGap) extraCss.push(`grid-gutter: ${rowGap} ${colGap};`);
      }
      const id = registerStyles(node, ctx, extraCss, gapNeedsId(node));
      emitGapCss(node, id, ctx);
      const out = `${sp}with ${cls}(${idArg(id, true)}):\n`;
      const children = node.children.map((c) => genNode(c, ctx, indent + 4)).join('');
      return out + (children || `${sp}    pass\n`);
    }

    case 'Spacer':
      ctx.needsSpacerCss = true;
      return `${sp}yield Static("", classes="spacer")\n`;

    case 'Separator': {
      ctx.widgets.add('Rule');
      const orientation = (node.props.orientation as string) || 'horizontal';
      const lineStyle = textualLineStyle((node.props.lineStyle as string) || 'single');
      const id = registerStyles(node, ctx);
      const ctor = orientation === 'vertical' ? 'Rule.vertical' : 'Rule.horizontal';
      return `${sp}yield ${ctor}(line_style=${escPyStr(lineStyle)}${idArg(id)})\n`;
    }

    case 'Text': {
      const id = registerStyles(node, ctx);
      return `${sp}yield Static(${py(node.props.content, 'Text')}${idArg(id)})\n`;
    }

    case 'Button': {
      ctx.widgets.add('Button');
      const id = registerStyles(node, ctx);
      if (node.events.onClick) ctx.handlers.click.add(node.events.onClick);
      return `${sp}yield Button(${py(node.props.label, 'Button')}${idArg(id)})\n`;
    }

    case 'TextInput': {
      ctx.widgets.add('Input');
      const id = registerStyles(node, ctx);
      const value = node.props.value ? `, value=${py(node.props.value, '')}` : '';
      if (node.events.onChange) ctx.handlers.input.add(node.events.onChange);
      return `${sp}yield Input(placeholder=${py(node.props.placeholder, '')}${value}${idArg(id)})\n`;
    }

    case 'TextArea': {
      ctx.widgets.add('TextArea');
      const id = registerStyles(node, ctx);
      const value = (node.props.value as string) || '';
      const placeholder = (node.props.placeholder as string) || '';
      if (node.events.onChange) ctx.handlers.textArea.add(node.events.onChange);
      return `${sp}yield TextArea(${py(value, '')}, placeholder=${py(placeholder, '')}${idArg(id)})\n`;
    }

    case 'Checkbox': {
      ctx.widgets.add('Checkbox');
      const id = registerStyles(node, ctx);
      if (node.events.onChange) ctx.handlers.checkbox.add(node.events.onChange);
      return `${sp}yield Checkbox(${py(node.props.label, 'Checkbox')}, value=${pyBool(node.props.checked)}${idArg(id)})\n`;
    }

    case 'Radio': {
      ctx.widgets.add('RadioButton');
      const id = registerStyles(node, ctx);
      if (node.events.onChange) ctx.handlers.radio.add(node.events.onChange);
      return `${sp}yield RadioButton(${py(node.props.label, 'Radio')}, value=${pyBool(node.props.checked)}${idArg(id)})\n`;
    }

    case 'Toggle': {
      ctx.widgets.add('Switch');
      const id = registerStyles(node, ctx);
      if (node.events.onChange) ctx.handlers.switch.add(node.events.onChange);
      const label = (node.props.label as string) || '';
      if (!label) return `${sp}yield Switch(value=${pyBool(node.props.value ?? node.props.checked)}${idArg(id)})\n`;
      ctx.containers.add('Horizontal');
      return (
        `${sp}with Horizontal():\n` +
        `${sp}    yield Static(${py(label, '')})\n` +
        `${sp}    yield Switch(value=${pyBool(node.props.value ?? node.props.checked)}${idArg(id)})\n`
      );
    }

    case 'Select': {
      ctx.widgets.add('Select');
      const id = registerStyles(node, ctx);
      const options = (node.props.options as string[]) || ['Option 1'];
      const idx = Math.min(Math.max(0, Number(node.props.selectedIndex ?? 0)), options.length - 1);
      const pairs = options.map((o, i) => `(${py(o, '')}, ${i})`).join(', ');
      if (node.events.onChange) ctx.handlers.select.add(node.events.onChange);
      return `${sp}yield Select([${pairs}], allow_blank=False, value=${idx}${idArg(id)})\n`;
    }

    case 'Spinner': {
      ctx.widgets.add('LoadingIndicator');
      const id = registerStyles(node, ctx);
      return `${sp}yield LoadingIndicator(${idArg(id, true)})\n`;
    }

    case 'ProgressBar': {
      ctx.widgets.add('ProgressBar');
      const id = registerStyles(node, ctx, [], true)!;
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      ctx.mount.push(
        `self.query_one("#${id}", ProgressBar).update(total=${max}, progress=${value})`
      );
      return `${sp}yield ProgressBar(total=${max}, show_eta=False${idArg(id)})\n`;
    }

    case 'Gauge': {
      // Textual's ProgressBar has no free-text label slot, so a labeled
      // gauge is a Horizontal of a Static label + a real ProgressBar —
      // the same composition this file already uses for a labeled Toggle.
      ctx.widgets.add('ProgressBar');
      ctx.widgets.add('Static');
      ctx.containers.add('Horizontal');
      const id = registerStyles(node, ctx, [], true)!;
      const label = (node.props.label as string) || 'Gauge';
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      ctx.mount.push(
        `self.query_one("#${id}", ProgressBar).update(total=${max}, progress=${value})`
      );
      return (
        `${sp}with Horizontal():\n` +
        `${sp}    yield Static(${py(label, 'Gauge')})\n` +
        `${sp}    yield ProgressBar(total=${max}, show_eta=False${idArg(id)})\n`
      );
    }

    case 'Sparkline': {
      // Real textual.widgets.Sparkline — confirmed via textual.textualize.io/widgets/sparkline,
      // not a hand-rolled fallback like the other 5 exporters need.
      ctx.widgets.add('Sparkline');
      const id = registerStyles(node, ctx, [], true)!;
      const data = (node.props.data as number[]) || [];
      return `${sp}yield Sparkline([${data.join(', ')}], summary_function=max${idArg(id)})\n`;
    }

    case 'Log': {
      // Real textual.widgets.RichLog — confirmed via textual.textualize.io/widgets/rich_log.
      // write() appends content, so lines are pushed in on_mount in order.
      ctx.widgets.add('RichLog');
      const id = registerStyles(node, ctx, [], true)!;
      const lines = (node.props.lines as string[]) || [];
      lines.forEach((line) => {
        ctx.mount.push(`self.query_one("#${id}", RichLog).write(${escPyStr(line)})`);
      });
      return `${sp}yield RichLog(${idArg(id, true)})\n`;
    }

    case 'StatusBar': {
      // Real textual.widgets.Footer, driven by a real BINDINGS class
      // attribute (confirmed via textual.textualize.io/widgets/footer) —
      // meaningfully different from every other exporter's hand-rolled
      // "join key+label text" fallback, since Footer genuinely renders
      // from the app's own key bindings rather than static text.
      ctx.widgets.add('Footer');
      const items = (node.props.items as { key?: string; label?: string }[]) || [];
      items.forEach((item) => {
        const key = textualKeyName(item.key || '');
        const label = item.label || 'Action';
        const action = slugify(label);
        ctx.footerBindings.push(
          `(${escPyStr(key)}, ${escPyStr(action)}, ${escPyStr(label)})`
        );
      });
      const id = registerStyles(node, ctx);
      return `${sp}yield Footer(${idArg(id, true)})\n`;
    }

    case 'Toast': {
      // Real App.notify() (verified via textual.textualize.io/api/app) — a
      // genuine toast, not hand-rolled, and meaningfully different from
      // every other exporter here: it's an app-level call in on_mount, not
      // a yielded widget, and Textual always positions it bottom-right
      // itself — the Studio canvas position is a design aid only, not
      // reflected in the generated position. Severity is one of exactly
      // "information"/"warning"/"error" (no "success" level in real
      // Textual), so the Studio's "success" variant maps to "information".
      const message = (node.props.message as string) || '';
      const variant = (node.props.variant as string) || 'info';
      const severityMap: Record<string, string> = {
        info: 'information',
        success: 'information',
        warning: 'warning',
        error: 'error',
      };
      const severity = severityMap[variant] || 'information';
      ctx.mount.push(`self.notify(${escPyStr(message)}, severity=${escPyStr(severity)})`);
      return '';
    }

    case 'List': {
      const id = registerStyles(node, ctx);
      if (node.events.onKeyPress) ctx.handlers.key.add(node.events.onKeyPress);

      if (node.props.multiSelect) {
        // Real native widget for exactly this (verified via
        // textual.textualize.io/widgets/selection_list) — a toggleable,
        // multi-select list, not a hand-rolled checkbox prefix.
        ctx.widgets.add('SelectionList');
        const items = (node.props.items as any[]) || [];
        const tuples = items.map((item, i) => {
          const d = typeof item === 'string' ? { label: item } : item;
          return `(${py(d.label || 'Item', 'Item')}, ${i}, ${pyBool(d.checked)})`;
        });
        if (node.events.onSelect) ctx.handlers.selectionListChanged.add(node.events.onSelect);
        return `${sp}yield SelectionList(${tuples.join(', ')}${idArg(id)})\n`;
      }

      ctx.widgets.add('ListView');
      ctx.widgets.add('ListItem');
      ctx.widgets.add('Label');
      const items = itemLabels(node.props.items).map(
        (t) => `ListItem(Label(${escPyStr(t)}))`
      );
      const initial =
        node.props.selectedIndex != null ? `, initial_index=${Number(node.props.selectedIndex)}` : '';
      if (node.events.onSelect) ctx.handlers.listSelect.add(node.events.onSelect);
      return `${sp}yield ListView(${items.join(', ')}${initial}${idArg(id)})\n`;
    }

    case 'Menu': {
      ctx.widgets.add('OptionList');
      const id = registerStyles(node, ctx);
      const items = itemLabels(node.props.items).map((t) => escPyStr(t));
      return `${sp}yield OptionList(${items.join(', ')}${idArg(id)})\n`;
    }

    case 'Table': {
      ctx.widgets.add('DataTable');
      const id = registerStyles(node, ctx, [], true)!;
      const cols = ((node.props.columns as string[]) || []).map((c) => escPyStr(c)).join(', ');
      const rows = ((node.props.rows as string[][]) || [])
        .map((r) => `(${r.map((c) => escPyStr(String(c))).join(', ')}${r.length === 1 ? ',' : ''})`)
        .join(', ');
      ctx.mount.push(`table_${sanitize(id)} = self.query_one("#${id}", DataTable)`);
      ctx.mount.push(`table_${sanitize(id)}.add_columns(${cols})`);
      if (rows) ctx.mount.push(`table_${sanitize(id)}.add_rows([${rows}])`);
      if (node.events.onKeyPress) ctx.handlers.key.add(node.events.onKeyPress);
      return `${sp}yield DataTable(${idArg(id, true)})\n`;
    }

    case 'Tree': {
      ctx.widgets.add('Tree');
      const id = registerStyles(node, ctx, [], true)!;
      const varName = `tree_${sanitize(id)}`;
      ctx.mount.push(`${varName} = self.query_one("#${id}", Tree)`);
      ctx.mount.push(`${varName}.root.expand()`);
      emitTreeItems(node.props.items, `${varName}.root`, ctx, 0, sanitize(id));
      if (node.events.onKeyPress) ctx.handlers.key.add(node.events.onKeyPress);
      return `${sp}yield Tree(${py(node.name, 'Tree')}${idArg(id)})\n`;
    }

    case 'Tabs': {
      ctx.widgets.add('Tabs');
      const active = Number(node.props.activeTab ?? 0);
      const id = registerStyles(node, ctx, [], active > 0);
      const labels = ((node.props.tabs as unknown[]) || []).map((tab) => {
        const t = tab as { label?: string };
        return escPyStr(typeof tab === 'string' ? tab : t.label || 'Tab');
      });
      // Textual auto-assigns tab ids "tab-1", "tab-2", ...
      if (active > 0) ctx.mount.push(`self.query_one("#${id}", Tabs).active = "tab-${active + 1}"`);
      return `${sp}yield Tabs(${labels.join(', ')}${idArg(id)})\n`;
    }

    case 'Breadcrumb': {
      const id = registerStyles(node, ctx);
      const sep = (node.props.separator as string) || ' / ';
      const text = itemLabels(node.props.items).join(sep);
      return `${sp}yield Static(${escPyStr(text)}${idArg(id)})\n`;
    }

    default:
      return `${sp}yield Static(${escPyStr(node.type)})\n`;
  }
}

// ── TCSS ──────────────────────────────────────────────────────────────────────

/** Register CSS rules for a node; returns its css id if one is needed. */
function registerStyles(
  node: ComponentNode,
  ctx: Ctx,
  extraRules: string[] = [],
  forceId = false
): string | null {
  const rules = [...extraRules, ...tcssRules(node, false)];
  if (!rules.length && !forceId) return null;
  const id = allocId(node, ctx);
  if (rules.length)
    ctx.css.push(`    #${id} {\n${rules.map((r) => `        ${r}`).join('\n')}\n    }`);
  return id;
}

function tcssRules(node: ComponentNode, isScreen: boolean): string[] {
  const rules: string[] = [];
  const s = node.style;
  if (s.color) rules.push(`color: ${textualColor(s.color)};`);
  const backgroundColor = resolveBackgroundColor(s);
  if (backgroundColor) rules.push(`background: ${textualColor(backgroundColor)};`);

  const textStyles = [
    s.bold && 'bold',
    s.italic && 'italic',
    s.underline && 'underline',
    s.strikethrough && 'strike',
  ].filter(Boolean);
  if (textStyles.length) rules.push(`text-style: ${textStyles.join(' ')};`);

  if (s.border) {
    const borderMap: Record<string, string> = {
      single: 'solid',
      double: 'double',
      rounded: 'round',
      bold: 'heavy',
      hidden: 'none',
    };
    const kind = borderMap[s.borderStyle || 'single'] || 'solid';
    rules.push(
      kind === 'none' ? 'border: none;' : `border: ${kind} ${textualColor(s.borderColor || 'white')};`
    );
  }

  if (!isScreen) {
    if (typeof node.props.width === 'number') rules.push(`width: ${node.props.width};`);
    else if (node.props.width === 'fill') rules.push('width: 1fr;');
    if (typeof node.props.height === 'number') rules.push(`height: ${node.props.height};`);
    else if (node.props.height === 'fill') rules.push('height: 1fr;');
  }

  const pad = node.layout.padding;
  if (typeof pad === 'number' && pad > 0) rules.push(`padding: ${pad};`);

  return rules;
}

/**
 * Textual's TCSS accepts hex (3 or 6 digit) directly, but named colors must be
 * "ansi_red"/"ansi_bright_green" etc, not our internal "red"/"brightGreen"
 * convention — a raw pass-through (the previous behavior) breaks CSS parsing
 * on any bright/aliased name. Textual's own ANSI_COLORS list is index-aligned
 * with shared.ts's ANSI16_NAMES, so this is a direct name transform.
 */
function textualColor(value: string): string {
  const idx = ansi16IndexOfName(value);
  if (idx == null) return value; // hex, or an unrecognized name — pass through as-is
  const base = ANSI16_NAMES[idx % 8].toLowerCase();
  return idx < 8 ? `ansi_${base}` : `ansi_bright_${base}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gapNeedsId(node: ComponentNode): boolean {
  return node.type === 'Box' && Number(node.layout.gap ?? 0) > 0 && node.children.length > 1;
}

/** Textual has no flex gap; approximate with margin on direct children. */
function emitGapCss(node: ComponentNode, id: string | null, ctx: Ctx): void {
  if (!id || !gapNeedsId(node)) return;
  const gap = Number(node.layout.gap);
  const prop = node.layout.direction === 'row' ? 'margin-right' : 'margin-bottom';
  ctx.css.push(`    #${id} > * {\n        ${prop}: ${gap};\n    }`);
}

function allocClassName(name: string, ctx: Ctx): string {
  let base = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (!base || /^[0-9]/.test(base)) base = `Screen${base}`;
  if (!base.endsWith('Modal')) base += 'Modal';
  let cls = base;
  let n = 2;
  while (ctx.usedClassNames.has(cls)) cls = `${base}${n++}`;
  ctx.usedClassNames.add(cls);
  return cls;
}

function allocId(node: ComponentNode, ctx: Ctx): string {
  const existing = ctx.ids.get(node.id);
  if (existing) return existing;
  let base = node.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base || /^[0-9]/.test(base)) base = `w-${base || 'idget'}`;
  let id = base;
  let n = 2;
  while (ctx.usedIds.has(id)) id = `${base}-${n++}`;
  ctx.usedIds.add(id);
  ctx.ids.set(node.id, id);
  return id;
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function idArg(id: string | null, first = false): string {
  if (!id) return '';
  return `${first ? '' : ', '}id="${id}"`;
}

function py(value: unknown, fallback: string): string {
  return escPyStr(String(value ?? '') || fallback);
}

function escPyStr(s: string): string {
  return `"${escPy(s)}"`;
}

/** Our internal lineStyle names -> Textual's real Rule line_style values (verified against textual.textualize.io/widgets/rule). */
function textualLineStyle(style: string): string {
  const map: Record<string, string> = { single: 'solid', double: 'double', thick: 'heavy', dashed: 'dashed' };
  return map[style] || 'solid';
}

/** Our "^Q"-style caret notation -> Textual's real binding key names ("ctrl+q", "q", "f1"...). */
function textualKeyName(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return 'f13'; // harmless unused key if left blank
  if (trimmed.startsWith('^') && trimmed.length > 1) return `ctrl+${trimmed[1].toLowerCase()}`;
  return trimmed.toLowerCase().replace(/\s+/g, '+');
}

/** A label like "Save As" -> a valid action-name identifier ("save_as"). */
function slugify(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'action';
}

function pyBool(value: unknown): string {
  return value ? 'True' : 'False';
}

function itemLabels(items: unknown): string[] {
  return ((items as unknown[]) || []).map((item) => {
    if (typeof item === 'string') return item;
    const d = item as { label?: string; icon?: string };
    return `${d.icon ? `${d.icon} ` : ''}${d.label || 'Item'}`;
  });
}

function emitTreeItems(
  items: unknown,
  parentExpr: string,
  ctx: Ctx,
  depth: number,
  scope: string
): void {
  ((items as unknown[]) || []).forEach((item, i) => {
    const d =
      typeof item === 'string'
        ? { label: item, children: [], expanded: false }
        : (item as { label?: string; expanded?: boolean; children?: unknown[] });
    const label = escPyStr(d.label || 'Item');
    if (d.children && d.children.length) {
      const varName = `node_${scope}_${depth}_${i}`;
      ctx.mount.push(`${varName} = ${parentExpr}.add(${label}, expand=${pyBool(d.expanded)})`);
      emitTreeItems(d.children, varName, ctx, depth + 1, scope);
    } else {
      ctx.mount.push(`${parentExpr}.add_leaf(${label})`);
    }
  });
}
