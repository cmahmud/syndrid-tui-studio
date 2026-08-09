import type { ComponentNode } from '../../../types';
import { escGo } from '../escape';
import {
  SPINNER_PRESETS,
  renderBar,
  renderGauge,
  renderSparkline,
  renderStatusBar,
  renderToast,
  getSeparatorChar,
} from '../../../constants/assets';
import {
  type ExportColorMode,
  ansi16IndexOfName,
  createIdentGenerator,
  nearestAnsi16,
  nearestAnsi256,
  resolveBackgroundColor,
} from './shared';

// Generates a runnable tview (github.com/rivo/tview) program.
//
// tview's primitives all embed *Box, so calling a Box method (SetBorder,
// SetTitle, SetBorderColor) returns *Box, not the concrete type — chaining
// `tview.NewFlex().SetBorder(true).SetDirection(...)` doesn't compile. Every
// primitive below is therefore built as its own named variable with each
// Set* call as its own statement, never chained.
//
// tcell.GetColor resolves W3C names AND "#rrggbb" hex directly, so unlike
// the Rust/Go(lipgloss) exporters this needs no bespoke hex/name table —
// only the ANSI "bright" variants (which aren't W3C names) need mapping to
// their palette index.
//
// List item text is parsed for style tags ("[red]...[-]") by default;
// TextView only if SetDynamicColors(true) is called (which this exporter
// never does); Table cells and TreeNode text are never parsed. tview.Escape
// is applied to every literal string uniformly regardless of widget — it's
// a no-op when there's no literal "[", so this is always safe and one rule
// to remember beats tracking per-widget exceptions.

interface Ctx {
  stmts: string[];
  usedVars: Set<string>;
  modals: { pageName: string; gridVar: string }[];
  colorMode: ExportColorMode;
  ident: (name: string) => string;
  // Distinct event-handler names referenced by any widget, so a single
  // no-arg `func <name>() {}` stub gets emitted once per name regardless
  // of how many widget types (each with their own real callback signature)
  // reference it.
  handlerStubs: Set<string>;
}

export function exportToTview(root: ComponentNode, colorMode: ExportColorMode = 'truecolor'): string {
  const usedVars = new Set(['app', 'tview', 'tcell', 'main', 'event']);
  const ctx: Ctx = {
    stmts: [],
    usedVars,
    modals: [],
    colorMode,
    ident: createIdentGenerator(usedVars, 'v'),
    handlerStubs: new Set(),
  };

  const topNodes = root.type === 'Screen' ? root.children : [root];
  const rootDirection = root.layout.direction === 'row' ? 'FlexColumn' : 'FlexRow';
  const rootVar = ident('root', ctx);
  ctx.stmts.push(`${rootVar} := tview.NewFlex()`);
  ctx.stmts.push(`${rootVar}.SetDirection(tview.${rootDirection})`);
  const rootGap = Number(root.layout.gap ?? 0);
  const rootIsRow = root.layout.direction === 'row';
  let rootFirst = true;
  for (const child of topNodes) {
    const expr = genNode(child, ctx);
    if (!expr) continue; // Modal — registered as its own page instead
    if (!rootFirst && rootGap > 0) addSpacer(rootVar, ctx, rootGap);
    rootFirst = false;
    const [fixedSize, proportion] = itemSizing(child, rootIsRow);
    ctx.stmts.push(`${rootVar}.AddItem(${expr}, ${fixedSize}, ${proportion}, false)`);
  }

  let setRootTarget = rootVar;
  if (ctx.modals.length > 0) {
    const pagesVar = ident('pages', ctx);
    ctx.stmts.push(`${pagesVar} := tview.NewPages()`);
    ctx.stmts.push(`${pagesVar}.AddPage("main", ${rootVar}, true, true)`);
    for (const { pageName, gridVar } of ctx.modals) {
      // both pages start visible: the exported design shows the modal open.
      // call pages.HidePage("${pageName}") / ShowPage to wire real dismissal.
      ctx.stmts.push(`${pagesVar}.AddPage(${goStr(pageName)}, ${gridVar}, true, true)`);
    }
    setRootTarget = pagesVar;
  }

  const body = ctx.stmts.map((s) => `\t${s}`).join('\n');

  return `package main

import (
	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
)

func main() {
	app := tview.NewApplication()

${body}

	app.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		if event.Key() == tcell.KeyEscape || event.Rune() == 'q' {
			app.Stop()
		}
		return event
	})

	if err := app.SetRoot(${setRootTarget}, true).Run(); err != nil {
		panic(err)
	}
}
${buildHandlerStubs(ctx)}`;
}

