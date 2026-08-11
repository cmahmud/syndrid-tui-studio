import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useComponentStore, useEffectPreviewStore, useProjectStore } from '../../stores';
import type {
  EffectDefinition,
  EffectGraphNode,
  EffectInterpolation,
  EffectMotion,
  EffectTarget,
  EffectTrigger,
  PrimitiveEffectNode,
  SpatialPatternSpec,
  TachyonFxPrimitive,
} from '../../types';
import { effectToLegacyAnimation, makeEffectId, makePrimitiveEffect } from '../../types';
import { DEFAULT_EFFECT_MOTIONS, TACHYON_FX_CATALOG, getTachyonFxCatalogEntry } from '../../data/tachyonFxCatalog';
import { effectGraphDuration, evaluateEffect, mergePreviewStyles } from '../../utils/effectRuntime';
import { effectToTachyonFxDsl, tachyonFxDslToGraph, validateTachyonFxDsl } from '../../utils/tachyonFxDsl';

const INTERPOLATIONS: EffectInterpolation[] = [
  'linear','quad-in','quad-out','quad-in-out','cubic-in','cubic-out','cubic-in-out',
  'smoothstep','sine-in','sine-out','sine-in-out','bounce-out','spring',
];
const TRIGGERS: EffectTrigger['kind'][] = ['mount','show','focus','blur','select','deselect','state-change','key','event','manual'];

function leaves(node: EffectGraphNode, out: PrimitiveEffectNode[] = []): PrimitiveEffectNode[] {
  if (node.kind === 'primitive') out.push(node);
  else if (node.kind === 'delay' || node.kind === 'repeat') leaves(node.child, out);
  else node.children.forEach((child) => leaves(child, out));
  return out;
}
function replaceNode(root: EffectGraphNode, id: string, next: EffectGraphNode): EffectGraphNode {
  if (root.id === id) return next;
  if (root.kind === 'delay' || root.kind === 'repeat') return { ...root, child: replaceNode(root.child, id, next) };
  if (root.kind === 'sequence' || root.kind === 'parallel') return { ...root, children: root.children.map((child) => replaceNode(child, id, next)) };
  return root;
}
function removeNode(root: EffectGraphNode, id: string): EffectGraphNode {
  if (root.kind === 'sequence' || root.kind === 'parallel') {
    const children = root.children.filter((child) => child.id !== id).map((child) => removeNode(child, id));
    if (children.length === 1) return children[0];
    return { ...root, children };
  }
  if (root.kind === 'delay' || root.kind === 'repeat') return { ...root, child: removeNode(root.child, id) };
  return root;
}
function primitive(kind: TachyonFxPrimitive): PrimitiveEffectNode {
  const meta = getTachyonFxCatalogEntry(kind);
  return {
    kind: 'primitive', id: makeEffectId('node'), effect: kind, durationMs: meta.defaultDurationMs,
    interpolation: meta.defaultInterpolation,
    motion: meta.supportsMotion ? 'left-to-right' : undefined,
    spatialPattern: meta.supportsSpatialPattern ? { kind: 'uniform' } : undefined,
    parameters: Object.fromEntries(meta.parameters.map((parameter) => [parameter.key, parameter.defaultValue])),
  };
}
function triggerFor(kind: EffectTrigger['kind']): EffectTrigger {
  if (kind === 'key') return { kind, key: 'Enter' };
  if (kind === 'event') return { kind, event: 'activate' };
  if (kind === 'state-change') return { kind, state: 'loading' };
  if (kind === 'manual') return { kind, name: 'preview' };
  return { kind } as EffectTrigger;
}
function GraphTree({ node, selectedId, onSelect, depth = 0 }: { node: EffectGraphNode; selectedId: string; onSelect: (id: string) => void; depth?: number }) {
  const children = node.kind === 'sequence' || node.kind === 'parallel' ? node.children : node.kind === 'delay' || node.kind === 'repeat' ? [node.child] : [];
  return <div>
    <button className={`w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] ${selectedId === node.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent'}`} style={{ paddingLeft: 4 + depth * 12 }} onClick={() => onSelect(node.id)}>
      {children.length ? <ChevronDown className="w-3 h-3" /> : <span className="w-3" />}
      <span className="font-mono">{node.kind === 'primitive' ? node.effect : node.kind}</span>
      {node.kind === 'primitive' && <span className="ml-auto text-muted-foreground">{node.durationMs}ms</span>}
    </button>
    {children.map((child) => <GraphTree key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />)}
  </div>;
}

