import type { ComponentNode } from '../../../types';
import { escRust } from '../escape';
import {
  SPINNER_PRESETS,
  getSeparatorChar,
  tailLines,
  headLines,
  renderStatusBar,
  renderToast,
} from '../../../constants/assets';
import {
  type ExportColorMode,
  ansi16IndexOfName,
  nearestAnsi16,
  nearestAnsi256,
  resolveBackgroundColor,
} from './shared';

export function exportToRatatui(root: ComponentNode, colorMode: ExportColorMode = 'truecolor'): string {
  const usedWidgets = new Set<string>();
  collectUsedWidgets(root, usedWidgets);

  const focusables: Array<{ id: string; name: string; handler?: string }> = [];
  collectFocusableNodes(root, focusables);

  const keyHandlers = new Set<string>();
  collectKeyHandlers(root, keyHandlers);
  const coreWidgets = buildWidgetImports(usedWidgets);
  const lineImport = usedWidgets.has('Line') ? '    text::Line,\n' : '';

  // Generated code has an explicit, deterministic focus cursor. This avoids
  // the previous behavior where every widget onKeyPress handler fired for
  // every key event. The visual focus treatment is intentionally left to the
  // integration layer because generated code is optional design scaffolding.
  const focusCount = focusables.length;
  const focusSetup = focusCount ? '    let mut focus_index: usize = 0;\n' : '';
  const tabArms = focusCount
    ? `                    KeyCode::Tab => { focus_index = (focus_index + 1) % ${focusCount}; },\n                    KeyCode::BackTab => { focus_index = (focus_index + ${focusCount} - 1) % ${focusCount}; },\n`
    : '';
  const focusDispatch = focusCount
    ? `                match focus_index {\n${focusables.map((item, index) => item.handler ? `                    ${index} => ${rustIdent(item.handler)}(), // ${escapeComment(item.name)}\n` : `                    ${index} => {}, // ${escapeComment(item.name)}\n`).join('')}                    _ => {}\n                }\n`
    : '';
  const keyHandlerStubs = keyHandlers.size
    ? '\n' + [...keyHandlers].sort().map((n) => `fn ${n}() {\n    // TODO: implement focused key action\n}\n`).join('\n')
    : '';

  const motionComments = collectMotionComments(root);
  const motionHeader = motionComments.length
    ? `// Authored motion intent (map to TachyonFX in Syndrid; keep input/resize non-blocking):\n${motionComments.map((line) => `// - ${line}`).join('\n')}\n`
    : '';
  const responsiveCount = countResponsiveOverrides(root);
  const responsiveHeader = responsiveCount
    ? `// Responsive intent: ${responsiveCount} component override set(s) exist in the .tui / Syndrid agent spec.\n// This single-file export shows base structure; implement width-based variants with Ratatui constraints.\n`
    : '';

  return `${motionHeader}${responsiveHeader}// Requires: ratatui = "0.28"
// Add to Cargo.toml: [dependencies] ratatui = { version = "0.28", features = ["crossterm"] }
use std::io;
use ratatui::{
    crossterm::event::{self, Event, KeyCode, KeyEventKind},
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
${lineImport}    widgets::{${coreWidgets}},
    Frame,
};

fn main() -> io::Result<()> {
    let mut terminal = ratatui::init();
${focusSetup}    loop {
        terminal.draw(ui)?;
        if let Event::Key(key) = event::read()? {
            if key.kind == KeyEventKind::Press {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Esc => break,
${tabArms}                    _ => {
${focusDispatch}                    }
                }
            }
        }
    }
    ratatui::restore();
    Ok(())
}

fn ui(frame: &mut Frame) {
    let area = frame.area();
${generateRatatuiNode(root, 1, 'area', colorMode)}
}
${keyHandlerStubs}`;
}

function escapeComment(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');
}

