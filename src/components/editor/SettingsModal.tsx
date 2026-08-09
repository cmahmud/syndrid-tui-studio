import { useState } from 'react';
import { Check, FolderOpen, Sun, Moon } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useThemeStore, useUIStore, useProjectStore } from '../../stores';
import { THEMES } from '../../stores/themeStore';
import {
  ACCENT_PRESETS,
  applyAccentColor,
  resolveColorToHex,
  type AccentPreset,
} from '../../utils/accentColor';
import {
  selectDownloadFolder,
  getDownloadFolderName,
  isDirectoryPickerSupported,
} from '../../utils/downloadManager';
import { ColorPicker } from '../properties/ColorPicker';
import { connectAgentBridge, disconnectAgentBridge } from '../../utils/mcpBridge';

const AGENT_BRIDGE_STATUS_LABEL = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const themeStore = useThemeStore();
  const agentBridgeEnabled = useUIStore((s) => s.agentBridgeEnabled);
  const setAgentBridgeEnabled = useUIStore((s) => s.setAgentBridgeEnabled);
  const agentBridgeStatus = useUIStore((s) => s.agentBridgeStatus);
  const projectStore = useProjectStore();

  const [accentPreset, setAccentPresetState] = useState<AccentPreset>(
    (localStorage.getItem('settings-accent-preset') as AccentPreset) || 'tuigreen'
  );
  const [customColor, setCustomColor] = useState(
    localStorage.getItem('settings-accent-custom') || '#4ade80'
  );
  const [folderName, setFolderName] = useState(getDownloadFolderName);

  const handlePresetClick = (preset: AccentPreset, hex?: string) => {
    setAccentPresetState(preset);
    applyAccentColor(preset, hex);
    if (preset !== 'custom') setCustomColor(hex || customColor);
  };

  const handleCustomColorChange = (color: string) => {
    const hex = resolveColorToHex(
      color,
      THEMES[themeStore.currentTheme as keyof typeof THEMES] || THEMES.dracula
    );
    setCustomColor(hex);
    setAccentPresetState('custom');
    applyAccentColor('custom', hex);
  };

  const handleToggleAgentBridge = () => {
    const next = !agentBridgeEnabled;
    setAgentBridgeEnabled(next);
    if (next) connectAgentBridge();
    else disconnectAgentBridge();
  };

  const handleSelectFolder = async () => {
    const name = await selectDownloadFolder();
    if (name) setFolderName(name);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-6 w-[480px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-5">Settings</h2>

        {/* Appearance */}
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Appearance
          </p>
          <div className="flex items-center gap-3">
            <Sun className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span
              className={`text-sm ${!themeStore.darkMode ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
            >
              Light
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={themeStore.darkMode}
              onClick={() => themeStore.toggleDarkMode()}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer focus:outline-none ${
                themeStore.darkMode ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                  themeStore.darkMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span
              className={`text-sm ${themeStore.darkMode ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
            >
              Dark
            </span>
            <Moon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
        </div>

        {/* AI Agent Bridge */}
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Codex / MCP Agent Bridge
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={agentBridgeEnabled}
              onClick={handleToggleAgentBridge}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer focus:outline-none ${
                agentBridgeEnabled ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                  agentBridgeEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm">Let Codex or another MCP client inspect and edit this design</span>
          </div>
          {agentBridgeEnabled && (
            <p className="text-[11px] text-muted-foreground mt-2">
              {AGENT_BRIDGE_STATUS_LABEL[agentBridgeStatus]} — expects{' '}
              <code className="text-foreground">mcp-server/index.mjs</code> running on port 5175. Codex project config is included in <code className="text-foreground">.codex/config.toml</code>.
            </p>
          )}
        </div>

        {/* Prototype motion */}
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Prototype Motion</p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm">Reduced-motion preview</div>
              <div className="text-[11px] text-muted-foreground">Preview the fallback behavior Syndrid should use when motion is reduced.</div>
            </div>
            <button
              type="button" role="switch" aria-checked={projectStore.settings.reducedMotionDefault}
              onClick={() => projectStore.updateProjectSettings({ reducedMotionDefault: !projectStore.settings.reducedMotionDefault })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${projectStore.settings.reducedMotionDefault ? 'bg-primary' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${projectStore.settings.reducedMotionDefault ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Target: Ratatui · motion runtime: TachyonFX · design-time browser playback is an approximation.</p>
        </div>

        {/* Download Folder */}
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Default Download Folder
          </p>
          {isDirectoryPickerSupported() ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-1.5 bg-input border border-border/50 rounded text-sm text-muted-foreground truncate min-w-0">
                  {folderName || 'System default (Downloads)'}
                </div>
                <button
                  onClick={handleSelectFolder}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-accent border border-border/50 rounded text-sm transition-colors whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Browse…
                </button>
              </div>
              {folderName && (
                <button
                  onClick={() => {
                    localStorage.removeItem('settings-download-folder');
                    setFolderName('');
                  }}
                  className="mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Reset to default
                </button>
              )}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Folder selection requires Chrome or Edge. Files will save to your browser's Downloads
              folder.
            </p>
          )}
        </div>

        {/* Accent Color */}
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
            Editor Accent Color
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value, preset.hex)}
                title={preset.name}
                className="relative w-8 h-8 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: preset.hex,
                  borderColor: accentPreset === preset.value ? 'white' : 'transparent',
                  outline: accentPreset === preset.value ? `2px solid ${preset.hex}` : 'none',
                  outlineOffset: '2px',
                }}
              >
                {accentPreset === preset.value && (
                  <Check
                    className="w-3.5 h-3.5 absolute inset-0 m-auto"
                    style={{ color: preset.fg === '0 0% 5%' ? '#000' : '#fff' }}
                  />
                )}
              </button>
            ))}

            {/* Custom option */}
            <button
              onClick={() => {
                setAccentPresetState('custom');
                applyAccentColor('custom', customColor);
              }}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all ${
                accentPreset === 'custom'
                  ? 'border-white outline outline-2 outline-offset-2'
                  : 'border-border hover:border-border/80'
              }`}
              style={{
                background:
                  accentPreset === 'custom'
                    ? customColor
                    : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                outlineColor: accentPreset === 'custom' ? customColor : 'transparent',
              }}
              title="Custom color"
            />
          </div>

          {/* Custom color picker */}
          {accentPreset === 'custom' && (
            <div className="pl-1">
              <ColorPicker
                value={customColor.startsWith('#') ? customColor : undefined}
                onChange={handleCustomColorChange}
                label="Custom accent color"
              />
            </div>
          )}

          {/* Preset name label */}
          <p className="text-[11px] text-muted-foreground mt-2">
            {accentPreset === 'custom'
              ? 'Custom'
              : ACCENT_PRESETS.find((p) => p.value === accentPreset)?.name || ''}
          </p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
