import { useMemo, useState } from 'react';
import { Boxes, Image, Monitor, Package, RotateCcw } from 'lucide-react';
import { useComponentStore, useProjectStore } from '../../stores';
import type { ComponentEcosystemSpec, ComponentNode, ImageAssetDefinition } from '../../types';
import {
  RATATUI_ADAPTERS,
  RATATUI_ECOSYSTEM_LIBRARIES,
  defaultEcosystemSpec,
  recommendedAdapterForType,
} from '../../data/ratatuiEcosystem';

const inputClass =
  'w-full px-1.5 py-1 bg-input border border-border/50 rounded text-[11px] focus:border-primary focus:outline-none';
const labelClass = 'text-[9px] text-muted-foreground uppercase tracking-wide block mb-0.5';

function mergeSpec(base: ComponentEcosystemSpec, patch: Partial<ComponentEcosystemSpec>): ComponentEcosystemSpec {
  return {
    ...base,
    ...patch,
    textarea: patch.textarea ? { ...base.textarea!, ...patch.textarea } : base.textarea,
    image: patch.image ? { ...base.image!, ...patch.image } : base.image,
    scroll: patch.scroll ? { ...base.scroll!, ...patch.scroll } : base.scroll,
    terminal: patch.terminal ? { ...base.terminal!, ...patch.terminal } : base.terminal,
    syntax: patch.syntax ? { ...base.syntax!, ...patch.syntax } : base.syntax,
    interaction: patch.interaction ? { ...base.interaction!, ...patch.interaction } : base.interaction,
    nodeGraph: patch.nodeGraph ? { ...base.nodeGraph!, ...patch.nodeGraph } : base.nodeGraph,
    embedded: patch.embedded ? { ...base.embedded!, ...patch.embedded } : base.embedded,
  };
}

