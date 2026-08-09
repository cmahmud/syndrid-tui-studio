// Top toolbar with controls

import { useEffect, lazy, Suspense } from 'react';
import { Undo2, Redo2, ZoomIn, ZoomOut, Grid3x3, Contrast, Save, Palette, Search, Bot } from 'lucide-react';
import { useComponentStore, useCanvasStore, useThemeStore, useUIStore } from '../../stores';
// Lazy: the export panel pulls in all seven code exporters, which most
// sessions never open. Keep them out of the main bundle until they're needed.
const ExportModal = lazy(() =>
  import('../export/ExportModal').then((m) => ({ default: m.ExportModal }))
);
import { THEME_NAMES } from '../../stores/themeStore';
import { ComponentToolbar } from './ComponentToolbar';
import { AppMenu } from './AppMenu';
import { SaveDialog } from './SaveDialog';
import { AboutModal } from './AboutModal';
import { HelpModal } from './HelpModal';
import { ChangelogModal } from './ChangelogModal';
import { SettingsModal } from './SettingsModal';
import { TemplateGalleryModal } from './TemplateGalleryModal';
import { applyAccentColor, type AccentPreset } from '../../utils/accentColor';

export function Toolbar() {
  const componentStore = useComponentStore();
  const canvasStore = useCanvasStore();
  const themeStore = useThemeStore();
  const isToolbarDocked = useUIStore((s) => s.toolbarDocked);
  const activeDialog = useUIStore((s) => s.activeDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const openDialog = useUIStore((s) => s.openDialog);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const agentBridgeEnabled = useUIStore((s) => s.agentBridgeEnabled);
  const agentBridgeStatus = useUIStore((s) => s.agentBridgeStatus);

  // Apply saved accent color on mount
  useEffect(() => {
    const preset = (localStorage.getItem('settings-accent-preset') as AccentPreset) || 'tuigreen';
    const custom = localStorage.getItem('settings-accent-custom') || '#4ade80';
    applyAccentColor(preset, custom);
  }, []);

  const canUndo = componentStore.historyIndex > 0;
  const canRedo = componentStore.historyIndex < componentStore.history.length - 1;

  return (
    <>
      <div className="h-14 px-4 flex items-center justify-between bg-background border-b border-border">
        {/* Left - Logo/Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <img
              src={themeStore.darkMode ? '/logo-tui-studio_dark.svg' : '/logo-tui-studio_light.svg'}
              alt="Syndrid TUI Studio"
              className="w-7 h-7"
            />
            <AppMenu />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">Syndrid TUI Studio</h1>
            <div className="text-[10px] text-muted-foreground mt-0.5">Ratatui Design & Prototype Studio</div>
          </div>
        </div>

        {/* Center - Tools */}
        <div className="flex items-center gap-2">
          {/* Component Toolbar (when docked) */}
          {isToolbarDocked && (
            <>
              <ComponentToolbar />
              {/* Separator */}
              <div className="h-6 w-px bg-border" />
            </>
          )}

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => componentStore.undo()}
              disabled={!canUndo}
              className="p-2 hover:bg-accent rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => componentStore.redo()}
              disabled={!canRedo}
              className="p-2 hover:bg-accent rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-card rounded-lg px-1 py-0.5">
            <button
              onClick={() => canvasStore.setZoom(canvasStore.zoom - 0.25)}
              disabled={canvasStore.zoom <= 0.25}
              className="p-1.5 hover:bg-accent rounded-md disabled:opacity-30 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[3.5rem] text-center text-xs font-medium px-1">
              {Math.round(canvasStore.zoom * 100)}%
            </span>
            <button
              onClick={() => canvasStore.setZoom(canvasStore.zoom + 0.25)}
              disabled={canvasStore.zoom >= 4}
              className="p-1.5 hover:bg-accent rounded-md disabled:opacity-30 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => canvasStore.resetView()}
            className="px-2.5 py-1.5 text-xs hover:bg-accent rounded-lg transition-colors"
            title="Reset View"
          >
            Reset
          </button>

          {/* Grid */}
          <button
            onClick={() => canvasStore.toggleGrid()}
            className={`p-2 hover:bg-accent rounded-lg transition-colors ${
              canvasStore.showGrid ? 'bg-accent' : ''
            }`}
            title="Toggle Grid"
          >
            <Grid3x3 className="w-4 h-4" />
          </button>

          {/* Monochrome preview */}
          <button
            onClick={() => canvasStore.toggleMonochrome()}
            className={`p-2 hover:bg-accent rounded-lg transition-colors ${
              canvasStore.monochrome ? 'bg-accent' : ''
            }`}
            title="Monochrome Preview"
          >
            <Contrast className="w-4 h-4" />
          </button>

          {/* Theme Selector */}
          <div className="flex items-center gap-2 bg-card rounded-lg px-2.5 py-1.5">
            <Palette className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={themeStore.currentTheme}
              onChange={(e) => themeStore.setTheme(e.target.value as any)}
              className="text-xs bg-transparent border-none outline-none cursor-pointer text-foreground"
              title="Color Theme"
            >
              {THEME_NAMES.map((theme) => (
                <option key={theme.value} value={theme.value} className="bg-card">
                  {theme.label}
                </option>
              ))}
            </select>
          </div>

          {/* Command Palette */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            title="Command Palette (Ctrl+P)"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => openDialog('settings')}
            className={`px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-1.5 border transition-colors hover:bg-accent ${
              agentBridgeStatus === 'connected'
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : agentBridgeEnabled
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-border text-muted-foreground'
            }`}
            title={
              agentBridgeStatus === 'connected'
                ? 'Codex / MCP Agent Bridge connected'
                : agentBridgeEnabled
                  ? 'Codex / MCP Agent Bridge is enabled but not connected'
                  : 'Configure Codex / MCP Agent Bridge'
            }
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Codex</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                agentBridgeStatus === 'connected'
                  ? 'bg-green-400'
                  : agentBridgeEnabled
                    ? 'bg-amber-400'
                    : 'bg-muted-foreground/50'
              }`}
              aria-hidden="true"
            />
          </button>
          <button
            onClick={() => openDialog('save')}
            className="px-3 py-2 text-sm hover:bg-accent rounded-lg flex items-center gap-2 transition-colors"
            title="Save (Cmd+S)"
          >
            <Save className="w-4 h-4" />
            <span className="font-medium">Save</span>
          </button>
        </div>
      </div>

      {/* Export Modal — only rendered (and its chunk fetched) once actually opened */}
      {activeDialog === 'export' && (
        <Suspense fallback={null}>
          <ExportModal isOpen onClose={closeDialog} />
        </Suspense>
      )}

      {/* Save Dialog */}
      {activeDialog === 'save' && <SaveDialog onClose={closeDialog} />}

      {/* About Modal */}
      {activeDialog === 'about' && <AboutModal onClose={closeDialog} />}

      {/* Help Modal */}
      {activeDialog === 'help' && <HelpModal onClose={closeDialog} />}

      {/* Changelog Modal */}
      {activeDialog === 'changelog' && <ChangelogModal onClose={closeDialog} />}

      {/* Settings Modal */}
      {activeDialog === 'settings' && <SettingsModal onClose={closeDialog} />}

      {/* Template Gallery Modal */}
      {activeDialog === 'templates' && <TemplateGalleryModal onClose={closeDialog} />}
    </>
  );
}