function rustIdent(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_');
  const withPrefix = /^[A-Za-z_]/.test(cleaned) ? cleaned : `handler_${cleaned}`;
  const safe = withPrefix || 'handle_key';
  // Keep generated function names valid even if the design contains a Rust keyword.
  const keywords = new Set([
    'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false',
    'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut',
    'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait',
    'true', 'type', 'unsafe', 'use', 'where', 'while', 'async', 'await', 'dyn',
  ]);
  return keywords.has(safe) ? `handle_${safe}` : safe;
}

const DEFAULT_FOCUSABLE_TYPES = new Set(['Button', 'TextInput', 'TextArea', 'Checkbox', 'Radio', 'Select', 'Menu', 'List', 'Tabs', 'Table', 'Tree']);

function collectFocusableNodes(node: ComponentNode, out: Array<{ id: string; name: string; handler?: string }>): void {
  if (node.hidden) return;
  const explicit = node.prototype?.focusable;
  const focusable = explicit ?? DEFAULT_FOCUSABLE_TYPES.has(node.type);
  if (focusable) out.push({ id: node.id, name: node.name, handler: node.events.onKeyPress });
  const children = [...node.children].sort((a, b) => (a.prototype?.focusOrder ?? 0) - (b.prototype?.focusOrder ?? 0));
  children.forEach((child) => collectFocusableNodes(child, out));
}

function collectMotionComments(node: ComponentNode, out: string[] = []): string[] {
  for (const motion of node.prototype?.animations ?? []) {
    if (!motion.enabled) continue;
    out.push(`${node.name}: ${motion.trigger} ${motion.effect}${motion.direction !== 'none' ? `-${motion.direction}` : ''} ${motion.durationMs}ms ${motion.easing}, reduced=${motion.reducedMotionEffect ?? 'none'}`);
  }
  node.children.forEach((child) => collectMotionComments(child, out));
  return out;
}

function countResponsiveOverrides(node: ComponentNode): number {
  return Object.keys(node.responsive ?? {}).length + node.children.reduce((sum, child) => sum + countResponsiveOverrides(child), 0);
}

/** Collects every distinct onKeyPress handler referenced by the tree. */
function collectKeyHandlers(node: ComponentNode, handlers: Set<string>): void {
  if (node.hidden) return;
  if (node.events.onKeyPress) {
    handlers.add(rustIdent(node.events.onKeyPress));
  }
  node.children.forEach((c) => collectKeyHandlers(c, handlers));
}

// ── Widget usage tracking (F5) ────────────────────────────────────────────────

function collectUsedWidgets(node: ComponentNode, used: Set<string>): void {
  if (node.hidden) return;
  // Always need Block + Paragraph as fallback
  used.add('Block');
  used.add('Paragraph');
  used.add('Borders');
  used.add('BorderType');

  switch (node.type) {
    case 'ProgressBar':
    case 'Gauge':
      used.add('Gauge');
      break;
    case 'Sparkline':
      used.add('Sparkline');
      break;
    case 'Log':
    case 'TextArea':
      used.add('Line');
      break;
    case 'List':
    case 'Menu':
    case 'Tree':
      used.add('List');
      used.add('ListItem');
      break;
    case 'Tabs':
      used.add('Tabs');
      break;
    case 'Table':
      used.add('Table');
      used.add('Row');
      break;
    case 'Text':
      if ((node.props.content as string)?.includes('\n')) used.add('Line');
      if (node.props.wrap) used.add('Wrap');
      break;
    case 'Separator':
      if ((node.props.orientation as string) === 'vertical') used.add('Line');
      break;
  }
  for (const child of node.children) collectUsedWidgets(child, used);
}

function buildWidgetImports(used: Set<string>): string {
  // Canonical order matching ratatui's widget module
  const order = [
    'Block', 'BorderType', 'Borders', 'Gauge',
    'List', 'ListItem', 'Paragraph', 'Row', 'Sparkline', 'Table', 'Tabs', 'Wrap',
  ];
  return order.filter(w => used.has(w)).join(', ');
}

