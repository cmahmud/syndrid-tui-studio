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

export function collectEcosystemBindings(
  node: ComponentNode | null,
  out: EcosystemBinding[] = []
): EcosystemBinding[] {
  if (!node) return out;
  if (node.prototype?.ecosystem && node.prototype.ecosystem.adapter !== 'native') {
    out.push({
      componentId: node.id,
      componentName: node.name,
      componentType: node.type,
      spec: node.prototype.ecosystem,
    });
  }
  node.children.forEach((child) => collectEcosystemBindings(child, out));
  return out;
}

function crateVersion(id: string): string | undefined {
  const library = RATATUI_ECOSYSTEM_LIBRARIES.find((entry) => entry.id === id);
  return library && library.version !== 'managed' ? library.version : undefined;
}

function stringLiteral(value: string): string {
  return JSON.stringify(value);
}

export function exportRatatuiEcosystem(
  root: ComponentNode | null,
  project: Pick<SyndridProjectData, 'imageAssets'>
): RatatuiEcosystemExport {
  const bindings = collectEcosystemBindings(root);
  const adapterIds = new Set(bindings.map((binding) => binding.spec.adapter));
  const embedded = bindings.some((binding) => binding.spec.embedded?.enabled);
  const warnings: string[] = [];

  const dependencies = new Map<string, string>();
  dependencies.set('ratatui', `ratatui = { version = "${crateVersion('ratatui') ?? '0.30'}", features = ["crossterm"] }`);

  if (adapterIds.has('textarea')) {
    dependencies.set(
      'ratatui-textarea',
      `ratatui-textarea = { version = "${crateVersion('ratatui-textarea') ?? '0.9'}", features = ["crossterm", "search", "serde"] }`
    );
  }
  if (adapterIds.has('image')) {
    dependencies.set(
      'ratatui-image',
      `ratatui-image = { version = "${crateVersion('ratatui-image') ?? '11'}", default-features = false, features = ["crossterm", "image-defaults", "serde"] }`
    );
  }
  if ([...adapterIds].some((id) => ['big-text', 'card', 'popup', 'prompt', 'scrollview'].includes(id))) {
    dependencies.set(
      'tui-widgets',
      `tui-widgets = { version = "${crateVersion('tui-widgets') ?? '0.7'}", features = ["big-text", "cards", "popup", "prompts", "scrollbar", "scrollview"] }`
    );
  }
  if (adapterIds.has('ansi-text')) {
    dependencies.set('ansi-to-tui', `ansi-to-tui = "${crateVersion('ansi-to-tui') ?? '8'}"`);
  }
  if (embedded) {
    dependencies.set(
      'mousefood',
      `mousefood = { version = "${crateVersion('mousefood') ?? '0.5'}", optional = true, default-features = false, features = ["std", "fonts", "framebuffer"] }`
    );
  }

  for (const binding of bindings) {
    const definition = RATATUI_ADAPTERS.find((entry) => entry.id === binding.spec.adapter);
    if (!definition) {
      warnings.push(`${binding.componentName}: unknown adapter ${binding.spec.adapter}`);
      continue;
    }
    const library = RATATUI_ECOSYSTEM_LIBRARIES.find((entry) => entry.id === definition.library);
    if (library?.version === 'managed') {
      warnings.push(
        `${binding.componentName}: ${library.crateName} is an optional adapter; pin a project-approved version before production export.`
      );
    }
    if (binding.spec.adapter === 'image') {
      const assetId = binding.spec.image?.assetId;
      if (!assetId) warnings.push(`${binding.componentName}: ratatui-image adapter has no image asset bound.`);
      else if (!project.imageAssets.some((asset) => asset.id === assetId)) {
        warnings.push(`${binding.componentName}: image asset ${assetId} does not exist in this project.`);
      }
    }
  }

  const featureBlock = embedded
    ? '\n[features]\ndefault = []\nembedded-display = ["dep:mousefood"]\n'
    : '';
  const cargoSnippet = `[dependencies]\n${[...dependencies.values()].sort().join('\n')}${featureBlock}`;

  const lines: string[] = [
    '// Syndrid Ratatui ecosystem integration plan',
    '// Generated from canonical per-component .tui adapter metadata.',
    '// Keep component IDs stable so interaction/effect targeting remains deterministic.',
    '',
  ];

  for (const binding of bindings) {
    const adapter = RATATUI_ADAPTERS.find((entry) => entry.id === binding.spec.adapter);
    lines.push(`// ${binding.componentName} (${binding.componentType}, ${binding.componentId})`);
    lines.push(`// adapter: ${adapter?.label ?? binding.spec.adapter}`);
    lines.push(`// crate: ${adapter?.library ?? 'ratatui'}`);
    switch (binding.spec.adapter) {
      case 'textarea':
        lines.push(`// create ratatui_textarea::TextArea state; search=${!!binding.spec.textarea?.search}, soft_wrap=${!!binding.spec.textarea?.softWrap}, tab_width=${binding.spec.textarea?.tabWidth ?? 4}`);
        break;
      case 'image': {
        const asset = project.imageAssets.find((item) => item.id === binding.spec.image?.assetId);
        lines.push(`// image source: ${asset ? stringLiteral(asset.source) : '<unbound>'}`);
        lines.push(`// Picker protocol=${binding.spec.image?.protocol ?? 'auto'}; fit=${binding.spec.image?.fit ?? 'contain'}; fallback=${binding.spec.image?.fallback ?? 'alt-text'}`);
        break;
      }
      case 'scrollview':
        lines.push(`// persist ScrollViewState; axis=${binding.spec.scroll?.axis ?? 'vertical'}; scrollbar=${binding.spec.scroll?.showScrollbar ?? true}`);
        break;
      case 'terminal':
        lines.push(`// spawn PTY outside render(); command=${stringLiteral(binding.spec.terminal?.command ?? '')}; read_only=${binding.spec.terminal?.readOnly ?? true}`);
        break;
      case 'syntax-highlight':
        lines.push(`// highlight language=${stringLiteral(binding.spec.syntax?.language ?? 'rust')} theme=${stringLiteral(binding.spec.syntax?.theme ?? '')} before rendering; cache parsed/highlighted spans`);
        break;
      case 'interactive':
        lines.push(`// register deterministic focus/hit-test region; mouse=${binding.spec.interaction?.mouse ?? true}, hover=${binding.spec.interaction?.hover ?? true}`);
        break;
      case 'node-graph':
        lines.push(`// render graph orientation=${binding.spec.nodeGraph?.orientation ?? 'horizontal'}; persist graph state outside Frame rendering`);
        break;
      case 'ansi-text':
        lines.push('// parse ANSI input once with ansi-to-tui and render the resulting Ratatui Text/Lines; do not reparse per frame');
        break;
      default:
        lines.push('// use the selected tui-widgets adapter while preserving Syndrid layout/state semantics');
        break;
    }
    if (binding.spec.embedded?.enabled) {
      lines.push(`// embedded target: mousefood/${binding.spec.embedded.target}; color=${binding.spec.embedded.colorMode}`);
    }
    lines.push('');
  }

  if (!bindings.length) lines.push('// No non-native ecosystem adapters are currently assigned.');

  return {
    libraries: RATATUI_ECOSYSTEM_LIBRARIES,
    bindings,
    cargoSnippet,
    rustPlan: lines.join('\n'),
    warnings,
  };
}
