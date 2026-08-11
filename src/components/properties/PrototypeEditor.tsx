import { useMemo, useState } from 'react';
import { useComponentStore, useProjectStore } from '../../stores';
import type {
  ComponentNode,
  ComponentStateOverride,
  PrototypeStateName,
  ResponsiveOverride,
} from '../../types';
import { EcosystemEditor } from './EcosystemEditor';
import { EffectEditor } from './EffectEditor';

const STATES: PrototypeStateName[] = ['focused', 'selected', 'disabled', 'loading', 'success', 'warning', 'error'];

export function PrototypeEditor({ component }: { component: ComponentNode }) {
  const componentStore = useComponentStore();
  const project = useProjectStore();
  const [stateName, setStateName] = useState<PrototypeStateName>('focused');
  const viewport = project.viewports.find((item) => item.id === project.activeViewportId) ?? project.viewports[0];
  const responsive = component.responsive?.[viewport?.id ?? 'narrow'];
  const prototype = component.prototype ?? {};
  const stateOverride = prototype.states?.[stateName];

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
          <select className={inputClass} value={String(responsive?.layout?.direction ?? '')} onChange={(e) => updateResponsive({ layout: { ...(responsive?.layout ?? {}), direction: e.target.value === 'row' || e.target.value === 'column' ? e.target.value : undefined } })}>
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
          <button className="px-2 py-1 text-[10px] rounded bg-secondary hover:bg-secondary/80" onClick={() => updateState({ style: { ...component.style }, note: `Captured from ${component.name}` })}>Capture style</button>
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

      <EffectEditor componentId={component.id} />
      <EcosystemEditor component={component} />

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