// ── Justify emulation ─────────────────────────────────────────────────────────
// Ratatui's Layout is constraint-based, not flexbox — there's no justify-content.
// The community-standard emulation: insert Constraint::Fill(1) "spacer" slots
// around/between real children so leftover space lands where CSS justify would
// put it. 'start'/'stretch'/unset are left as plain children (no behavior change).

type Slot = { child: ComponentNode } | { spacer: true };

const SPACER: Slot = { spacer: true };

function layoutSlots(children: ComponentNode[], justify: string | undefined): Slot[] {
  const kids: Slot[] = children.map((child) => ({ child }));
  switch (justify) {
    case 'center':
      return [SPACER, ...kids, SPACER];
    case 'end':
      return [SPACER, ...kids];
    case 'space-between':
      if (kids.length <= 1) return kids;
      return kids.flatMap((slot, i) => (i === 0 ? [slot] : [SPACER, slot]));
    case 'space-around':
      return kids.flatMap((slot) => [SPACER, slot]).concat(SPACER);
    default:
      return kids;
  }
}

// ── Code generator ────────────────────────────────────────────────────────────

function generateRatatuiNode(
  node: ComponentNode,
  indent: number,
  areaVar: string,
  colorMode: ExportColorMode
): string {
  if (node.hidden) return '';
  const sp = '    '.repeat(indent);

  if (node.type === 'Screen' || node.type === 'Box' || node.type === 'Grid' || node.type === 'Modal') {
    let out = '';
    let targetArea = areaVar;

    // F9 / N6 — Modal centering with saturating_add to avoid u16 overflow
    if (node.type === 'Modal') {
      const modalW = Math.round(typeof node.props.width === 'number' ? node.props.width : 40);
      const modalH = Math.round(typeof node.props.height === 'number' ? node.props.height : 12);
      // N1: suffix modal var with the area to keep sibling Modals unique
      targetArea = `modal_${areaVar.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      out += `${sp}let ${targetArea} = Rect::new(\n`;
      out += `${sp}    ${areaVar}.x.saturating_add((${areaVar}.width.saturating_sub(${modalW})) / 2),\n`;
      out += `${sp}    ${areaVar}.y.saturating_add((${areaVar}.height.saturating_sub(${modalH})) / 2),\n`;
      out += `${sp}    ${modalW},\n`;
      out += `${sp}    ${modalH},\n`;
      out += `${sp});\n`;
    }

    // F1 — unique block_<area>/inner_<area> variable names (no bare `let block`/`let inner`)
    // A Block is also needed for a background-only (unbordered) container — a
    // container has no widget of its own to paint the space, unlike Text/Button/etc,
    // which already get their bg via ratatuiStyle() on the widget itself.
    if (node.type !== 'Screen' && (node.style.border || resolveBackgroundColor(node.style))) {
      const blockVar = `block_${targetArea.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const innerVar = `inner_${targetArea.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      // N8: Block::new() — Block::default() is deprecated in ratatui 0.27+
      out += `${sp}let ${blockVar} = ${ratatuiBlock(node, colorMode)};\n`;
      out += `${sp}let ${innerVar} = ${blockVar}.inner(${targetArea});\n`;
      out += `${sp}frame.render_widget(${blockVar}, ${targetArea});\n`;
      targetArea = innerVar;
    }

    if (node.children.length === 0) return out;

    if (node.layout.type === 'absolute') {
      for (const child of node.children) {
        const x = typeof child.layout.x === 'number' ? child.layout.x : 0;
        const y = typeof child.layout.y === 'number' ? child.layout.y : 0;
        const w = typeof child.props.width === 'number' ? child.props.width : 20;
        const h = typeof child.props.height === 'number' ? child.props.height : 3;
        const childArea = `area_${child.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        out += `${sp}let ${childArea} = Rect::new(${targetArea}.x + ${x}, ${targetArea}.y + ${y}, ${w}, ${h});\n`;
        // F8 — pass indent + 1 in recursive calls
        out += generateRatatuiNode(child, indent + 1, childArea, colorMode);
      }
      return out;
    }

    // Grid layout (from PR #9/#10/#11); N3: no (as any) cast — columns/rows are on LayoutProps
    if (node.type === 'Grid') {
      const columns = Math.max(1, Number(node.layout.columns ?? 2));
      const rows = Math.max(1, Number(node.layout.rows ?? Math.ceil(node.children.length / columns)));
      const rowGap = Number(node.layout.rowGap ?? node.layout.gap ?? 0);
      const colGap = Number(node.layout.columnGap ?? node.layout.gap ?? 0);
      const rowChunks = `grid_rows_${targetArea.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      out += `${sp}let ${rowChunks} = Layout::default()\n`;
      out += `${sp}    .direction(Direction::Vertical)\n`;
      out += `${sp}    .constraints([${Array.from({ length: rows }, () => 'Constraint::Fill(1)').join(', ')}])\n`;
      if (rowGap > 0) out += `${sp}    .spacing(${rowGap})\n`;
      out += `${sp}    .split(${targetArea});\n`;
      for (let row = 0; row < rows; row++) {
        const rowArea = `${rowChunks}[${row}]`;
        const colChunks = `grid_cols_${targetArea.replace(/[^a-zA-Z0-9_]/g, '_')}_${row}`;
        out += `${sp}let ${colChunks} = Layout::default()\n`;
        out += `${sp}    .direction(Direction::Horizontal)\n`;
        out += `${sp}    .constraints([${Array.from({ length: columns }, () => 'Constraint::Fill(1)').join(', ')}])\n`;
        if (colGap > 0) out += `${sp}    .spacing(${colGap})\n`;
        out += `${sp}    .split(${rowArea});\n`;
        for (let col = 0; col < columns; col++) {
          const childIndex = row * columns + col;
          const child = node.children[childIndex];
          // F8 — pass indent + 1
          if (child) out += generateRatatuiNode(child, indent + 1, `${colChunks}[${col}]`, colorMode);
        }
      }
      return out;
    }

    const dir = node.layout.direction === 'row' ? 'Horizontal' : 'Vertical';
    const axis: 'width' | 'height' = node.layout.direction === 'row' ? 'width' : 'height';
    const gap = Number(node.layout.gap ?? 0);
    const chunks = `chunks_${targetArea.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const slots = layoutSlots(node.children, node.layout.justify);
    const constraints = slots
      .map((slot) => ('spacer' in slot ? 'Constraint::Fill(1)' : ratatuiConstraint(slot.child, axis)))
      .join(', ');
    out += `${sp}let ${chunks} = Layout::default()\n`;
    out += `${sp}    .direction(Direction::${dir})\n`;
    out += `${sp}    .constraints([${constraints}])\n`;
    if (gap > 0) out += `${sp}    .spacing(${gap})\n`;
    out += `${sp}    .split(${targetArea});\n`;
    slots.forEach((slot, i) => {
      if ('spacer' in slot) return; // Fill(1) placeholder — nothing to render
      // F8 — pass indent + 1
      out += generateRatatuiNode(slot.child, indent + 1, `${chunks}[${i}]`, colorMode);
    });
    return out;
  }

  if (node.type === 'Spacer') return '';

  if (node.type === 'Separator') {
    // Ratatui has no built-in Rule/Separator widget (verified: no
    // ratatui::widgets::Rule exists) — a Paragraph filled with the repeated
    // line character is the standard workaround. Width/height aren't known
    // until the exported program actually runs, so the repeat count reads
    // the render-time Rect's own .width/.height field rather than a value
    // baked in at export time.
    const orientation = (node.props.orientation as string) || 'horizontal';
    const lineStyle = (node.props.lineStyle as string) || 'single';
    const char = escRust(getSeparatorChar(lineStyle, orientation));
    let widget =
      orientation === 'vertical'
        ? `Paragraph::new(vec![Line::from(${char}); ${areaVar}.height as usize])`
        : `Paragraph::new(${char}.repeat(${areaVar}.width as usize))`;
    widget += `.style(${ratatuiStyle(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Text') {
    const content = (node.props.content as string) || 'Text';
    let widget = content.includes('\n')
      ? `Paragraph::new(vec![${content.split('\n').map(line => `Line::from(${escRust(line)})`).join(', ')}])`
      : `Paragraph::new(${escRust(content)})`;
    widget += `.style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    if (node.props.wrap) widget += `.wrap(Wrap { trim: false })`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Button') {
    let widget = `Paragraph::new(${escRust((node.props.label as string) || 'Button')})`;
    widget += `.alignment(Alignment::Center).style(${ratatuiStyle(node, colorMode)})`;
    widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'TextInput') {
    const text = ratatuiTextInputText(node);
    let widget = `Paragraph::new(${escRust(text)}).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Checkbox' || node.type === 'Radio' || node.type === 'Toggle' || node.type === 'Select' || node.type === 'Spinner' || node.type === 'Breadcrumb') {
    const text = ratatuiInlineText(node);
    let widget = `Paragraph::new(${escRust(text)}).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'ProgressBar') {
    const value = Number(node.props.value ?? 0);
    const max = Number(node.props.max ?? 100) || 100;
    let widget = `Gauge::default().ratio(${Math.max(0, Math.min(1, value / max)).toFixed(3)}).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Gauge') {
    // Real ratatui::widgets::Gauge::label() centers custom text in the bar,
    // replacing its default percentage display — this is what makes Gauge
    // a distinct widget rather than a re-skinned ProgressBar.
    const value = Number(node.props.value ?? 0);
    const max = Number(node.props.max ?? 100) || 100;
    const ratio = Math.max(0, Math.min(1, value / max));
    const label = (node.props.label as string) || 'Gauge';
    const showPercent = (node.props.showPercent as boolean) ?? true;
    const labelText = showPercent ? `${label} ${Math.round(ratio * 100)}%` : label;
    let widget = `Gauge::default().ratio(${ratio.toFixed(3)}).label(${escRust(labelText)}).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Sparkline') {
    // Real ratatui::widgets::Sparkline — .data() takes u64s, so values are
    // rounded and clamped non-negative. Direction is left at its default
    // (LeftToRight) rather than specified explicitly.
    const data = ((node.props.data as number[]) || []).map((v) => Math.max(0, Math.round(v)));
    const max = typeof node.props.max === 'number' ? Math.round(node.props.max) : undefined;
    let widget = `Sparkline::default().data(&[${data.join(', ')}])`;
    if (max !== undefined) widget += `.max(${max})`;
    widget += `.style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Log') {
    // Height and content are both known at export time, so the tail is
    // pre-sliced here rather than using Paragraph's real .scroll() offset
    // (which would only matter if the content could still change at runtime).
    const lines = (node.props.lines as string[]) || [];
    const height = typeof node.props.height === 'number' ? node.props.height : 6;
    const visible = tailLines(lines, height);
    let widget = `Paragraph::new(vec![${visible.map((l) => `Line::from(${escRust(l)})`).join(', ')}]).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'TextArea') {
    // Ratatui core has no multiline text-edit widget — consider the
    // tui-textarea crate for a real interactive editor. This renders a
    // static multi-line preview the same way Log does.
    const value = (node.props.value as string) || '';
    const placeholder = (node.props.placeholder as string) || '';
    const height = typeof node.props.height === 'number' ? node.props.height : 5;
    const lines = headLines((value || placeholder).split('\n'), height);
    let widget = `Paragraph::new(vec![${lines.map((l) => `Line::from(${escRust(l)})`).join(', ')}]).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'StatusBar') {
    const items = (node.props.items as { key?: string; label?: string }[]) || [];
    const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
    let widget = `Paragraph::new(${escRust(renderStatusBar(items, gap))}).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Toast') {
    // Ratatui has no notification/toast manager — hand-rolled preview.
    const message = (node.props.message as string) || '';
    const variant = (node.props.variant as string) || 'info';
    let widget = `Paragraph::new(${escRust(renderToast(message, variant))}).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'List' || node.type === 'Menu' || node.type === 'Tree') {
    const items = ratatuiListItems(node);
    // N5: omit .highlight_symbol() — it only works with render_stateful_widget;
    // selection is already shown via the inline '▶' marker in item text.
    let widget = `List::new(vec![${items}]).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Tabs') {
    const tabs = ratatuiTabTitles(node);
    let widget = `Tabs::new(vec![${tabs.map(t => escRust(t)).join(', ')}]).select(${Number(node.props.activeTab ?? 0)}).style(${ratatuiStyle(node, colorMode)}).highlight_style(Style::default().add_modifier(Modifier::BOLD))`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  if (node.type === 'Table') {
    const cols = ((node.props.columns as string[]) || ['Column 1', 'Column 2']).map(c => escRust(c)).join(', ');
    const rows = ratatuiTableRows(node);
    const widths = ((node.props.columns as string[]) || ['a', 'b']).map(() => 'Constraint::Fill(1)').join(', ');
    let widget = `Table::new(vec![${rows}], [${widths}]).header(Row::new(vec![${cols}]).style(Style::default().add_modifier(Modifier::BOLD))).style(${ratatuiStyle(node, colorMode)})`;
    if (node.style.border) widget += `.block(${ratatuiBlock(node, colorMode)})`;
    return `${sp}frame.render_widget(${widget}, ${areaVar});\n`;
  }

  return `${sp}frame.render_widget(Paragraph::new(${escRust(node.type)}), ${areaVar});\n`;
}

// ── Layout helpers ────────────────────────────────────────────────────────────

// F3 — map 'auto' to Constraint::Min(1) (not Min(0)) so children remain visible
// N2: single default branch — no duplicate return
function ratatuiConstraint(node: ComponentNode, axis: 'width' | 'height'): string {
  if (node.type === 'Spacer') return 'Constraint::Fill(1)';
  const value = node.props[axis];
  if (typeof value === 'number') return `Constraint::Length(${value})`;
  if (value === 'fill') return 'Constraint::Fill(1)';
  return 'Constraint::Min(1)';
}

// ── Block / style helpers ─────────────────────────────────────────────────────

// N8: Block::new() — Block::default() is deprecated in ratatui 0.27+
function ratatuiBlock(node: ComponentNode, colorMode: ExportColorMode): string {
  let block = 'Block::new()';
  if (node.style.border) {
    block += `.borders(Borders::ALL)`;
    block += `.border_type(${ratatuiBorderType(node.style.borderStyle as string | undefined)})`;
    if (node.name && node.name !== node.type) block += `.title(${escRust(node.name)})`;
    if (node.style.borderColor) block += `.border_style(Style::default().fg(${ratatuiColor(node.style.borderColor, colorMode)}))`;
  }
  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor) block += `.style(Style::default().bg(${ratatuiColor(backgroundColor, colorMode)}))`;
  return block;
}

function ratatuiBorderType(style: string | undefined): string {
  switch (style) {
    case 'double': return 'BorderType::Double';
    case 'rounded': return 'BorderType::Rounded';
    case 'bold': return 'BorderType::Thick';
    default: return 'BorderType::Plain';
  }
}

// Real xterm/crossterm ANSI-16 mapping, index-aligned with shared.ts's ANSI16_NAMES.
// Distinct from the truecolor `named` table below: index 7 (ANSI "white") is the
// dim Color::Gray and index 15 (bright white) is Color::White, the standard
// convention — this path only runs in ansi16 mode, so it can't affect existing
// truecolor output or its snapshots.
const RATATUI_ANSI16: string[] = [
  'Color::Black', 'Color::Red', 'Color::Green', 'Color::Yellow',
  'Color::Blue', 'Color::Magenta', 'Color::Cyan', 'Color::Gray',
  'Color::DarkGray', 'Color::LightRed', 'Color::LightGreen', 'Color::LightYellow',
  'Color::LightBlue', 'Color::LightMagenta', 'Color::LightCyan', 'Color::White',
];

// F4 — support 3-digit hex colours (#RGB → #RRGGBB)
function ratatuiColor(value: string | undefined, colorMode: ExportColorMode = 'truecolor'): string {
  if (!value) return 'Color::Reset';

  if (colorMode === 'ansi16') {
    const named = ansi16IndexOfName(value);
    if (named != null) return RATATUI_ANSI16[named];
    if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value))
      return RATATUI_ANSI16[nearestAnsi16(value)];
  }

  if (colorMode === 'ansi256') {
    const named = ansi16IndexOfName(value);
    if (named != null) return `Color::Indexed(${named})`;
    if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value))
      return `Color::Indexed(${nearestAnsi256(value)})`;
  }

  const named: Record<string, string> = {
    black: 'Color::Black', white: 'Color::White', red: 'Color::Red', green: 'Color::Green',
    yellow: 'Color::Yellow', blue: 'Color::Blue', magenta: 'Color::Magenta', cyan: 'Color::Cyan',
    gray: 'Color::Gray', grey: 'Color::Gray', darkgray: 'Color::DarkGray',
    lightred: 'Color::LightRed', lightgreen: 'Color::LightGreen', lightyellow: 'Color::LightYellow',
    lightblue: 'Color::LightBlue', lightmagenta: 'Color::LightMagenta', lightcyan: 'Color::LightCyan',
    // bright* aliases — same slots as light* above (ANSI16_NAMES uses the bright* spelling)
    brightblack: 'Color::DarkGray', brightred: 'Color::LightRed', brightgreen: 'Color::LightGreen',
    brightyellow: 'Color::LightYellow', brightblue: 'Color::LightBlue', brightmagenta: 'Color::LightMagenta',
    brightcyan: 'Color::LightCyan', brightwhite: 'Color::White',
  };
  let s = String(value).trim();
  // Expand 3-digit hex to 6-digit before stripping
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  const lower = s.toLowerCase().replace(/[^a-z0-9#]/g, '');
  if (named[lower]) return named[lower];
  if (/^#[0-9a-f]{6}$/i.test(lower)) {
    const r = parseInt(lower.slice(1, 3), 16);
    const g = parseInt(lower.slice(3, 5), 16);
    const b = parseInt(lower.slice(5, 7), 16);
    return `Color::Rgb(${r}, ${g}, ${b})`;
  }
  return 'Color::Reset';
}

function ratatuiStyle(node: ComponentNode, colorMode: ExportColorMode): string {
  let style = 'Style::default()';
  if (node.style.color) style += `.fg(${ratatuiColor(node.style.color, colorMode)})`;
  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor) style += `.bg(${ratatuiColor(backgroundColor, colorMode)})`;
  const mods: string[] = [];
  if (node.style.bold) mods.push('Modifier::BOLD');
  if (node.style.italic) mods.push('Modifier::ITALIC');
  if (node.style.underline) mods.push('Modifier::UNDERLINED');
  if (node.style.strikethrough) mods.push('Modifier::CROSSED_OUT');
  if (mods.length) style += `.add_modifier(${mods.join(' | ')})`;
  return style;
}

