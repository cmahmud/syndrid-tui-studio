import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
  'linear', 'quad-in', 'quad-out', 'quad-in-out', 'cubic-in', 'cubic-out', 'cubic-in-out',
  'smoothstep', 'sine-in', 'sine-out', 'sine-in-out', 'bounce-out', 'spring',
];

const TRIGGERS: Array<EffectTrigger['kind']> = [
  'mount', 'show', 'focus', 'blur', 'select', 'deselect', 'state-change', 'key', 'event', 'manual',
];

function primitiveLeaves(node: EffectGraphNode, out: PrimitiveEffectNode[] = []): PrimitiveEffectNode[] {
  if (node.kind === 'primitive') out.push(node);
  else if (node.kind === 'delay' || node.kind === 'repeat') primitiveLeaves(node.child, out);
  else node.children.forEach((child) => primitiveLeaves(child, out));
  return out;
}

function replaceGraphNode(root: EffectGraphNode, id: string, replacement: EffectGraphNode): EffectGraphNode {
  if (root.id === id) return replacement;
  if (root.kind === 'delay' || root.kind === 'repeat') return { ...root, child: replaceGraphNode(root.child, id, replacement) };
  if (root.kind === 'sequence' || root.kind === 'parallel') return { ...root, children: root.children.map((child) => replaceGraphNode(child, id, replacement)) };
  return root;
}

function removeGraphNode(root: EffectGraphNode, id: string): EffectGraphNode {
  if (root.kind === 'sequence' || root.kind === 'parallel') {
    const children = root.children.filter((child) => child.id !== id).map((child) => removeGraphNode(child, id));
    if (children.length === 1) return children[0];
    return { ...root, children };
  }
  if (root.kind === 'delay' || root.kind === 'repeat') {
    if (root.child.id === id) return {
      kind: 'primitive', id: makeEffectId('node'), effect: 'consume_tick', durationMs: 0,
      interpolation: 'linear', parameters: {},
    };
    return { ...root, child: removeGraphNode(root.child, id) };
  }
  return root;
}

function makePrimitive(kind: TachyonFxPrimitive): PrimitiveEffectNode {
  const meta = getTachyonFxCatalogEntry(kind);
  return {
    kind: 'primitive',
    id: makeEffectId('node'),
    effect: kind,
    durationMs: meta.defaultDurationMs,
    interpolation: meta.defaultInterpolation,
    motion: meta.supportsMotion ? 'left-to-right' : undefined,
    spatialPattern: meta.supportsSpatialPattern ? { kind: 'uniform' } : undefined,
    parameters: Object.fromEntries(meta.parameters.map((parameter) => [parameter.key, parameter.defaultValue])),
  };
}

function triggerFromKind(kind: EffectTrigger['kind']): EffectTrigger {
  if (kind === 'key') return { kind, key: 'Enter' };
  if (kind === 'event') return { kind, event: 'activate' };
  if (kind === 'state-change') return { kind, state: 'loading' };
  if (kind === 'manual') return { kind, name: 'preview' };
  return { kind } as EffectTrigger;
}

function targetLabel(target: EffectTarget): string {
  if (target.kind === 'component') return 'Whole component';
  if (target.kind === 'region') return `Region: ${target.region}`;
  if (target.kind === 'rect') return `Rect ${target.width}×${target.height}`;
  return `Cells: ${target.filter.kind}`;
}

