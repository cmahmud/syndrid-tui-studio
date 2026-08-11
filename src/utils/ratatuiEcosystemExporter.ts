import type { ComponentEcosystemSpec, ComponentNode, SyndridProjectData } from '../types';
import { RATATUI_ADAPTERS, RATATUI_ECOSYSTEM_LIBRARIES } from '../data/ratatuiEcosystem';

export interface EcosystemBinding {
  componentId: string;
  componentName: string;
  componentType: string;
  spec: ComponentEcosystemSpec;
}

export interface RatatuiEcosystemExport {
  libraries: typeof RATATUI_ECOSYSTEM_LIBRARIES;
  bindings: EcosystemBinding[];
  cargoSnippet: string;
  rustPlan: string;
  warnings: string[];
}

export function collectEcosystemBindings(node: ComponentNode | null, out: EcosystemBinding[] = []): EcosystemBinding[] {
  if (!node) return out;
  if (node.prototype?.ecosystem && node.prototype.ecosystem.adapter !== 'native') {
    out.push({ componentId: node.id, componentName: node.name, componentType: node.type, spec: node.prototype.ecosystem });
  }
  node.children.forEach((child) => collectEcosystemBindings(child, out));
  return out;
}

function crateVersion(id: string, fallback: string): string {
  return RATATUI_ECOSYSTEM_LIBRARIES.find((entry) => entry.id === id)?.version ?? fallback;
}

function stringLiteral(value: string): string { return JSON.stringify(value); }