// ── Widget text helpers ───────────────────────────────────────────────────────

function ratatuiTextInputText(node: ComponentNode): string {
  const placeholder = (node.props.placeholder as string) || '';
  const value = (node.props.value as string) || '';
  const display = value || placeholder;
  // Trailing _ simulates a cursor for the static preview
  return `${display}_`;
}

function ratatuiInlineText(node: ComponentNode): string {
  switch (node.type) {
    case 'Checkbox': {
      const checked = !!node.props.checked;
      const icon = checked
        ? ((node.props.checkedIcon as string) || '✓')
        : ((node.props.uncheckedIcon as string) || ' ');
      return `[${icon}] ${(node.props.label as string) || 'Checkbox'}`;
    }
    case 'Radio': {
      // F7 — no (node.props as any) cast; use only node.props.checked
      const selected = !!node.props.checked;
      // F6 — use '●'/'○' to match component library defaults and canvas preview
      const icon = selected
        ? ((node.props.selectedIcon as string) || '●')
        : ((node.props.unselectedIcon as string) || '○');
      return `(${icon}) ${(node.props.label as string) || 'Radio'}`;
    }
    case 'Toggle': {
      const checked = !!node.props.checked;
      const label = (node.props.label as string) || 'Toggle';
      return `${checked ? '[ON ]' : '[OFF]'} ${label}`;
    }
    case 'Select': {
      const options = (node.props.options as string[]) || (node.props.items as string[]) || ['Option 1'];
      const idx = Number(node.props.selectedIndex ?? 0);
      const selected = options[idx] || options[0] || 'Select...';
      return `${selected} ▼`;
    }
    case 'Spinner': {
      const preset =
        SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
      const idx = Math.max(0, Math.min(Number(node.props.frame ?? 0), preset.frames.length - 1));
      const label = (node.props.label as string) ?? 'Loading...';
      return label ? `${preset.frames[idx]} ${label}` : preset.frames[idx];
    }
    case 'Breadcrumb': {
      const items = ((node.props.items as any[]) || []).map((i: any) =>
        typeof i === 'string' ? i : (i.label || '')
      );
      return items.join((node.props.separator as string) || ' / ');
    }
    default:
      return node.type;
  }
}

