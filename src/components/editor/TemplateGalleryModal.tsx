import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useComponentStore } from '../../stores';
import { TEMPLATES } from '../../constants/templates';

export function TemplateGalleryModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const setRoot = useComponentStore((s) => s.setRoot);

  const handlePick = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    setRoot(template.build());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-6 w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-1 flex-shrink-0">New from Template</h2>
        <p className="text-xs text-muted-foreground mb-4 flex-shrink-0">
          Start from a recurring TUI layout archetype instead of a blank screen. Replaces the
          current canvas — undo with Cmd/Ctrl+Z.
        </p>
        <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-3 pr-1">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handlePick(t.id)}
              className="text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors"
            >
              <div className="text-sm font-medium mb-1">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.description}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm hover:bg-accent rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