export function exportRatatuiEcosystem(
  root: ComponentNode | null,
  project: Pick<SyndridProjectData, 'imageAssets'>
): RatatuiEcosystemExport {
  const bindings = collectEcosystemBindings(root);
  const adapterIds = new Set(bindings.map((binding) => binding.spec.adapter));
  const embedded = bindings.some((binding) => binding.spec.embedded?.enabled);
  const warnings: string[] = [];
  const dependencies = new Map<string, string>();

  dependencies.set('ratatui', `ratatui = { version = "${crateVersion('ratatui', '0.30.2')}", features = ["crossterm"] }`);
  if (adapterIds.has('textarea')) dependencies.set('ratatui-textarea', `ratatui-textarea = { version = "${crateVersion('ratatui-textarea', '0.9.2')}", features = ["crossterm", "search", "serde"] }`);
  if (adapterIds.has('image')) dependencies.set('ratatui-image', `ratatui-image = { version = "${crateVersion('ratatui-image', '11.0.6')}", default-features = false, features = ["crossterm", "image-defaults", "serde"] }`);
  if ([...adapterIds].some((id) => ['big-text', 'card', 'popup', 'prompt', 'scrollview'].includes(id))) dependencies.set('tui-widgets', `tui-widgets = { version = "${crateVersion('tui-widgets', '0.7.10')}", features = ["big-text", "cards", "popup", "prompts", "scrollbar", "scrollview"] }`);
  if (adapterIds.has('tree-widget')) dependencies.set('tui-tree-widget', `tui-tree-widget = "${crateVersion('tui-tree-widget', '0.24.1')}"`);
  if (adapterIds.has('widget-list')) dependencies.set('tui-widget-list', `tui-widget-list = "${crateVersion('tui-widget-list', '0.15.3')}"`);
  if (adapterIds.has('terminal')) dependencies.set('tui-term', `tui-term = { version = "${crateVersion('tui-term', '0.3.4')}", features = ["unstable"] }`);
  if (adapterIds.has('interactive')) dependencies.set('ratatui-interact', `ratatui-interact = "${crateVersion('ratatui-interact', '0.5.3')}"`);
  if (adapterIds.has('syntax-highlight')) {
    dependencies.set('tui-syntax-highlight', `tui-syntax-highlight = { version = "${crateVersion('tui-syntax-highlight', '0.2.0')}", default-features = false, features = ["regex-fancy", "termprofile"] }`);
    dependencies.set('termprofile', `termprofile = { version = "${crateVersion('termprofile', '0.2.4')}", features = ["convert", "ratatui"] }`);
  }
  if (adapterIds.has('node-graph')) dependencies.set('tui-nodes', `tui-nodes = "${crateVersion('tui-nodes', '0.10.0')}"`);
  if (adapterIds.has('ansi-text')) dependencies.set('ansi-to-tui', `ansi-to-tui = "${crateVersion('ansi-to-tui', '8.0.1')}"`);
  if (embedded) dependencies.set('mousefood', `mousefood = { version = "${crateVersion('mousefood', '0.5.2')}", optional = true, default-features = false, features = ["std", "fonts", "framebuffer"] }`);

  for (const binding of bindings) {
    const definition = RATATUI_ADAPTERS.find((entry) => entry.id === binding.spec.adapter);
    if (!definition) { warnings.push(`${binding.componentName}: unknown adapter ${binding.spec.adapter}`); continue; }
    if (binding.spec.adapter === 'image') {
      const assetId = binding.spec.image?.assetId;
      if (!assetId) warnings.push(`${binding.componentName}: ratatui-image adapter has no image asset bound.`);
      else if (!project.imageAssets.some((asset) => asset.id === assetId)) warnings.push(`${binding.componentName}: image asset ${assetId} does not exist in this project.`);
    }
    if (binding.spec.adapter === 'terminal' && !binding.spec.terminal?.command) warnings.push(`${binding.componentName}: tui-term adapter has no command configured.`);
  }

  const featureBlock = embedded ? '\n[features]\ndefault = []\nembedded-display = ["dep:mousefood"]\n' : '';
  const cargoSnippet = `[dependencies]\n${[...dependencies.values()].sort().join('\n')}${featureBlock}`;

  const lines: string[] = [
    '// Syndrid Ratatui ecosystem integration plan',
    '// Generated from canonical per-component .tui adapter metadata.',
    '// Allocate state once in the application model; Frame rendering must stay side-effect free.',
    '',
  ];

  for (const binding of bindings) {
    const adapter = RATATUI_ADAPTERS.find((entry) => entry.id === binding.spec.adapter);
    lines.push(`// ${binding.componentName} (${binding.componentType}, ${binding.componentId})`);
    lines.push(`// adapter: ${adapter?.label ?? binding.spec.adapter}; crate: ${adapter?.library ?? 'ratatui'}`);
    switch (binding.spec.adapter) {
      case 'textarea':
        lines.push(`// state: ratatui_textarea::TextArea<'static>; search=${!!binding.spec.textarea?.search}; soft_wrap=${!!binding.spec.textarea?.softWrap}; tab_width=${binding.spec.textarea?.tabWidth ?? 4}`);
        lines.push('// event path: feed focused crossterm key events into TextArea::input(); render the stateful TextArea widget in this component rect.');
        break;
      case 'image': {
        const asset = project.imageAssets.find((item) => item.id === binding.spec.image?.assetId);
        lines.push(`// source=${asset ? stringLiteral(asset.source) : '<unbound>'}; protocol=${binding.spec.image?.protocol ?? 'auto'}; fit=${binding.spec.image?.fit ?? 'contain'}; fallback=${binding.spec.image?.fallback ?? 'alt-text'}`);
        lines.push('// state: one ratatui_image::protocol::StatefulProtocol created by Picker; render via StatefulImage and resize protocol when the terminal rect changes.');
        break;
      }
      case 'big-text': lines.push('// render with tui_widgets::big_text; derive glyph sizing from the resolved Syndrid component rect.'); break;
      case 'card': lines.push('// render with tui_widgets card primitives; map Syndrid border/title/style tokens without duplicating state.'); break;
      case 'popup': lines.push('// render with tui_widgets popup/overlay primitives after base content so z-order remains deterministic.'); break;
      case 'prompt': lines.push('// persist prompt state in the app model; map focused input events through the prompt API.'); break;
      case 'scrollview':
        lines.push(`// persist ScrollViewState; axis=${binding.spec.scroll?.axis ?? 'vertical'}; scrollbar=${binding.spec.scroll?.showScrollbar ?? true}; step=${binding.spec.scroll?.step ?? 1}`);
        break;
      case 'tree-widget': lines.push('// persist tui_tree_widget::TreeState and map Syndrid hierarchy/expanded selection into TreeItem values.'); break;
      case 'widget-list': lines.push('// persist tui_widget_list::ListState and render arbitrary widget rows while retaining component selection semantics.'); break;
      case 'terminal':
        lines.push(`// spawn PTY/controller outside render(); command=${stringLiteral(binding.spec.terminal?.command ?? '')}; cwd=${stringLiteral(binding.spec.terminal?.cwd ?? '')}; read_only=${binding.spec.terminal?.readOnly ?? true}`);
        lines.push('// render the vt100 screen through tui_term::widget::PseudoTerminal; forward input only when focused and read_only=false.');
        break;
      case 'syntax-highlight':
        lines.push(`// syntax language=${stringLiteral(binding.spec.syntax?.language ?? 'rust')}; theme=${stringLiteral(binding.spec.syntax?.theme ?? '')}; line_numbers=${binding.spec.syntax?.lineNumbers ?? false}`);
        lines.push('// cache tui-syntax-highlight output by content/language/theme; use termprofile conversion for terminal color capability.');
        break;
      case 'interactive': lines.push(`// ratatui-interact focus/hit-test: mouse=${binding.spec.interaction?.mouse ?? true}; hover=${binding.spec.interaction?.hover ?? true}; click=${binding.spec.interaction?.click ?? true}`); break;
      case 'node-graph': lines.push(`// tui-nodes graph: orientation=${binding.spec.nodeGraph?.orientation ?? 'horizontal'}; persist graph/navigation state outside render.`); break;
      case 'ansi-text': lines.push('// parse ANSI once with ansi-to-tui and cache resulting Text/Lines until source content changes.'); break;
      default: lines.push('// native Ratatui/tui-widgets adapter; preserve Syndrid responsive/state semantics.'); break;
    }
    if (binding.spec.embedded?.enabled) lines.push(`// embedded output: mousefood target=${binding.spec.embedded.target}; color=${binding.spec.embedded.colorMode}; desktop input remains separate.`);
    lines.push('');
  }
  if (!bindings.length) lines.push('// No non-native ecosystem adapters are currently assigned.');

  return { libraries: RATATUI_ECOSYSTEM_LIBRARIES, bindings, cargoSnippet, rustPlan: lines.join('\n'), warnings };
}
