import { useMemo, useState } from 'react';
import { Play, Plus, Trash2, Zap } from 'lucide-react';
import { useComponentStore, useProjectStore } from '../../stores';
import type {
  AnimationDirection,
  AnimationEasing,
  AnimationEffect,
  AnimationSpec,
  AnimationTrigger,
  ComponentNode,
  ComponentStateOverride,
  PrototypeStateName,
  ResponsiveOverride,
} from '../../types';

const STATES: PrototypeStateName[] = ['focused', 'selected', 'disabled', 'loading', 'success', 'warning', 'error'];
const EFFECTS: AnimationEffect[] = ['fade', 'slide', 'wipe', 'pulse', 'dissolve', 'glitch', 'typewriter', 'highlight', 'spring'];
const TRIGGERS: AnimationTrigger[] = ['on-enter', 'on-exit', 'on-focus', 'on-blur', 'on-select', 'on-change', 'on-loading', 'on-success', 'on-error', 'manual'];
const EASINGS: AnimationEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'smoothstep', 'spring'];
const DIRECTIONS: AnimationDirection[] = ['none', 'left', 'right', 'up', 'down'];

function makeAnimation(index: number): AnimationSpec {
  return {
    id: `motion-${Date.now().toString(36)}-${index}`,
    name: `Entrance ${index + 1}`,
    trigger: 'on-enter',
    effect: 'fade',
    durationMs: 180,
    delayMs: 0,
    easing: 'smoothstep',
    direction: 'none',
    enabled: true,
    reducedMotionEffect: 'fade',
    tachyonFxHint: 'Compose with tachyonfx using the authored duration/easing; keep input non-blocking.',
  };
}

