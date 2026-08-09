import { useState } from 'react';
import { Boxes, Monitor, Plus, Trash2 } from 'lucide-react';
import { useCanvasStore, useComponentStore, useProjectStore, useSelectionStore } from '../../stores';
import { cloneNode } from '../../utils/treeUtils';
import { generateComponentId } from '../../utils/idGenerator';
import type { ComponentNode } from '../../types';

function freshIds(node: ComponentNode, sourceId?: string): ComponentNode {
  const copy = cloneNode(node);
  const visit = (current: ComponentNode) => {
    current.id = generateComponentId();
    current.reusableSourceId = sourceId;
    current.children.forEach(visit);
  };
  visit(copy);
  return copy;
}

export function DesignSystemPanel() {
  const project = useProjectStore();
  const canvas = useCanvasStore();
  const componentStore = useComponentStore();
  const selection = useSelectionStore();
  const [name, setName] = useState('');
  const [viewportLabel, setViewportLabel] = useState('Custom');
  const [viewportWidth, setViewportWidth] = useState(100);
  const [viewportHeight, setViewportHeight] = useState(30);
  const selected = selection.getSelectedComponents()[0];

  const saveSelected = () => {
    if (!selected) return;
    project.saveReusableComponent(name.trim() || selected.name, selected, 'Reusable Syndrid TUI component', ['syndrid']);
    setName('');
  };

  const insert = (id: string) => {
    const def = project.getReusableComponent(id);
    const root = componentStore.root;
    if (!def || !root) return;
    const containerTypes = new Set(['Screen', 'Box', 'Grid', 'Modal']);
    const parent = selected && containerTypes.has(selected.type) ? selected : root;
    const copy = freshIds(def.root, def.id);
    componentStore.updateComponent(parent.id, { children: [...parent.children, copy] });
    selection.select(copy.id);
  };

  const tokenEntries = Object.entries(project.designTokens.colors);
  return (
    <div className="p-3 space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold"><Boxes className="w-3.5 h-3.5" /> Syndrid Design System</div>
        <p className="text-[10px] text-muted-foreground mt-1">Shared tokens and reusable components travel inside the project file and agent spec.</p>
      </div>

      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Semantic colors</div>
        <div className="space-y-1">
          {tokenEntries.slice(0, 10).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[12px_1fr_84px] gap-1.5 items-center text-[9px]">
              <span className="w-3 h-3 rounded-sm border border-border" style={{ background: value.startsWith('#') ? value : undefined }} />
              <span className="truncate" title={key}>{key}</span>
              <input
                className="w-full bg-input border border-border/50 rounded px-1 py-0.5"
                value={value}
                onChange={(e) => project.updateTokens({ ...project.designTokens, colors: { ...project.designTokens.colors, [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/40 pt-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Spacing & borders</div>
        <div className="grid grid-cols-5 gap-1">
          {Object.entries(project.designTokens.spacing).map(([key, value]) => (
            <label key={key} className="text-[8px] text-muted-foreground uppercase">{key}
              <input
                type="number" min={0} max={20}
                className="mt-0.5 w-full bg-input border border-border/50 rounded px-1 py-0.5 text-[9px] text-foreground"
                value={value}
                onChange={(e) => project.updateTokens({
                  ...project.designTokens,
                  spacing: { ...project.designTokens.spacing, [key]: Math.max(0, Number(e.target.value) || 0) },
                })}
              />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(project.designTokens.borders).map(([key, value]) => (
            <label key={key} className="text-[8px] text-muted-foreground">{key}
              <select
                className="mt-0.5 w-full bg-input border border-border/50 rounded px-1 py-0.5 text-[9px] text-foreground"
                value={value}
                onChange={(e) => project.updateTokens({
                  ...project.designTokens,
                  borders: { ...project.designTokens.borders, [key]: e.target.value as typeof value },
                })}
              >
                <option value="single">single</option><option value="rounded">rounded</option>
                <option value="double">double</option><option value="bold">bold</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="border-t border-border/40 pt-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Motion tokens</div>
        <div className="grid grid-cols-4 gap-1">
          {(['instant', 'fast', 'normal', 'slow'] as const).map((key) => (
            <label key={key} className="text-[8px] text-muted-foreground uppercase">{key}
              <input
                type="number" min={0} max={5000}
                className="mt-0.5 w-full bg-input border border-border/50 rounded px-1 py-0.5 text-[9px] text-foreground"
                value={project.designTokens.motion[key]}
                onChange={(e) => project.updateTokens({
                  ...project.designTokens,
                  motion: { ...project.designTokens.motion, [key]: Math.max(0, Number(e.target.value) || 0) },
                })}
              />
            </label>
          ))}
        </div>
        <label className="text-[8px] text-muted-foreground uppercase">Default easing
          <select
            className="mt-0.5 w-full bg-input border border-border/50 rounded px-1 py-1 text-[9px] text-foreground"
            value={project.designTokens.motion.defaultEasing}
            onChange={(e) => project.updateTokens({
              ...project.designTokens,
              motion: { ...project.designTokens.motion, defaultEasing: e.target.value as typeof project.designTokens.motion.defaultEasing },
            })}
          >
            <option value="linear">linear</option><option value="ease-in">ease-in</option>
            <option value="ease-out">ease-out</option><option value="ease-in-out">ease-in-out</option>
            <option value="smoothstep">smoothstep</option><option value="spring">spring</option>
          </select>
        </label>
      </section>

      <section className="border-t border-border/40 pt-3">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2"><Monitor className="w-3 h-3" /> Responsive viewports</div>
        <div className="space-y-1 mb-2">
          {project.viewports.map((viewport) => (
            <div key={viewport.id} className="flex items-center gap-1 text-[9px] border border-border/40 rounded px-1.5 py-1">
              <button className="min-w-0 flex-1 text-left" onClick={() => { project.setActiveViewport(viewport.id); canvas.setSizeMode('custom'); canvas.setCanvasSize(viewport.width, viewport.height); }}>
                <span className="font-medium">{viewport.label}</span> <span className="text-muted-foreground">{viewport.width}×{viewport.height}</span>
              </button>
              {!['wide', 'medium', 'narrow', 'short'].includes(viewport.id) && (
                <button className="p-0.5 text-destructive" title="Remove custom viewport" onClick={() => project.removeViewport(viewport.id)}><Trash2 className="w-3 h-3" /></button>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_46px_46px_28px] gap-1">
          <input aria-label="Viewport label" className="min-w-0 bg-input border border-border/50 rounded px-1 text-[9px]" value={viewportLabel} onChange={(e) => setViewportLabel(e.target.value)} />
          <input aria-label="Viewport columns" type="number" min={20} max={200} className="min-w-0 bg-input border border-border/50 rounded px-1 text-[9px]" value={viewportWidth} onChange={(e) => setViewportWidth(Number(e.target.value))} />
          <input aria-label="Viewport rows" type="number" min={10} max={100} className="min-w-0 bg-input border border-border/50 rounded px-1 text-[9px]" value={viewportHeight} onChange={(e) => setViewportHeight(Number(e.target.value))} />
          <button className="rounded bg-primary text-primary-foreground flex items-center justify-center" title="Add committed viewport" onClick={() => {
            const clean = viewportLabel.trim() || 'Custom';
            const id = `custom-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now().toString(36)}-${Date.now().toString(36).slice(-3)}`;
            const width = Math.max(20, Math.min(200, viewportWidth || 100));
            const height = Math.max(10, Math.min(100, viewportHeight || 30));
            project.upsertViewport({ id, label: clean, width, height, description: 'Custom committed terminal viewport', order: project.viewports.length });
            project.setActiveViewport(id);
            canvas.setSizeMode('custom');
            canvas.setCanvasSize(width, height);
          }}><Plus className="w-3 h-3" /></button>
        </div>
      </section>

      <section className="border-t border-border/40 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Reusable components</div>
        <div className="flex gap-1 mb-2">
          <input className="min-w-0 flex-1 bg-input border border-border/50 rounded px-1.5 py-1 text-[10px]" placeholder={selected ? selected.name : 'Select a component'} value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={!selected} onClick={saveSelected} className="p-1.5 rounded bg-primary text-primary-foreground disabled:opacity-30" title="Save selected as reusable"><Plus className="w-3 h-3" /></button>
        </div>
        <div className="space-y-1.5">
          {project.reusableComponents.length === 0 && <div className="text-[10px] text-muted-foreground border border-dashed border-border rounded p-2">Save a card, pane, header, modal, or entire view once and reuse it everywhere.</div>}
          {project.reusableComponents.map((def) => (
            <div key={def.id} className="flex items-center gap-1 border border-border/50 rounded p-1.5">
              <button className="min-w-0 flex-1 text-left" onClick={() => insert(def.id)}>
                <div className="text-[10px] font-medium truncate">{def.name}</div>
                <div className="text-[9px] text-muted-foreground truncate">{def.root.type} · click to insert</div>
              </button>
              <button className="p-1 text-destructive" onClick={() => project.removeReusableComponent(def.id)}><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/40 pt-3 text-[9px] text-muted-foreground">
        Tokens and reusable components are embedded in the `.tui` file and Agent Spec for Codex/Syndrid handoff.
      </section>
    </div>
  );
}