export function EffectEditor({ componentId }: { componentId: string }) {
  const componentStore = useComponentStore();
  const project = useProjectStore();
  const component = componentStore.getComponent(componentId);
  const effects = component?.prototype?.effects ?? [];
  const [selectedEffectId, setSelectedEffectId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [tab, setTab] = useState<'library' | 'graph' | 'dsl' | 'target'>('library');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [dsl, setDsl] = useState('');
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const playing = useEffectPreviewStore((state) => state.playing);
  const elapsedMs = useEffectPreviewStore((state) => state.elapsedMs);
  const speed = useEffectPreviewStore((state) => state.speed);
  const mode = useEffectPreviewStore((state) => state.mode);
  const loop = useEffectPreviewStore((state) => state.loop);
  const toggle = useEffectPreviewStore((state) => state.toggle);
  const replay = useEffectPreviewStore((state) => state.replay);
  const scrub = useEffectPreviewStore((state) => state.scrub);
  const setSpeed = useEffectPreviewStore((state) => state.setSpeed);
  const setMode = useEffectPreviewStore((state) => state.setMode);
  const setLoop = useEffectPreviewStore((state) => state.setLoop);
  const advance = useEffectPreviewStore((state) => state.advance);

  const selectedEffect = effects.find((effect) => effect.id === selectedEffectId) ?? effects[0];
  const selectedPrimitive = selectedEffect ? leaves(selectedEffect.graph).find((node) => node.id === selectedNodeId) ?? leaves(selectedEffect.graph)[0] : undefined;
  const activeGraph = selectedEffect && mode === 'reduced' && selectedEffect.reducedMotion.mode === 'replace' && selectedEffect.reducedMotion.graph ? selectedEffect.reducedMotion.graph : selectedEffect?.graph;
  const duration = activeGraph ? effectGraphDuration(activeGraph) : 0;
  const frame = selectedEffect ? evaluateEffect(selectedEffect, elapsedMs, mode === 'reduced') : undefined;
  const previewStyle = frame ? mergePreviewStyles(frame.active) : {};
  const filteredCatalog = TACHYON_FX_CATALOG.filter((entry) => {
    const q = query.toLowerCase().trim();
    return (category === 'all' || entry.category === category) && (!q || `${entry.label} ${entry.description} ${entry.id}`.toLowerCase().includes(q));
  });

  useEffect(() => {
    if (!selectedEffect) return;
    setDsl(effectToTachyonFxDsl(selectedEffect, mode === 'reduced'));
    setSelectedNodeId((current) => current || leaves(selectedEffect.graph)[0]?.id || selectedEffect.graph.id);
  }, [selectedEffect, mode]);

  useEffect(() => {
    if (!playing) { lastRef.current = null; if (frameRef.current) cancelAnimationFrame(frameRef.current); frameRef.current = null; return; }
    const tick = (now: number) => {
      if (lastRef.current === null) lastRef.current = now;
      const delta = now - lastRef.current; lastRef.current = now;
      advance(delta, duration);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [playing, duration, advance]);

  if (!component) return null;
  const commitEffects = (next: EffectDefinition[]) => {
    componentStore.updateComponent(component.id, { prototype: { ...(component.prototype ?? {}), effects: next, animations: next.map(effectToLegacyAnimation) } });
    project.replayAnimations();
  };
  const updateEffect = (patch: Partial<EffectDefinition>) => {
    if (!selectedEffect) return;
    commitEffects(effects.map((effect) => effect.id === selectedEffect.id ? { ...effect, ...patch } : effect));
  };
  const updateNode = (node: EffectGraphNode) => { if (selectedEffect) updateEffect({ graph: replaceNode(selectedEffect.graph, node.id, node) }); };
  const addEffect = (kind: TachyonFxPrimitive) => {
    const meta = getTachyonFxCatalogEntry(kind);
    const next = makePrimitiveEffect(component.id, kind, meta.label); next.graph = primitive(kind);
    commitEffects([...effects, next]); setSelectedEffectId(next.id); setSelectedNodeId(next.graph.id); setTab('graph'); replay();
  };
  const addComposition = (kind: 'sequence' | 'parallel') => {
    if (!selectedEffect) return;
    const child = primitive('fade_from');
    const graph: EffectGraphNode = selectedEffect.graph.kind === kind ? { ...selectedEffect.graph, children: [...selectedEffect.graph.children, child] } : { kind, id: makeEffectId(kind), children: [selectedEffect.graph, child] };
    updateEffect({ graph }); setSelectedNodeId(child.id);
  };
  const inputClass = 'w-full px-1.5 py-1 bg-input border border-border/50 rounded text-[10px] focus:border-primary focus:outline-none';
  const labelClass = 'text-[9px] text-muted-foreground uppercase tracking-wide block mb-0.5';

  return <section className="border-t border-border/40 pt-3 space-y-2">
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1"><div className="text-[11px] font-semibold">TachyonFX Studio</div><div className="text-[9px] text-muted-foreground">v3 graph · DSL · targets · reduced motion</div></div>
      <button className="p-1 rounded hover:bg-accent" onClick={() => addEffect('fade_from')}><Plus className="w-3 h-3" /></button>
      <button className="p-1 rounded hover:bg-accent disabled:opacity-40" disabled={!selectedEffect} onClick={() => {
        if (!selectedEffect) return; const copy = structuredClone(selectedEffect); copy.id = makeEffectId('effect'); copy.name += ' copy'; commitEffects([...effects, copy]); setSelectedEffectId(copy.id);
      }}><Copy className="w-3 h-3" /></button>
      <button className="p-1 rounded text-destructive disabled:opacity-40" disabled={!selectedEffect} onClick={() => {
        if (!selectedEffect) return; const next = effects.filter((effect) => effect.id !== selectedEffect.id); commitEffects(next); setSelectedEffectId(next[0]?.id ?? '');
      }}><Trash2 className="w-3 h-3" /></button>
    </div>
    {effects.length > 0 && <select className={inputClass} value={selectedEffect?.id ?? ''} onChange={(event) => setSelectedEffectId(event.target.value)}>{effects.map((effect) => <option key={effect.id} value={effect.id}>{effect.name}</option>)}</select>}
    {!selectedEffect ? <div className="rounded border border-dashed border-border p-2 text-[10px] text-muted-foreground">No v3 effects yet. Add one from the library.</div> : <>
      <div className="rounded border border-border/50 bg-muted/20 p-2 space-y-2">
        <div className="h-14 flex items-center justify-center overflow-hidden rounded border border-border/40 bg-background font-mono text-[11px]" style={previewStyle}>╭─ {component.name} ─╮</div>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded bg-secondary" onClick={toggle}>{playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}</button>
          <button className="p-1 rounded bg-secondary" onClick={replay}><RotateCcw className="w-3 h-3" /></button>
          <input className="flex-1" type="range" min={0} max={Math.max(1, duration)} value={Math.min(elapsedMs, Math.max(1, duration))} onChange={(event) => scrub(Number(event.target.value))} />
          <span className="w-16 text-right text-[9px] text-muted-foreground">{Math.round(elapsedMs)}/{Math.round(duration)}ms</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <select className={inputClass} value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[0.25,0.5,1,1.5,2,4].map((item) => <option key={item} value={item}>{item}×</option>)}</select>
          <select className={inputClass} value={mode} onChange={(event) => setMode(event.target.value as 'normal' | 'reduced')}><option value="normal">Normal</option><option value="reduced">Reduced</option></select>
          <label className="flex items-center gap-1 px-1 text-[9px]"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />Loop</label>
        </div>
      </div>
      <div className="flex overflow-x-auto border-b border-border/40">{(['library','graph','dsl','target'] as const).map((name) => <button key={name} className={`px-2 py-1 text-[9px] capitalize ${tab === name ? 'border-b border-primary text-primary' : 'text-muted-foreground'}`} onClick={() => setTab(name)}>{name}</button>)}</div>
      {tab === 'library' && <div className="space-y-2">
        <div className="grid grid-cols-[1fr_90px] gap-1"><input className={inputClass} placeholder="Search effects…" value={query} onChange={(event) => setQuery(event.target.value)} /><select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>{['all','entrance','exit','transition','color','spatial','utility'].map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="max-h-52 overflow-auto rounded border border-border/40 divide-y divide-border/30">{filteredCatalog.map((entry) => <button key={entry.id} className="w-full p-2 text-left hover:bg-accent" onClick={() => addEffect(entry.id)}><div className="flex gap-2"><span className="text-[10px] font-medium">{entry.label}</span><span className="ml-auto text-[8px] uppercase text-muted-foreground">{entry.category}</span></div><div className="text-[9px] text-muted-foreground">{entry.description}</div></button>)}</div>
      </div>}
      {tab === 'graph' && <div className="space-y-2">
        <div className="flex gap-1"><button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => addComposition('sequence')}>+ Sequence</button><button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => addComposition('parallel')}>+ Parallel</button>{selectedNodeId !== selectedEffect.graph.id && <button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => updateEffect({ graph: removeNode(selectedEffect.graph, selectedNodeId) })}>Remove node</button>}</div>
        <div className="rounded border border-border/40 py-1"><GraphTree node={selectedEffect.graph} selectedId={selectedNodeId} onSelect={setSelectedNodeId} /></div>
        {selectedPrimitive && <div className="grid grid-cols-2 gap-1.5">
          <label><span className={labelClass}>Effect</span><select className={inputClass} value={selectedPrimitive.effect} onChange={(event) => { const next = primitive(event.target.value as TachyonFxPrimitive); updateNode({ ...next, id: selectedPrimitive.id }); }}>{TACHYON_FX_CATALOG.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
          <label><span className={labelClass}>Duration</span><input className={inputClass} type="number" min={0} value={selectedPrimitive.durationMs} onChange={(event) => updateNode({ ...selectedPrimitive, durationMs: Math.max(0, Number(event.target.value)) })} /></label>
          <label><span className={labelClass}>Interpolation</span><select className={inputClass} value={selectedPrimitive.interpolation} onChange={(event) => updateNode({ ...selectedPrimitive, interpolation: event.target.value as EffectInterpolation })}>{INTERPOLATIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span className={labelClass}>Motion</span><select className={inputClass} value={selectedPrimitive.motion ?? ''} onChange={(event) => updateNode({ ...selectedPrimitive, motion: event.target.value ? event.target.value as EffectMotion : undefined })}><option value="">None</option>{DEFAULT_EFFECT_MOTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="col-span-2"><span className={labelClass}>Spatial pattern</span><select className={inputClass} value={selectedPrimitive.spatialPattern?.kind ?? 'uniform'} onChange={(event) => {
            const kind = event.target.value as SpatialPatternSpec['kind'];
            const spatialPattern: SpatialPatternSpec = kind === 'radial' ? { kind, centerX: 0.5, centerY: 0.5 } : kind === 'diagonal' ? { kind, direction: 'down-right' } : kind === 'checkerboard' ? { kind, cellWidth: 2, cellHeight: 1 } : kind === 'columns' || kind === 'rows' ? { kind, reverse: false } : kind === 'organic' ? { kind, seed: 42 } : { kind: 'uniform' };
            updateNode({ ...selectedPrimitive, spatialPattern });
          }}>{['uniform','radial','diagonal','checkerboard','columns','rows','organic'].map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>}
      </div>}
      {tab === 'dsl' && (() => { const validation = validateTachyonFxDsl(dsl); return <div className="space-y-1.5"><textarea className={`${inputClass} min-h-28 font-mono resize-y`} spellCheck={false} value={dsl} onChange={(event) => setDsl(event.target.value)} /><div className={`text-[9px] ${validation.valid ? 'text-emerald-400' : 'text-destructive'}`}>{validation.valid ? 'Valid Studio-side TachyonFX expression' : validation.errors.map((error) => `${error.line}:${error.column} ${error.message}`).join(' · ')}</div><div className="flex gap-1"><button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => setDsl(effectToTachyonFxDsl(selectedEffect, mode === 'reduced'))}>Regenerate</button><button className="px-2 py-1 rounded bg-primary text-primary-foreground text-[9px] disabled:opacity-50" disabled={!validation.valid} onClick={() => { updateEffect({ graph: tachyonFxDslToGraph(dsl, selectedPrimitive?.durationMs ?? 180) }); setTab('graph'); }}>Apply DSL</button></div></div>; })()}
      {tab === 'target' && <div className="space-y-2">
        <label><span className={labelClass}>Target</span><select className={inputClass} value={selectedEffect.target.kind} onChange={(event) => { const kind = event.target.value as EffectTarget['kind']; const target: EffectTarget = kind === 'region' ? { kind, componentId: component.id, region: 'content' } : kind === 'rect' ? { kind, x: 0, y: 0, width: 10, height: 3 } : kind === 'cells' ? { kind, componentId: component.id, filter: { kind: 'all' } } : { kind: 'component', componentId: component.id }; updateEffect({ target }); }}>{['component','region','rect','cells'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span className={labelClass}>Trigger</span><select className={inputClass} value={selectedEffect.trigger.kind} onChange={(event) => updateEffect({ trigger: triggerFor(event.target.value as EffectTrigger['kind']) })}>{TRIGGERS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span className={labelClass}>Reduced motion</span><select className={inputClass} value={selectedEffect.reducedMotion.mode} onChange={(event) => { const nextMode = event.target.value as EffectDefinition['reducedMotion']['mode']; updateEffect({ reducedMotion: nextMode === 'replace' ? { mode: nextMode, graph: selectedEffect.reducedMotion.graph ?? primitive('fade_from') } : { mode: nextMode } }); }}><option value="inherit">Use normal graph</option><option value="replace">Replacement graph</option><option value="disable">Disable decorative motion</option></select></label>
        <label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={selectedEffect.enabled} onChange={(event) => updateEffect({ enabled: event.target.checked })} />Enabled</label>
      </div>}
    </>}
  </section>;
}