export function PrototypeEditor({ component }: { component: ComponentNode }) {
  const componentStore = useComponentStore();
  const project = useProjectStore();
  const [stateName, setStateName] = useState<PrototypeStateName>('focused');
  const viewport = project.viewports.find((item) => item.id === project.activeViewportId) ?? project.viewports[0];
  const responsive = component.responsive?.[viewport?.id ?? 'narrow'];
  const prototype = component.prototype ?? {};
  const stateOverride = prototype.states?.[stateName];
  const animations = prototype.animations ?? [];

  const updateResponsive = (patch: Partial<ResponsiveOverride>) => {
    if (!viewport) return;
    const current = component.responsive?.[viewport.id] ?? {};
    componentStore.updateComponent(component.id, {
      responsive: {
        ...(component.responsive ?? {}),
        [viewport.id]: { ...current, ...patch },
      },
    });
  };

  const clearResponsive = () => {
    if (!viewport) return;
    const next = { ...(component.responsive ?? {}) };
    delete next[viewport.id];
    componentStore.updateComponent(component.id, { responsive: next });
  };

  const updatePrototype = (patch: Partial<NonNullable<ComponentNode['prototype']>>) => {
    componentStore.updateComponent(component.id, { prototype: { ...prototype, ...patch } });
  };

  const updateState = (patch: Partial<ComponentStateOverride>) => {
    updatePrototype({
      states: {
        ...(prototype.states ?? {}),
        [stateName]: { ...(stateOverride ?? {}), ...patch },
      },
    });
  };

  const updateAnimation = (id: string, patch: Partial<AnimationSpec>) => {
    updatePrototype({ animations: animations.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  };

  const inputClass = 'w-full px-1.5 py-1 bg-input border border-border/50 rounded text-[11px] focus:border-primary focus:outline-none';
  const labelClass = 'text-[9px] text-muted-foreground uppercase tracking-wide block mb-0.5';

  const availableStates = useMemo(() => ['default', ...STATES], []);

  return (
    <div className="space-y-4 p-3">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold">Responsive override</div>
            <div className="text-[9px] text-muted-foreground">{viewport?.label} · {viewport?.width}×{viewport?.height}</div>
          </div>
          {responsive && <button onClick={clearResponsive} className="text-[9px] text-destructive hover:underline">Clear</button>}
        </div>
        <label className="flex items-center gap-2 text-[10px]">
          <input type="checkbox" checked={responsive?.hidden ?? false} onChange={(e) => updateResponsive({ hidden: e.target.checked })} />
          Hide at this viewport
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Width</label>
            <input className={inputClass} placeholder="inherit" value={String(responsive?.props?.width ?? '')} onChange={(e) => updateResponsive({ props: { ...(responsive?.props ?? {}), width: e.target.value === '' ? undefined : Number(e.target.value) } })} />
          </div>
          <div>
            <label className={labelClass}>Height</label>
            <input className={inputClass} placeholder="inherit" value={String(responsive?.props?.height ?? '')} onChange={(e) => updateResponsive({ props: { ...(responsive?.props ?? {}), height: e.target.value === '' ? undefined : Number(e.target.value) } })} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Flex direction</label>
          <select className={inputClass} value={String(responsive?.layout?.direction ?? '')} onChange={(e) => updateResponsive({ layout: { ...(responsive?.layout ?? {}), direction: e.target.value || undefined } })}>
            <option value="">Inherit</option><option value="row">Row</option><option value="column">Column</option>
          </select>
        </div>
      </section>

      <section className="border-t border-border/40 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold">Prototype & focus</div>
          <select className="text-[10px] bg-input border border-border/50 rounded px-1 py-0.5" value={project.previewState} onChange={(e) => project.setPreviewState(e.target.value)}>
            {availableStates.map((state) => <option key={state} value={state}>Preview: {state}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-[10px]">
          <input type="checkbox" checked={prototype.focusable ?? false} onChange={(e) => updatePrototype({ focusable: e.target.checked })} />
          Keyboard focusable
        </label>
        <div>
          <label className={labelClass}>Focus order</label>
          <input type="number" className={inputClass} value={prototype.focusOrder ?? 0} onChange={(e) => updatePrototype({ focusOrder: Number(e.target.value) })} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label className={labelClass}>Edit state</label>
            <select className={inputClass} value={stateName} onChange={(e) => setStateName(e.target.value)}>
              {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </div>
          <button
            className="px-2 py-1 text-[10px] rounded bg-secondary hover:bg-secondary/80"
            onClick={() => updateState({ style: { ...component.style }, note: `Captured from ${component.name}` })}
          >Capture style</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>State color</label>
            <input className={inputClass} placeholder="inherit" value={String(stateOverride?.style?.color ?? '')} onChange={(e) => updateState({ style: { ...(stateOverride?.style ?? {}), color: e.target.value || undefined } })} />
          </div>
          <div>
            <label className={labelClass}>State background</label>
            <input className={inputClass} placeholder="inherit" value={String(stateOverride?.style?.backgroundColor ?? '')} onChange={(e) => updateState({ style: { ...(stateOverride?.style ?? {}), backgroundColor: e.target.value || undefined } })} />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1 text-[11px] font-semibold"><Zap className="w-3 h-3" /> Motion</div>
            <div className="text-[9px] text-muted-foreground">TachyonFX-oriented spec · browser preview</div>
          </div>
          <div className="flex gap-1">
            <button onClick={project.replayAnimations} className="p-1 rounded hover:bg-accent" title="Replay animations"><Play className="w-3 h-3" /></button>
            <button onClick={() => updatePrototype({ animations: [...animations, makeAnimation(animations.length)] })} className="p-1 rounded hover:bg-accent" title="Add animation"><Plus className="w-3 h-3" /></button>
          </div>
        </div>
        {animations.length === 0 && <div className="text-[10px] text-muted-foreground border border-dashed border-border rounded p-2">No motion authored. Add an effect to preview app-like transitions.</div>}
        {animations.map((animation) => (
          <div key={animation.id} className="rounded border border-border/50 bg-muted/20 p-2 space-y-2">
            <div className="flex gap-1 items-center">
              <input className={inputClass} value={animation.name} onChange={(e) => updateAnimation(animation.id, { name: e.target.value })} />
              <button onClick={() => updatePrototype({ animations: animations.filter((item) => item.id !== animation.id) })} className="p-1 text-destructive"><Trash2 className="w-3 h-3" /></button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <select className={inputClass} value={animation.trigger} onChange={(e) => updateAnimation(animation.id, { trigger: e.target.value as AnimationTrigger })}>{TRIGGERS.map((v) => <option key={v}>{v}</option>)}</select>
              <select className={inputClass} value={animation.effect} onChange={(e) => updateAnimation(animation.id, { effect: e.target.value as AnimationEffect })}>{EFFECTS.map((v) => <option key={v}>{v}</option>)}</select>
              <select className={inputClass} value={animation.easing} onChange={(e) => updateAnimation(animation.id, { easing: e.target.value as AnimationEasing })}>{EASINGS.map((v) => <option key={v}>{v}</option>)}</select>
              <select className={inputClass} value={animation.direction} onChange={(e) => updateAnimation(animation.id, { direction: e.target.value as AnimationDirection })}>{DIRECTIONS.map((v) => <option key={v}>{v}</option>)}</select>
              <label className="text-[9px] text-muted-foreground">Duration ms<input type="number" min={0} className={inputClass} value={animation.durationMs} onChange={(e) => updateAnimation(animation.id, { durationMs: Math.max(0, Number(e.target.value)) })} /></label>
              <label className="text-[9px] text-muted-foreground">Delay ms<input type="number" min={0} className={inputClass} value={animation.delayMs} onChange={(e) => updateAnimation(animation.id, { delayMs: Math.max(0, Number(e.target.value)) })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-1.5 items-end">
              <label className="flex items-center gap-2 text-[9px] text-muted-foreground"><input type="checkbox" checked={animation.enabled} onChange={(e) => updateAnimation(animation.id, { enabled: e.target.checked })} />Enabled</label>
              <label className="flex items-center gap-2 text-[9px] text-muted-foreground"><input type="checkbox" checked={!!animation.loop} onChange={(e) => updateAnimation(animation.id, { loop: e.target.checked })} />Loop</label>
              <label className="text-[9px] text-muted-foreground col-span-2">Reduced motion
                <select className={inputClass} value={animation.reducedMotionEffect ?? 'none'} onChange={(e) => updateAnimation(animation.id, { reducedMotionEffect: e.target.value as AnimationSpec['reducedMotionEffect'] })}>
                  <option value="none">No decorative motion</option>
                  <option value="fade">Short fade</option>
                  <option value="highlight">Short highlight</option>
                </select>
              </label>
              <label className="text-[9px] text-muted-foreground col-span-2">TachyonFX / implementation hint
                <input className={inputClass} placeholder="Optional implementation note for Codex" value={animation.tachyonFxHint ?? ''} onChange={(e) => updateAnimation(animation.id, { tachyonFxHint: e.target.value || undefined })} />
              </label>
            </div>
          </div>
        ))}
      </section>

      <section className="border-t border-border/40 pt-3 space-y-2">
        <div className="text-[11px] font-semibold">Key bindings</div>
        {(prototype.keyBindings ?? []).map((binding, index) => (
          <div key={`${binding.key}-${index}`} className="grid grid-cols-[70px_1fr_auto] gap-1">
            <input className={inputClass} value={binding.key} onChange={(e) => updatePrototype({ keyBindings: (prototype.keyBindings ?? []).map((b, i) => i === index ? { ...b, key: e.target.value } : b) })} />
            <input className={inputClass} value={binding.action} onChange={(e) => updatePrototype({ keyBindings: (prototype.keyBindings ?? []).map((b, i) => i === index ? { ...b, action: e.target.value } : b) })} />
            <button className="text-destructive px-1" onClick={() => updatePrototype({ keyBindings: (prototype.keyBindings ?? []).filter((_, i) => i !== index) })}>×</button>
          </div>
        ))}
        <button className="text-[10px] px-2 py-1 rounded bg-secondary hover:bg-secondary/80" onClick={() => updatePrototype({ keyBindings: [...(prototype.keyBindings ?? []), { key: 'Enter', action: 'activate' }] })}>+ Binding</button>
      </section>
    </div>
  );
}