/**
 * One no-arg stub per distinct handler name, regardless of which widget
 * type(s) reference it — each real tview callback signature (SetChangedFunc,
 * SetSelectedFunc, SetInputCapture, all with different parameter lists) is
 * adapted down to a no-arg call inline at the call site, so a name shared
 * across widget types (e.g. defaultEvents' "handleChange" on both a
 * Checkbox and a TextInput) never collides on a single Go function's
 * signature.
 */
function buildHandlerStubs(ctx: Ctx): string {
  if (!ctx.handlerStubs.size) return '';
  return (
    '\n' +
    [...ctx.handlerStubs]
      .sort()
      .map((name) => `func ${name}() {\n\t// TODO: implement\n}\n`)
      .join('\n')
  );
}

/** Returns a Go expression (a variable name) for the node, or '' if it registered itself as a Modal page instead of a normal child. */
function genNode(node: ComponentNode, ctx: Ctx): string {
  if (node.hidden) return '';

  switch (node.type) {
    case 'Modal': {
      const contentVar = buildBoxLike(node, ctx);
      const width = typeof node.props.width === 'number' ? node.props.width : 40;
      const height = typeof node.props.height === 'number' ? node.props.height : 12;
      const gridVar = ident(`${node.name}Modal`, ctx);
      ctx.stmts.push(`${gridVar} := tview.NewGrid()`);
      ctx.stmts.push(`${gridVar}.SetRows(0, ${height}, 0)`);
      ctx.stmts.push(`${gridVar}.SetColumns(0, ${width}, 0)`);
      ctx.stmts.push(`${gridVar}.AddItem(${contentVar}, 1, 1, 1, 1, 0, 0, false)`);
      ctx.modals.push({ pageName: `modal-${slug(node.name)}`, gridVar });
      return '';
    }

    case 'Screen':
    case 'Box':
      return buildBoxLike(node, ctx);

    case 'Grid':
      return buildGrid(node, ctx);

    case 'Spacer':
      return 'tview.NewBox()';

    case 'Separator': {
      // tview has no dedicated rule/divider primitive — a TextView filled with
      // the repeated line character is the closest real equivalent.
      const orientation = (node.props.orientation as string) || 'horizontal';
      const lineStyle = (node.props.lineStyle as string) || 'single';
      const char = getSeparatorChar(lineStyle, orientation);
      const content =
        orientation === 'vertical'
          ? Array(typeof node.props.height === 'number' ? node.props.height : 5)
              .fill(char)
              .join('\n')
          : char.repeat(typeof node.props.width === 'number' ? node.props.width : 20);
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(`${varName}.SetText(${tviewText(content)})`);
      applyTextColor(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Text': {
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(`${varName}.SetText(${tviewText((node.props.content as string) || 'Text')})`);
      applyTextColor(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Button': {
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewButton(${tviewText((node.props.label as string) || 'Button')})`);
      if (node.style.color) ctx.stmts.push(`${varName}.SetLabelColor(${colorExpr(node.style.color, ctx.colorMode)})`);
      if (node.events.onClick) {
        ctx.handlerStubs.add(node.events.onClick);
        ctx.stmts.push(`${varName}.SetSelectedFunc(${node.events.onClick})`);
      }
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'TextInput': {
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewInputField()`);
      ctx.stmts.push(`${varName}.SetPlaceholder(${tviewText((node.props.placeholder as string) || '')})`);
      if (node.props.value) ctx.stmts.push(`${varName}.SetText(${tviewText(node.props.value as string)})`);
      if (node.events.onChange) {
        ctx.handlerStubs.add(node.events.onChange);
        ctx.stmts.push(`${varName}.SetChangedFunc(func(text string) { ${node.events.onChange}() })`);
      }
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'TextArea': {
      // Real tview.TextArea (distinct from the single-line InputField above).
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextArea()`);
      ctx.stmts.push(`${varName}.SetPlaceholder(${tviewText((node.props.placeholder as string) || '')})`);
      if (node.props.value) ctx.stmts.push(`${varName}.SetText(${tviewText(node.props.value as string)}, false)`);
      if (node.events.onChange) {
        ctx.handlerStubs.add(node.events.onChange);
        ctx.stmts.push(`${varName}.SetChangedFunc(func() { ${node.events.onChange}() })`);
      }
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Checkbox': {
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewCheckbox()`);
      ctx.stmts.push(`${varName}.SetLabel(${tviewText(`${(node.props.label as string) || 'Checkbox'} `)})`);
      ctx.stmts.push(`${varName}.SetChecked(${!!node.props.checked})`);
      ctx.stmts.push(`${varName}.SetCheckedString(${tviewText((node.props.checkedIcon as string) || 'X')})`);
      ctx.stmts.push(`${varName}.SetUncheckedString(${tviewText((node.props.uncheckedIcon as string) || ' ')})`);
      if (node.events.onChange) {
        ctx.handlerStubs.add(node.events.onChange);
        ctx.stmts.push(`${varName}.SetChangedFunc(func(checked bool) { ${node.events.onChange}() })`);
      }
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Radio': {
      // tview has no standalone radio-group primitive. Checkbox is the
      // closest real interactive widget; wire mutual exclusion across
      // sibling Radios yourself with a shared SetChangedFunc.
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewCheckbox()`);
      ctx.stmts.push(`${varName}.SetLabel(${tviewText(`${(node.props.label as string) || 'Radio'} `)})`);
      ctx.stmts.push(`${varName}.SetChecked(${!!node.props.checked})`);
      ctx.stmts.push(`${varName}.SetCheckedString(${tviewText((node.props.selectedIcon as string) || '●')})`);
      ctx.stmts.push(`${varName}.SetUncheckedString(${tviewText((node.props.unselectedIcon as string) || '○')})`);
      if (node.events.onChange) {
        ctx.handlerStubs.add(node.events.onChange);
        ctx.stmts.push(`${varName}.SetChangedFunc(func(checked bool) { ${node.events.onChange}() })`);
      }
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Toggle': {
      const varName = ident(node.name, ctx);
      const on = !!(node.props.value ?? node.props.checked);
      ctx.stmts.push(`${varName} := tview.NewCheckbox()`);
      ctx.stmts.push(`${varName}.SetLabel(${tviewText(`${(node.props.label as string) || ''} `)})`);
      ctx.stmts.push(`${varName}.SetChecked(${on})`);
      ctx.stmts.push(`${varName}.SetCheckedString(${tviewText(' ON ')})`);
      ctx.stmts.push(`${varName}.SetUncheckedString(${tviewText(' OFF ')})`);
      if (node.events.onChange) {
        ctx.handlerStubs.add(node.events.onChange);
        ctx.stmts.push(`${varName}.SetChangedFunc(func(checked bool) { ${node.events.onChange}() })`);
      }
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Select': {
      const varName = ident(node.name, ctx);
      const options = (node.props.options as string[]) || ['Option 1'];
      const idx = Math.max(0, Math.min(Number(node.props.selectedIndex ?? 0), options.length - 1));
      ctx.stmts.push(`${varName} := tview.NewDropDown()`);
      ctx.stmts.push(
        `${varName}.SetOptions([]string{${options.map(tviewText).join(', ')}}, nil)`
      );
      ctx.stmts.push(`${varName}.SetCurrentOption(${idx})`);
      if (node.events.onChange) {
        ctx.handlerStubs.add(node.events.onChange);
        ctx.stmts.push(`${varName}.SetSelectedFunc(func(text string, index int) { ${node.events.onChange}() })`);
      }
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Spinner': {
      const preset = SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
      const idx = Math.max(0, Math.min(Number(node.props.frame ?? 0), preset.frames.length - 1));
      const label = (node.props.label as string) ?? 'Loading...';
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(
        `${varName}.SetText(${tviewText(label ? `${preset.frames[idx]} ${label}` : preset.frames[idx])}) // static frame; drive with a time.Ticker + app.QueueUpdateDraw for a live spinner`
      );
      applyTextColor(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'ProgressBar': {
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      const width = typeof node.props.width === 'number' ? node.props.width : 20;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const bar = renderBar((node.props.barStyle as string) || 'blocks', width - (showPercent ? 5 : 0), pct);
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(
        `${varName}.SetText(${tviewText(showPercent ? `${bar} ${pct.toFixed(0)}%` : bar)}) // tview has no built-in progress bar; update this text as work completes`
      );
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Gauge': {
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      const width = typeof node.props.width === 'number' ? node.props.width : 24;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const label = (node.props.label as string) || 'Gauge';
      const overlayText = showPercent ? `${label} ${pct.toFixed(0)}%` : label;
      const bar = renderGauge((node.props.barStyle as string) || 'blocks', width, pct, overlayText);
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(
        `${varName}.SetText(${tviewText(bar)}) // tview has no built-in gauge; update this text as the value changes`
      );
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Sparkline': {
      const data = (node.props.data as number[]) || [];
      const width = typeof node.props.width === 'number' ? node.props.width : 20;
      const max = typeof node.props.max === 'number' ? node.props.max : undefined;
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(
        `${varName}.SetText(${tviewText(renderSparkline(data, width, max))}) // tview has no built-in sparkline; update this text as data changes`
      );
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Log': {
      // Real tview.TextView scrolling: SetScrollable(true) discards lines
      // above the visible area, and ScrollToEnd() is tview's actual
      // "jump to bottom" API — confirmed via rivo/tview's docs/source,
      // not a hand-rolled tail slice like the other 4 exporters need.
      const lines = (node.props.lines as string[]) || [];
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(`${varName}.SetScrollable(true)`);
      ctx.stmts.push(`${varName}.SetText(${tviewText(lines.join('\n'))})`);
      ctx.stmts.push(`${varName}.ScrollToEnd()`);
      applyTextColor(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'StatusBar': {
      const items = (node.props.items as { key?: string; label?: string }[]) || [];
      const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(`${varName}.SetText(${tviewText(renderStatusBar(items, gap))})`);
      applyTextColor(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Toast': {
      // tview has no notification/toast manager; hand-rolled preview.
      const message = (node.props.message as string) || '';
      const variant = (node.props.variant as string) || 'info';
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(`${varName}.SetText(${tviewText(renderToast(message, variant))})`);
      applyTextColor(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'List':
    case 'Menu': {
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewList()`);
      ctx.stmts.push(`${varName}.ShowSecondaryText(false)`);
      const items = (node.props.items as unknown[]) || [];
      const multiSelect = node.type === 'List' && !!node.props.multiSelect;
      for (const item of items) {
        const d =
          typeof item === 'string'
            ? { label: item, icon: node.type === 'List' ? '•' : '', hotkey: '' }
            : (item as { label?: string; icon?: string; hotkey?: string; checked?: boolean });
        const checkbox = multiSelect ? `[${d.checked ? 'x' : ' '}] ` : '';
        const text = `${checkbox}${d.icon ? `${d.icon} ` : ''}${d.label || 'Item'}${d.hotkey ? `  ${d.hotkey}` : ''}`;
        ctx.stmts.push(`${varName}.AddItem(${tviewText(text)}, "", 0, nil)`);
      }
      if (node.props.selectedIndex != null)
        ctx.stmts.push(`${varName}.SetCurrentItem(${Number(node.props.selectedIndex)})`);
      if (node.type === 'List' && node.events.onSelect) {
        ctx.handlerStubs.add(node.events.onSelect);
        ctx.stmts.push(
          `${varName}.SetSelectedFunc(func(index int, mainText, secondaryText string, shortcut rune) { ${node.events.onSelect}() })`
        );
      }
      applyKeyCapture(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Tree': {
      const items = (node.props.items as unknown[]) || [];
      let treeRootVar: string;
      if (items.length === 1) {
        treeRootVar = buildTreeNode(items[0], ctx, node.name);
      } else {
        treeRootVar = ident(`${node.name}Root`, ctx);
        ctx.stmts.push(`${treeRootVar} := tview.NewTreeNode("")`);
        for (const item of items) {
          const childVar = buildTreeNode(item, ctx, node.name);
          ctx.stmts.push(`${treeRootVar}.AddChild(${childVar})`);
        }
      }
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTreeView()`);
      ctx.stmts.push(`${varName}.SetRoot(${treeRootVar})`);
      ctx.stmts.push(`${varName}.SetCurrentNode(${treeRootVar})`);
      applyKeyCapture(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Table': {
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTable()`);
      const columns = (node.props.columns as string[]) || ['Column 1', 'Column 2'];
      const rows = (node.props.rows as string[][]) || [];
      columns.forEach((col, ci) => {
        ctx.stmts.push(`${varName}.SetCell(0, ${ci}, tview.NewTableCell(${tviewText(col)}))`);
      });
      rows.forEach((row, ri) => {
        columns.forEach((_, ci) => {
          ctx.stmts.push(
            `${varName}.SetCell(${ri + 1}, ${ci}, tview.NewTableCell(${tviewText(String(row[ci] ?? ''))}))`
          );
        });
      });
      applyKeyCapture(varName, node, ctx);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Tabs': {
      // tview has no tab-bar primitive; a real tab strip is a Flex of
      // Buttons (one per tab) driving a Pages switcher below it. This
      // renders a static preview of the current selection instead.
      const active = Number(node.props.activeTab ?? 0);
      const text = ((node.props.tabs as unknown[]) || [])
        .map((tab, i) => {
          const label = typeof tab === 'string' ? tab : (tab as { label?: string }).label || 'Tab';
          return i === active ? `[ ${label} ]` : `  ${label}  `;
        })
        .join('');
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(
        `${varName}.SetText(${tviewText(text)}) // static preview; build real tabs with a Flex of Buttons + tview.Pages`
      );
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    case 'Breadcrumb': {
      const sep = (node.props.separator as string) || ' / ';
      const text = ((node.props.items as unknown[]) || [])
        .map((i) => (typeof i === 'string' ? i : (i as { label?: string }).label || ''))
        .join(sep);
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(`${varName}.SetText(${tviewText(text)})`);
      applyBoxStyle(varName, node, ctx);
      return varName;
    }

    default: {
      const varName = ident(node.name, ctx);
      ctx.stmts.push(`${varName} := tview.NewTextView()`);
      ctx.stmts.push(`${varName}.SetText(${tviewText(node.type)})`);
      return varName;
    }
  }
}

/** Screen/Box (and Modal's own content): a Flex holding its children, with Box-level styling applied last. */
function buildBoxLike(node: ComponentNode, ctx: Ctx): string {
  const isRow = node.layout.direction === 'row';
  const varName = ident(node.name, ctx);
  ctx.stmts.push(`${varName} := tview.NewFlex()`);
  ctx.stmts.push(`${varName}.SetDirection(tview.${isRow ? 'FlexColumn' : 'FlexRow'})`);
  const gap = Number(node.layout.gap ?? 0);
  let first = true;
  for (const child of node.children) {
    const expr = genNode(child, ctx);
    if (!expr) continue; // Modal — registered as its own page
    if (!first && gap > 0) addSpacer(varName, ctx, gap);
    first = false;
    const [fixedSize, proportion] = itemSizing(child, isRow);
    ctx.stmts.push(`${varName}.AddItem(${expr}, ${fixedSize}, ${proportion}, false)`);
  }
  applyBoxStyle(varName, node, ctx);
  return varName;
}

/** tview.Flex has no gap concept — approximate with a fixed-size tview.NewBox() spacer between items. */
function addSpacer(parentVar: string, ctx: Ctx, size: number): void {
  ctx.stmts.push(`${parentVar}.AddItem(tview.NewBox(), ${size}, 0, false)`);
}

function buildGrid(node: ComponentNode, ctx: Ctx): string {
  const cols = Math.max(1, Number(node.layout.columns ?? 2));
  const rows = Math.max(1, Number(node.layout.rows ?? Math.ceil(node.children.length / cols)));
  const varName = ident(node.name, ctx);
  ctx.stmts.push(`${varName} := tview.NewGrid()`);
  ctx.stmts.push(`${varName}.SetRows(${Array(rows).fill(0).join(', ')})`);
  ctx.stmts.push(`${varName}.SetColumns(${Array(cols).fill(0).join(', ')})`);
  node.children.forEach((child, i) => {
    const expr = genNode(child, ctx);
    if (!expr) return; // Modal — registered as its own page
    const row = Math.floor(i / cols);
    const col = i % cols;
    ctx.stmts.push(`${varName}.AddItem(${expr}, ${row}, ${col}, 1, 1, 0, 0, false)`);
  });
  applyBoxStyle(varName, node, ctx);
  return varName;
}

function buildTreeNode(item: unknown, ctx: Ctx, scope: string): string {
  const d =
    typeof item === 'string'
      ? { label: item, expanded: false, children: [] as unknown[] }
      : (item as { label?: string; expanded?: boolean; children?: unknown[] });
  const varName = ident(`${scope}Node`, ctx);
  ctx.stmts.push(`${varName} := tview.NewTreeNode(${tviewText(d.label || 'Item')})`);
  ctx.stmts.push(`${varName}.SetExpanded(${!!d.expanded})`);
  for (const child of d.children || []) {
    const childVar = buildTreeNode(child, ctx, scope);
    ctx.stmts.push(`${varName}.AddChild(${childVar})`);
  }
  return varName;
}

/** Border/title/border-color/background — the Box-level styling applied after a primitive's own Set* calls. */
function applyBoxStyle(varName: string, node: ComponentNode, ctx: Ctx): void {
  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor)
    ctx.stmts.push(`${varName}.SetBackgroundColor(${colorExpr(backgroundColor, ctx.colorMode)})`);

  if (!node.style.border) return;
  ctx.stmts.push(`${varName}.SetBorder(true)`);
  if (node.style.borderColor)
    ctx.stmts.push(`${varName}.SetBorderColor(${colorExpr(node.style.borderColor, ctx.colorMode)})`);
  if (node.name && node.name !== node.type) ctx.stmts.push(`${varName}.SetTitle(${tviewText(` ${node.name} `)})`);
}

function applyTextColor(varName: string, node: ComponentNode, ctx: Ctx): void {
  if (node.style.color) ctx.stmts.push(`${varName}.SetTextColor(${colorExpr(node.style.color, ctx.colorMode)})`);
}

/** Box.SetInputCapture — the real, generic tview mechanism for raw key handling on any primitive. */
function applyKeyCapture(varName: string, node: ComponentNode, ctx: Ctx): void {
  if (!node.events.onKeyPress) return;
  ctx.handlerStubs.add(node.events.onKeyPress);
  ctx.stmts.push(
    `${varName}.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey { ${node.events.onKeyPress}(); return event })`
  );
}

/** [fixedSize, proportion] for Flex.AddItem, based on the child's size along the flex axis. */
function itemSizing(node: ComponentNode, isRow: boolean): [number, number] {
  const value = isRow ? node.props.width : node.props.height;
  if (typeof value === 'number') return [value, 0];
  return [0, 1];
}

function colorExpr(value: string, colorMode: ExportColorMode): string {
  const idx = ansi16IndexOfName(value);

  if (colorMode === 'ansi16') {
    // Uniformly indexed (tcell.PaletteColor) so the terminal's own palette
    // decides the final RGB — that's the whole point of ansi16 mode. Whether
    // tcell.GetColor("red") happens to resolve to a fixed W3C RGB or an
    // adaptive index isn't documented, so PaletteColor is the only form
    // guaranteed to be palette-relative for every one of the 16 slots.
    if (idx != null) return `tcell.PaletteColor(${idx})`;
    if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return `tcell.PaletteColor(${nearestAnsi16(value)})`;
  } else if (colorMode === 'ansi256') {
    // Same tcell.PaletteColor call as ansi16 — it's real for the full 0-255
    // xterm palette (confirmed via pkg.go.dev), so a hex just gets matched
    // against the wider 256-color table instead of collapsing to 16.
    if (idx != null) return `tcell.PaletteColor(${idx})`;
    if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return `tcell.PaletteColor(${nearestAnsi256(value)})`;
  } else if (idx != null && idx >= 8) {
    // Truecolor mode: "bright" names aren't real W3C names GetColor understands,
    // so they still need the palette-index form even here.
    return `tcell.PaletteColor(${idx})`;
  }

  return `tcell.GetColor(${goStr(value)})`;
}

function tviewText(s: string): string {
  return `tview.Escape(${goStr(s)})`;
}

function goStr(s: string): string {
  return `"${escGo(s)}"`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

function ident(name: string, ctx: Ctx): string {
  return ctx.ident(name);
}