function ratatuiListItems(node: ComponentNode): string {
  const selectedIndex = Number(node.props.selectedIndex ?? 0);
  if (node.type === 'Tree') {
    const flat: string[] = [];
    const walk = (item: any, depth: number) => {
      const d = typeof item === 'string' ? { label: item, children: [] } : item;
      const icon = d.icon ? `${d.icon} ` : '';
      const marker = d.children && d.children.length > 0
        ? (d.expanded === false ? '▸ ' : '▾ ')
        : '';
      const prefix = `${'  '.repeat(depth)}${depth > 0 ? '├─ ' : ''}${marker}${icon}`;
      flat.push(`ListItem::new(${escRust(prefix + (d.label || 'Item'))})`);
      if (d.expanded === false) return;
      (d.children || []).forEach((child: any) => walk(child, depth + 1));
    };
    ((node.props.items as any[]) || []).forEach((item: any) => walk(item, 0));
    return flat.join(', ');
  }
  const multiSelect = node.type === 'List' && !!node.props.multiSelect;
  const items = ((node.props.items as any[]) || []).map((item: any, index: number) => {
    const d = typeof item === 'string'
      ? { label: item, icon: node.type === 'List' ? '•' : '' }
      : item;
    const checkbox = multiSelect ? `[${d.checked ? 'x' : ' '}] ` : '';
    const prefix = d.icon ? `${d.icon} ` : '';
    const hotkey = d.hotkey ? `  ${d.hotkey}` : '';
    const sel = index === selectedIndex;
    const label = `${sel ? '▶ ' : '  '}${checkbox}${prefix}${d.label || 'Item'}${hotkey}`;
    return `ListItem::new(${escRust(label)})`;
  });
  return items.join(', ');
}

function ratatuiTabTitles(node: ComponentNode): string[] {
  return ((node.props.tabs as any[]) || []).map((tab: any) => {
    if (typeof tab === 'string') return tab;
    const icon = tab.icon ? `${tab.icon} ` : '';
    const status = tab.status ? ' ●' : '';
    const hotkey = tab.hotkey ? ` ${tab.hotkey}` : '';
    return `${icon}${tab.label || 'Tab'}${status}${hotkey}`;
  });
}

function ratatuiTableRows(node: ComponentNode): string {
  const columns = (node.props.columns as string[]) || ['Column 1', 'Column 2'];
  const rows = (node.props.rows as string[][]) || [];
  return rows
    .map(row => `Row::new(vec![${columns.map((_, ci) => escRust(String(row[ci] || ''))).join(', ')}])`)
    .join(', ');
}
