import { useEscapeKey } from '../../hooks/useEscapeKey';

const isMacHelp = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const modHelp = isMacHelp ? '⌘' : 'Ctrl+';

const SHORTCUT_GROUPS = [
  {
    title: 'General',
    shortcuts: [
      { key: `${modHelp}P`, label: 'Command Palette' },
      { key: `${modHelp}Z`, label: 'Undo' },
      { key: `${modHelp}⇧Z`, label: 'Redo' },
      { key: `${modHelp}S`, label: 'Save' },
      { key: `${modHelp}O`, label: 'Open' },
      { key: `${modHelp}E`, label: 'Export' },
      { key: `${modHelp}C`, label: 'Copy' },
      { key: `${modHelp}V`, label: 'Paste' },
      { key: 'Del / ⌫', label: 'Delete selected' },
    ],
  },
  {
    title: 'Add Component',
    shortcuts: [
      { key: 'B', label: 'Button' },
      { key: 'R', label: 'Box' },
      { key: 'Y', label: 'Text' },
      { key: 'I', label: 'TextInput' },
      { key: 'K', label: 'Checkbox' },
      { key: 'A', label: 'Radio' },
      { key: 'S', label: 'Select' },
      { key: 'O', label: 'Toggle' },
      { key: 'P', label: 'ProgressBar' },
      { key: 'N', label: 'Spinner' },
      { key: 'T', label: 'Tabs' },
      { key: 'L', label: 'List' },
      { key: 'E', label: 'Tree' },
      { key: 'M', label: 'Menu' },
      { key: 'J', label: 'Spacer' },
    ],
  },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-6 w-[520px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-4">Keyboard Shortcuts</h2>

        <div className="grid grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.shortcuts.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <kbd className="text-[10px] font-mono bg-muted border border-border rounded px-1.5 py-0.5 whitespace-nowrap">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-border flex justify-end">
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
