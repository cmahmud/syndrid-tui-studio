import { useEscapeKey } from '../../hooks/useEscapeKey';
import { CHANGELOG } from '../../data/changelog';

const TYPE_BADGE: Record<string, string> = {
  feature: 'bg-primary/15 text-primary',
  improvement: 'bg-yellow-500/15 text-yellow-500',
  fix: 'bg-red-500/15 text-red-400',
  removed: 'bg-muted text-muted-foreground',
};
const TYPE_LABEL: Record<string, string> = {
  feature: 'New',
  improvement: 'Improved',
  fix: 'Fixed',
  removed: 'Removed',
};

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-6 w-[480px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-4 flex-shrink-0">Changelog</h2>

        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {CHANGELOG.map((release) => (
            <div key={release.version}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-semibold font-mono">v{release.version}</span>
                <span className="text-[10px] text-muted-foreground">{release.date}</span>
              </div>
              <div className="space-y-1.5 pl-2 border-l border-border/50">
                {release.changes.map((change, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span
                      className={`flex-shrink-0 mt-px px-1.5 py-px rounded text-[9px] font-medium uppercase tracking-wide ${TYPE_BADGE[change.type]}`}
                    >
                      {TYPE_LABEL[change.type]}
                    </span>
                    <span className="text-muted-foreground leading-relaxed">
                      {change.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm hover:bg-accent rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
