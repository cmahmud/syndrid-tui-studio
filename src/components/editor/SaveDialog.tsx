import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { buildTuiData, saveTuiData } from '../../utils/fileOps';

export function SaveDialog({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const initial = buildTuiData();
  const [filename, setFilename] = useState(initial?.suggestedName ?? 'untitled.tui');
  const json = initial?.json ?? '';

  const handleSave = async () => {
    const name = filename.trim() || 'untitled.tui';
    await saveTuiData(json, name.endsWith('.tui') ? name : name + '.tui');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-6 w-96"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-4">Save File</h2>
        <label className="block text-xs text-muted-foreground mb-1">File name</label>
        <input
          autoFocus
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') onClose();
          }}
          className="w-full px-3 py-1.5 bg-input border border-border rounded-lg text-sm focus:border-primary focus:outline-none mb-4"
        />
        {'showSaveFilePicker' in window ? (
          <p className="text-[11px] text-muted-foreground mb-4">A folder picker will open next.</p>
        ) : (
          <p className="text-[11px] text-muted-foreground mb-4">
            The file will be saved to your Downloads folder.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm hover:bg-accent rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