export function EcosystemEditor({ component }: { component: ComponentNode }) {
  const componentStore = useComponentStore();
  const project = useProjectStore();
  const [assetSource, setAssetSource] = useState('');
  const recommended = recommendedAdapterForType(component.type);
  const ecosystem = useMemo(
    () => component.prototype?.ecosystem ?? defaultEcosystemSpec(recommended),
    [component.prototype?.ecosystem, recommended]
  );
  const adapterDefinition = RATATUI_ADAPTERS.find((item) => item.id === ecosystem.adapter);
  const library = RATATUI_ECOSYSTEM_LIBRARIES.find((item) => item.id === adapterDefinition?.library);

  const commit = (patch: Partial<ComponentEcosystemSpec>) => {
    componentStore.updateComponent(component.id, {
      prototype: {
        ...(component.prototype ?? {}),
        ecosystem: mergeSpec(ecosystem, patch),
      },
    });
  };

  const setAdapter = (adapter: ComponentEcosystemSpec['adapter']) => {
    const defaults = defaultEcosystemSpec(adapter);
    componentStore.updateComponent(component.id, {
      prototype: {
        ...(component.prototype ?? {}),
        ecosystem: { ...defaults, embedded: ecosystem.embedded ?? defaults.embedded },
      },
    });
  };

  const addImageAsset = () => {
    const source = assetSource.trim();
    if (!source) return;
    const id = `image-${Date.now().toString(36)}`;
    const name = source.split(/[\\/]/).pop() || 'Image';
    const spec = ecosystem.image ?? defaultEcosystemSpec('image').image!;
    const asset: ImageAssetDefinition = {
      id,
      name,
      source,
      fit: spec.fit,
      alignment: spec.alignment,
      protocol: spec.protocol,
      fallback: spec.fallback,
    };
    project.upsertImageAsset(asset);
    commit({ image: { ...spec, assetId: id } });
    setAssetSource('');
  };

  return (
    <section className="border-t border-border/40 pt-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <Boxes size={13} /> Ratatui ecosystem
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            Production adapter stored with this component in the .tui spec.
          </div>
        </div>
        <button
          className="p-1 rounded hover:bg-accent text-muted-foreground"
          title={`Reset to recommended adapter: ${recommended}`}
          onClick={() => setAdapter(recommended)}
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <div>
        <label className={labelClass}>Runtime adapter</label>
        <select
          className={inputClass}
          value={ecosystem.adapter}
          onChange={(event) => setAdapter(event.target.value as ComponentEcosystemSpec['adapter'])}
        >
          {RATATUI_ADAPTERS.map((adapter) => (
            <option key={adapter.id} value={adapter.id}>
              {adapter.label}
            </option>
          ))}
        </select>
        <div className="mt-1 rounded border border-border/40 bg-muted/20 p-2 text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1 text-foreground/90 font-medium">
            <Package size={10} /> {library?.crateName ?? 'ratatui'} {library?.version && library.version !== 'managed' ? `v${library.version}` : ''}
          </div>
          <div className="mt-0.5">{adapterDefinition?.description}</div>
        </div>
      </div>

      {ecosystem.adapter === 'textarea' && ecosystem.textarea && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-[10px]">
            <input type="checkbox" checked={ecosystem.textarea.search} onChange={(e) => commit({ textarea: { ...ecosystem.textarea!, search: e.target.checked } })} /> Search
          </label>
          <label className="flex items-center gap-2 text-[10px]">
            <input type="checkbox" checked={ecosystem.textarea.softWrap} onChange={(e) => commit({ textarea: { ...ecosystem.textarea!, softWrap: e.target.checked } })} /> Soft wrap
          </label>
          <label className="flex items-center gap-2 text-[10px]">
            <input type="checkbox" checked={ecosystem.textarea.lineNumbers} onChange={(e) => commit({ textarea: { ...ecosystem.textarea!, lineNumbers: e.target.checked } })} /> Line numbers
          </label>
          <div>
            <label className={labelClass}>Tab width</label>
            <input type="number" min={1} max={16} className={inputClass} value={ecosystem.textarea.tabWidth} onChange={(e) => commit({ textarea: { ...ecosystem.textarea!, tabWidth: Math.max(1, Math.min(16, Number(e.target.value) || 4)) } })} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Editor mode</label>
            <select className={inputClass} value={ecosystem.textarea.editorMode} onChange={(e) => commit({ textarea: { ...ecosystem.textarea!, editorMode: e.target.value as 'standard' | 'vim' } })}>
              <option value="standard">Standard</option>
              <option value="vim">Vim-style</option>
            </select>
          </div>
        </div>
      )}

      {ecosystem.adapter === 'image' && ecosystem.image && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-[10px] font-medium"><Image size={11} /> Image asset</div>
          <select className={inputClass} value={ecosystem.image.assetId ?? ''} onChange={(e) => commit({ image: { ...ecosystem.image!, assetId: e.target.value || undefined } })}>
            <option value="">No asset bound</option>
            {project.imageAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-1">
            <input className={inputClass} value={assetSource} onChange={(e) => setAssetSource(e.target.value)} placeholder="path/to/image.png" />
            <button className="px-2 text-[10px] rounded bg-secondary hover:bg-secondary/80" onClick={addImageAsset}>Add</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Fit</label>
              <select className={inputClass} value={ecosystem.image.fit} onChange={(e) => commit({ image: { ...ecosystem.image!, fit: e.target.value as typeof ecosystem.image.fit } })}>
                <option value="contain">Contain</option><option value="cover">Cover</option><option value="stretch">Stretch</option><option value="original">Original</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Protocol</label>
              <select className={inputClass} value={ecosystem.image.protocol} onChange={(e) => commit({ image: { ...ecosystem.image!, protocol: e.target.value as typeof ecosystem.image.protocol } })}>
                <option value="auto">Auto</option><option value="kitty">Kitty</option><option value="sixel">Sixel</option><option value="iterm2">iTerm2</option><option value="halfblocks">Half blocks</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Alignment</label>
              <select className={inputClass} value={ecosystem.image.alignment} onChange={(e) => commit({ image: { ...ecosystem.image!, alignment: e.target.value as typeof ecosystem.image.alignment } })}>
                <option value="start">Start</option><option value="center">Center</option><option value="end">End</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Fallback</label>
              <select className={inputClass} value={ecosystem.image.fallback} onChange={(e) => commit({ image: { ...ecosystem.image!, fallback: e.target.value as typeof ecosystem.image.fallback } })}>
                <option value="alt-text">Alt text</option><option value="placeholder">Placeholder</option><option value="hidden">Hidden</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={ecosystem.image.preserveAspectRatio} onChange={(e) => commit({ image: { ...ecosystem.image!, preserveAspectRatio: e.target.checked } })} /> Preserve aspect ratio</label>
        </div>
      )}

      {ecosystem.adapter === 'scrollview' && ecosystem.scroll && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Scroll axis</label>
            <select className={inputClass} value={ecosystem.scroll.axis} onChange={(e) => commit({ scroll: { ...ecosystem.scroll!, axis: e.target.value as typeof ecosystem.scroll.axis } })}>
              <option value="vertical">Vertical</option><option value="horizontal">Horizontal</option><option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Step</label>
            <input type="number" min={1} className={inputClass} value={ecosystem.scroll.step} onChange={(e) => commit({ scroll: { ...ecosystem.scroll!, step: Math.max(1, Number(e.target.value) || 1) } })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-[10px]"><input type="checkbox" checked={ecosystem.scroll.showScrollbar} onChange={(e) => commit({ scroll: { ...ecosystem.scroll!, showScrollbar: e.target.checked } })} /> Show scrollbar</label>
        </div>
      )}

      {ecosystem.adapter === 'terminal' && ecosystem.terminal && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-[10px] font-medium"><Monitor size={11} /> PTY command</div>
          <input className={inputClass} value={ecosystem.terminal.command ?? ''} onChange={(e) => commit({ terminal: { ...ecosystem.terminal!, command: e.target.value || undefined } })} placeholder="cargo run" />
          <input className={inputClass} value={ecosystem.terminal.cwd ?? ''} onChange={(e) => commit({ terminal: { ...ecosystem.terminal!, cwd: e.target.value || undefined } })} placeholder="working directory (optional)" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Scrollback</label><input type="number" min={100} className={inputClass} value={ecosystem.terminal.scrollback} onChange={(e) => commit({ terminal: { ...ecosystem.terminal!, scrollback: Math.max(100, Number(e.target.value) || 10_000) } })} /></div>
            <label className="flex items-end gap-2 pb-1 text-[10px]"><input type="checkbox" checked={ecosystem.terminal.readOnly} onChange={(e) => commit({ terminal: { ...ecosystem.terminal!, readOnly: e.target.checked } })} /> Read-only</label>
          </div>
        </div>
      )}

      {ecosystem.adapter === 'syntax-highlight' && ecosystem.syntax && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Language</label><input className={inputClass} value={ecosystem.syntax.language} onChange={(e) => commit({ syntax: { ...ecosystem.syntax!, language: e.target.value } })} /></div>
          <div><label className={labelClass}>Theme</label><input className={inputClass} value={ecosystem.syntax.theme} onChange={(e) => commit({ syntax: { ...ecosystem.syntax!, theme: e.target.value } })} /></div>
          <label className="col-span-2 flex items-center gap-2 text-[10px]"><input type="checkbox" checked={ecosystem.syntax.lineNumbers} onChange={(e) => commit({ syntax: { ...ecosystem.syntax!, lineNumbers: e.target.checked } })} /> Line numbers</label>
        </div>
      )}

      {ecosystem.adapter === 'interactive' && ecosystem.interaction && (
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          {(['focusable', 'mouse', 'hover', 'click'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={ecosystem.interaction![key]} onChange={(e) => commit({ interaction: { ...ecosystem.interaction!, [key]: e.target.checked } })} /> {key}</label>
          ))}
        </div>
      )}

      {ecosystem.adapter === 'node-graph' && ecosystem.nodeGraph && (
        <div className="space-y-2">
          <div><label className={labelClass}>Orientation</label><select className={inputClass} value={ecosystem.nodeGraph.orientation} onChange={(e) => commit({ nodeGraph: { ...ecosystem.nodeGraph!, orientation: e.target.value as 'horizontal' | 'vertical' } })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]"><label className="flex items-center gap-2"><input type="checkbox" checked={ecosystem.nodeGraph.showPorts} onChange={(e) => commit({ nodeGraph: { ...ecosystem.nodeGraph!, showPorts: e.target.checked } })} /> Ports</label><label className="flex items-center gap-2"><input type="checkbox" checked={ecosystem.nodeGraph.showLabels} onChange={(e) => commit({ nodeGraph: { ...ecosystem.nodeGraph!, showLabels: e.target.checked } })} /> Labels</label></div>
        </div>
      )}

      {ecosystem.embedded && (
        <div className="rounded border border-border/40 p-2 space-y-2">
          <label className="flex items-center gap-2 text-[10px] font-medium"><input type="checkbox" checked={ecosystem.embedded.enabled} onChange={(e) => commit({ embedded: { ...ecosystem.embedded!, enabled: e.target.checked } })} /> Mousefood embedded target</label>
          {ecosystem.embedded.enabled && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelClass}>Display target</label><select className={inputClass} value={ecosystem.embedded.target} onChange={(e) => commit({ embedded: { ...ecosystem.embedded!, target: e.target.value as typeof ecosystem.embedded.target } })}><option value="simulator">Simulator</option><option value="framebuffer">Framebuffer</option><option value="epd-weact">WeAct EPD</option><option value="epd-waveshare">Waveshare EPD</option><option value="lilygo-epd47">LilyGo EPD47</option></select></div>
              <div><label className={labelClass}>Color mode</label><select className={inputClass} value={ecosystem.embedded.colorMode} onChange={(e) => commit({ embedded: { ...ecosystem.embedded!, colorMode: e.target.value as typeof ecosystem.embedded.colorMode } })}><option value="mono">Monochrome</option><option value="rgb565">RGB565</option><option value="rgb888">RGB888</option></select></div>
            </div>
          )}
        </div>
      )}

      <details className="text-[9px] text-muted-foreground">
        <summary className="cursor-pointer select-none">Integrated library matrix</summary>
        <div className="mt-1 grid gap-1">
          {RATATUI_ECOSYSTEM_LIBRARIES.filter((item) => item.status !== 'optional').map((item) => (
            <div key={item.id} className="flex justify-between gap-2"><span>{item.crateName}</span><span>{item.version}</span></div>
          ))}
        </div>
      </details>
    </section>
  );
}
