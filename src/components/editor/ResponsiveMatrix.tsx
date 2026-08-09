import { X } from 'lucide-react';
import { useCanvasStore, useComponentStore, useProjectStore } from '../../stores';
import { resolveTreeForPreview } from '../../utils/projectResolver';
import { exportToText } from '../../utils/export/textExporter';
import { layoutEngine } from '../../utils/layout';

export function ResponsiveMatrix() {
  const canvas = useCanvasStore();
  const root = useComponentStore((s) => s.root);
  const project = useProjectStore();
  if (!project.matrixOpen) return null;

  return (
    <div className="absolute inset-3 z-[2000] rounded-lg border border-border bg-background/95 backdrop-blur flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div>
          <div className="text-xs font-semibold">Responsive terminal matrix</div>
          <div className="text-[10px] text-muted-foreground">Same design intent rendered at every committed breakpoint.</div>
        </div>
        <button onClick={() => project.setMatrixOpen(false)} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2 overflow-auto min-h-0 flex-1">
        {project.viewports.map((viewport) => {
          const resolved = resolveTreeForPreview(root, viewport.id, project.previewState);
          const text = exportToText(resolved, { format: 'text', width: viewport.width, height: viewport.height });
          const warningCount = layoutEngine.getNodesWithWarnings().length;
          return (
            <button key={viewport.id} className={`text-left rounded border p-2 overflow-hidden ${project.activeViewportId === viewport.id ? 'border-primary' : 'border-border'}`} onClick={() => { project.setActiveViewport(viewport.id); canvas.setSizeMode('custom'); canvas.setCanvasSize(viewport.width, viewport.height); project.setMatrixOpen(false); }}>
              <div className="flex justify-between gap-2 text-[10px] mb-1">
                <span className="font-semibold">{viewport.label}</span>
                <span className="flex items-center gap-1">
                  {warningCount > 0 && <span className="text-amber-400" title={`${warningCount} layout warning${warningCount === 1 ? '' : 's'}`}>⚠ {warningCount}</span>}
                  <span className="text-muted-foreground">{viewport.width}×{viewport.height}</span>
                </span>
              </div>
              <pre className="text-[5px] leading-[6px] whitespace-pre overflow-hidden bg-black text-zinc-200 rounded p-1" style={{ maxHeight: 180 }}>{text}</pre>
            </button>
          );
        })}
      </div>
    </div>
  );
}