function GraphTree({ node, selectedId, onSelect, depth = 0 }: {
  node: EffectGraphNode;
  selectedId: string;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const children = node.kind === 'sequence' || node.kind === 'parallel'
    ? node.children
    : node.kind === 'delay' || node.kind === 'repeat'
      ? [node.child]
      : [];
  return (
    <div>
      <button
        className={`w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] ${selectedId === node.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent'}`}
        style={{ paddingLeft: `${4 + depth * 12}px` }}
        onClick={() => onSelect(node.id)}
      >
        {children.length ? <ChevronDown className="w-3 h-3" /> : <span className="w-3" />}
        <span className="font-mono">{node.kind === 'primitive' ? node.effect : node.kind}</span>
        {node.kind === 'primitive' && <span className="ml-auto text-muted-foreground">{node.durationMs}ms</span>}
      </button>
      {children.map((child) => <GraphTree key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

export function EffectEditor({ componentId }: { componentId: string }) {
  const store = useComponentStore();
  const project = useProjectStore();
  const playback = useEffectPreviewStore();
  const component = store.getComponent(componentId);
  const effects = component?.prototype?.effects ?? [];
  const [selectedEffectId, setSelectedEffectId] = useState(effects[0]?.id ?? '');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [tab, setTab] = useState<'library' | 'graph' | 'dsl' | 'target'>('library');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [dsl, setDsl] = useState('');
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const selectedEffect = effects.find((effect) => effect.id === selectedEffectId) ?? effects[0];
  const selectedPrimitive = selectedEffect
    ? primitiveLeaves(selectedEffect.graph).find((node) => node.id === selectedNodeId) ?? primitiveLeaves(selectedEffect.graph)[0]
    : undefined;
  const duration = selectedEffect ? effectGraphDuration(playback.mode === 'reduced' && selectedEffect.reducedMotion.mode === 'replace' && selectedEffect.reducedMotion.graph ? selectedEffect.reducedMotion.graph : selectedEffect.graph) : 0;
  const frame = selectedEffect ? evaluateEffect(selectedEffect, playback.elapsedMs, playback.mode === 'reduced') : undefined;
  const previewStyle = frame ? mergePreviewStyles(frame.active) : {};

  useEffect(() => {
    if (!selectedEffect && effects[0]) setSelectedEffectId(effects[0].id);
  }, [effects, selectedEffect]);

  useEffect(() => {
    if (!selectedEffect) return;
    setDsl(effectToTachyonFxDsl(selectedEffect, playback.mode === 'reduced'));
    setSelectedNodeId((current) => current || primitiveLeaves(selectedEffect.graph)[0]?.id || selectedEffect.graph.id);
  }, [selectedEffect?.id, playback.mode]);

  useEffect(() => {
    if (!playback.playing) {
      lastRef.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }
    const tick = (now: number) => {
      if (lastRef.current === null) lastRef.current = now;
      const delta = now - lastRef.current;
      lastRef.current = now;
      playback.advance(delta, duration);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [playback.playing, playback.speed, playback.loop, duration]);

  if (!component) return null;

  const commitEffects = (next: EffectDefinition[]) => {
    store.updateComponent(component.id, {
      prototype: {
        ...(component.prototype ?? {}),
        effects: next,
        // Keep the old Canvas path functional while v3 effects become canonical.
        animations: next.map(effectToLegacyAnimation),
      },
    });
    project.replayAnimations();
  };

  const updateEffect = (patch: Partial<EffectDefinition>) => {
    if (!selectedEffect) return;
    commitEffects(effects.map((effect) => effect.id === selectedEffect.id ? { ...effect, ...patch } : effect));
  };

  const updateNode = (node: EffectGraphNode) => {
    if (!selectedEffect) return;
    updateEffect({ graph: replaceGraphNode(selectedEffect.graph, node.id, node) });
  };

  const addEffect = (kind: TachyonFxPrimitive) => {
    const meta = getTachyonFxCatalogEntry(kind);
    const next = makePrimitiveEffect(component.id, kind, meta.label);
    next.graph = makePrimitive(kind);
    commitEffects([...effects, next]);
    setSelectedEffectId(next.id);
    setSelectedNodeId(next.graph.id);
    setTab('graph');
    playback.replay();
  };

  const duplicateEffect = () => {
    if (!selectedEffect) return;
    const copy = structuredClone(selectedEffect);
    copy.id = makeEffectId('effect');
    copy.name = `${copy.name} copy`;
    commitEffects([...effects, copy]);
    setSelectedEffectId(copy.id);
  };

  const addSiblingPrimitive = (kind: 'sequence' | 'parallel') => {
    if (!selectedEffect) return;
    const child = makePrimitive('fade_from');
    const graph: EffectGraphNode = selectedEffect.graph.kind === kind
      ? { ...selectedEffect.graph, children: [...selectedEffect.graph.children, child] }
      : { kind, id: makeEffectId(kind), children: [selectedEffect.graph, child] };
    updateEffect({ graph });
    setSelectedNodeId(child.id);
  };

  const filteredCatalog = useMemo(() => TACHYON_FX_CATALOG.filter((entry) => {
    const q = query.toLowerCase().trim();
    return (category === 'all' || entry.category === category)
      && (!q || `${entry.label} ${entry.description} ${entry.id}`.toLowerCase().includes(q));
  }), [query, category]);

  const inputClass = 'w-full px-1.5 py-1 bg-input border border-border/50 rounded text-[10px] focus:border-primary focus:outline-none';
  const labelClass = 'text-[9px] text-muted-foreground uppercase tracking-wide block mb-0.5';

  return (
    <section className="border-t border-border/40 pt-3 space-y-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold">TachyonFX Studio</div>
          <div className="text-[9px] text-muted-foreground">v3 structured effect graph · DSL · targets · reduced motion</div>
        </div>
        <button className="p-1 rounded hover:bg-accent" onClick={() => addEffect('fade_from')} title="Add effect"><Plus className="w-3 h-3" /></button>
        <button className="p-1 rounded hover:bg-accent disabled:opacity-40" disabled={!selectedEffect} onClick={duplicateEffect} title="Duplicate"><Copy className="w-3 h-3" /></button>
        <button className="p-1 rounded text-destructive disabled:opacity-40" disabled={!selectedEffect} onClick={() => {
          if (!selectedEffect) return;
          commitEffects(effects.filter((effect) => effect.id !== selectedEffect.id));
          setSelectedEffectId(effects.find((effect) => effect.id !== selectedEffect.id)?.id ?? '');
        }} title="Delete"><Trash2 className="w-3 h-3" /></button>
      </div>

      {effects.length === 0 ? (
        <div className="rounded border border-dashed border-border p-2 text-[10px] text-muted-foreground">
          No v3 effects yet. Choose one from the library to author real TachyonFX intent.
        </div>
      ) : (
        <select className={inputClass} value={selectedEffect?.id ?? ''} onChange={(event) => setSelectedEffectId(event.target.value)}>
          {effects.map((effect) => <option key={effect.id} value={effect.id}>{effect.name}</option>)}
        </select>
      )}

      {selectedEffect && (
        <>
          <div className="rounded border border-border/50 bg-muted/20 p-2 space-y-2">
            <div className="h-14 flex items-center justify-center overflow-hidden rounded border border-border/40 bg-background font-mono text-[11px]" style={previewStyle}>
              ╭─ {component.name} ─╮
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded bg-secondary" onClick={playback.toggle}>{playback.playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}</button>
              <button className="p-1 rounded bg-secondary" onClick={playback.replay}><RotateCcw className="w-3 h-3" /></button>
              <input className="flex-1" type="range" min={0} max={Math.max(1, duration)} value={Math.min(playback.elapsedMs, Math.max(1, duration))} onChange={(event) => playback.scrub(Number(event.target.value))} />
              <span className="w-16 text-right text-[9px] text-muted-foreground">{Math.round(playback.elapsedMs)}/{Math.round(duration)}ms</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <select className={inputClass} value={playback.speed} onChange={(event) => playback.setSpeed(Number(event.target.value))}>
                {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
              </select>
              <select className={inputClass} value={playback.mode} onChange={(event) => playback.setMode(event.target.value as 'normal' | 'reduced')}>
                <option value="normal">Normal</option><option value="reduced">Reduced</option>
              </select>
              <label className="flex items-center gap-1 px-1 text-[9px]"><input type="checkbox" checked={playback.loop} onChange={(event) => playback.setLoop(event.target.checked)} /> Loop</label>
            </div>
          </div>

          <div className="flex overflow-x-auto border-b border-border/40">
            {(['library', 'graph', 'dsl', 'target'] as const).map((name) => (
              <button key={name} className={`px-2 py-1 text-[9px] capitalize ${tab === name ? 'border-b border-primary text-primary' : 'text-muted-foreground'}`} onClick={() => setTab(name)}>{name}</button>
            ))}
          </div>

          {tab === 'library' && (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_90px] gap-1">
                <input className={inputClass} placeholder="Search 20+ effects…" value={query} onChange={(event) => setQuery(event.target.value)} />
                <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                  {['all', 'entrance', 'exit', 'transition', 'color', 'spatial', 'utility'].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="max-h-52 overflow-auto rounded border border-border/40 divide-y divide-border/30">
                {filteredCatalog.map((entry) => (
                  <button key={entry.id} className="w-full p-2 text-left hover:bg-accent" onClick={() => addEffect(entry.id)}>
                    <div className="flex gap-2 items-center"><span className="text-[10px] font-medium">{entry.label}</span><span className="ml-auto text-[8px] uppercase text-muted-foreground">{entry.category}</span></div>
                    <div className="text-[9px] text-muted-foreground">{entry.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'graph' && (
            <div className="space-y-2">
              <div className="flex gap-1">
                <button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => addSiblingPrimitive('sequence')}>+ Sequence</button>
                <button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => addSiblingPrimitive('parallel')}>+ Parallel</button>
                {selectedNodeId !== selectedEffect.graph.id && <button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => updateEffect({ graph: removeGraphNode(selectedEffect.graph, selectedNodeId) })}>Remove node</button>}
              </div>
              <div className="rounded border border-border/40 py-1"><GraphTree node={selectedEffect.graph} selectedId={selectedNodeId} onSelect={setSelectedNodeId} /></div>
              {selectedPrimitive && (
                <div className="grid grid-cols-2 gap-1.5">
                  <label><span className={labelClass}>Effect</span><select className={inputClass} value={selectedPrimitive.effect} onChange={(event) => {
                    const next = makePrimitive(event.target.value as TachyonFxPrimitive);
                    updateNode({ ...next, id: selectedPrimitive.id });
                  }}>{TACHYON_FX_CATALOG.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
                  <label><span className={labelClass}>Duration</span><input className={inputClass} type="number" min={0} value={selectedPrimitive.durationMs} onChange={(event) => updateNode({ ...selectedPrimitive, durationMs: Math.max(0, Number(event.target.value)) })} /></label>
                  <label><span className={labelClass}>Interpolation</span><select className={inputClass} value={selectedPrimitive.interpolation} onChange={(event) => updateNode({ ...selectedPrimitive, interpolation: event.target.value as EffectInterpolation })}>{INTERPOLATIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label><span className={labelClass}>Motion</span><select className={inputClass} value={selectedPrimitive.motion ?? ''} onChange={(event) => updateNode({ ...selectedPrimitive, motion: event.target.value ? event.target.value as EffectMotion : undefined })}><option value="">None</option>{DEFAULT_EFFECT_MOTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className="col-span-2"><span className={labelClass}>Spatial pattern</span><select className={inputClass} value={selectedPrimitive.spatialPattern?.kind ?? 'uniform'} onChange={(event) => {
                    const kind = event.target.value as SpatialPatternSpec['kind'];
                    const pattern: SpatialPatternSpec = kind === 'radial' ? { kind, centerX: 0.5, centerY: 0.5 }
                      : kind === 'diagonal' ? { kind, direction: 'down-right' }
                        : kind === 'checkerboard' ? { kind, cellWidth: 2, cellHeight: 1 }
                          : kind === 'columns' || kind === 'rows' ? { kind, reverse: false }
                            : kind === 'organic' ? { kind, seed: 42 }
                              : { kind: 'uniform' };
                    updateNode({ ...selectedPrimitive, spatialPattern: pattern });
                  }}>{['uniform', 'radial', 'diagonal', 'checkerboard', 'columns', 'rows', 'organic'].map((item) => <option key={item}>{item}</option>)}</select></label>
                </div>
              )}
            </div>
          )}

          {tab === 'dsl' && (() => {
            const validation = validateTachyonFxDsl(dsl);
            return (
              <div className="space-y-1.5">
                <textarea className={`${inputClass} min-h-28 font-mono resize-y`} spellCheck={false} value={dsl} onChange={(event) => setDsl(event.target.value)} />
                <div className={`text-[9px] ${validation.valid ? 'text-emerald-400' : 'text-destructive'}`}>{validation.valid ? 'Valid Studio-side TachyonFX expression' : validation.errors.map((error) => `${error.line}:${error.column} ${error.message}`).join(' · ')}</div>
                <div className="flex gap-1">
                  <button className="px-2 py-1 rounded bg-secondary text-[9px]" onClick={() => setDsl(effectToTachyonFxDsl(selectedEffect, playback.mode === 'reduced'))}>Regenerate</button>
                  <button className="px-2 py-1 rounded bg-primary text-primary-foreground text-[9px] disabled:opacity-50" disabled={!validation.valid} onClick={() => {
                    updateEffect({ graph: tachyonFxDslToGraph(dsl, selectedPrimitive?.durationMs ?? 180) });
                    setTab('graph');
                  }}>Apply DSL</button>
                </div>
              </div>
            );
          })()}

          {tab === 'target' && (
            <div className="space-y-2">
              <label><span className={labelClass}>Target</span><select className={inputClass} value={selectedEffect.target.kind} onChange={(event) => {
                const kind = event.target.value as EffectTarget['kind'];
                const target: EffectTarget = kind === 'region' ? { kind, componentId: component.id, region: 'content' }
                  : kind === 'rect' ? { kind, x: 0, y: 0, width: Number(component.props.width ?? 10) || 10, height: Number(component.props.height ?? 3) || 3 }
                    : kind === 'cells' ? { kind, componentId: component.id, filter: { kind: 'all' } }
                      : { kind: 'component', componentId: component.id };
                updateEffect({ target });
              }}>{['component', 'region', 'rect', 'cells'].map((item) => <option key={item}>{item}</option>)}</select><span className="text-[9px] text-muted-foreground">{targetLabel(selectedEffect.target)}</span></label>
              <label><span className={labelClass}>Trigger</span><select className={inputClass} value={selectedEffect.trigger.kind} onChange={(event) => updateEffect({ trigger: triggerFromKind(event.target.value as EffectTrigger['kind']) })}>{TRIGGERS.map((item) => <option key={item}>{item}</option>)}</select></label>
              {selectedEffect.trigger.kind === 'key' && <input className={inputClass} value={selectedEffect.trigger.key} onChange={(event) => updateEffect({ trigger: { kind: 'key', key: event.target.value } })} placeholder="Key" />}
              {selectedEffect.trigger.kind === 'event' && <input className={inputClass} value={selectedEffect.trigger.event} onChange={(event) => updateEffect({ trigger: { kind: 'event', event: event.target.value } })} placeholder="Event" />}
              <label><span className={labelClass}>Reduced motion</span><select className={inputClass} value={selectedEffect.reducedMotion.mode} onChange={(event) => {
                const mode = event.target.value as EffectDefinition['reducedMotion']['mode'];
                updateEffect({ reducedMotion: mode === 'replace' ? { mode, graph: selectedEffect.reducedMotion.graph ?? makePrimitive('fade_from') } : { mode } });
              }}><option value="inherit">Use normal graph</option><option value="replace">Replace graph</option><option value="disable">Disable decorative motion</option></select></label>
              <label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={selectedEffect.enabled} onChange={(event) => updateEffect({ enabled: event.target.checked })} /> Enabled</label>
            </div>
          )}
        </>
      )}
    </section>
  );
}
