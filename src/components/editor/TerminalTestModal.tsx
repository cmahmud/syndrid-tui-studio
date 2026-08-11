import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Pause, Play, RotateCcw, Send, Square, TerminalSquare, Trash2, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useComponentStore, useProjectStore } from '../../stores';
import type { TerminalTestScenario, TerminalTestSettings } from '../../types';
import {
  nativePtyAvailable,
  nativePtyStatus,
  readNativePty,
  resizeNativePty,
  startNativeTerminalTest,
  stopNativePty,
  writeNativePty,
} from '../../utils/nativePty';
import {
  BUILTIN_TERMINAL_TEST_SCENARIOS,
  buildTerminalTestSpec,
} from '../../utils/terminalTestSpec';

interface TerminalTestModalProps {
  onClose: () => void;
}

const SESSION_ID = 'studio-terminal-test';
const SPEEDS = [0.25, 0.5, 1, 2, 4];

function scenarioForId(id: string, custom: TerminalTestScenario[]): TerminalTestScenario {
  if (id.startsWith('custom:')) {
    const found = custom.find((scenario) => `custom:${scenario.id}` === id);
    if (found) return found;
  }
  return BUILTIN_TERMINAL_TEST_SCENARIOS.find((scenario) => scenario.id === id)
    ?? BUILTIN_TERMINAL_TEST_SCENARIOS[0];
}

function sampleCustomScenario(): TerminalTestScenario {
  return {
    id: 'custom-loading',
    name: 'Custom Loading',
    preset: 'custom',
    seed: 42,
    durationMs: 5000,
    variables: { components: {} },
    timeline: [],
  };
}

function validateCustomScenario(value: unknown): TerminalTestScenario {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Scenario must be a JSON object.');
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) throw new Error('Scenario id is required.');
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('Scenario name is required.');
  const presets = new Set([
    'default', 'empty', 'loading', 'loaded', 'error', 'offline',
    'slow-network', 'large-data', 'unicode', 'custom',
  ]);
  const preset = typeof raw.preset === 'string' && presets.has(raw.preset)
    ? raw.preset as TerminalTestScenario['preset']
    : 'custom';
  const timeline = Array.isArray(raw.timeline) ? raw.timeline : [];
  const variables = raw.variables && typeof raw.variables === 'object' && !Array.isArray(raw.variables)
    ? raw.variables as Record<string, unknown>
    : {};
  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
    preset,
    seed: Number.isFinite(Number(raw.seed)) ? Math.round(Number(raw.seed)) : 42,
    durationMs: Number.isFinite(Number(raw.durationMs)) ? Math.max(100, Math.round(Number(raw.durationMs))) : 4000,
    variables,
    timeline: timeline as TerminalTestScenario['timeline'],
  };
}

export function TerminalTestModal({ onClose }: TerminalTestModalProps) {
  const root = useComponentStore((state) => state.root);
  const project = useProjectStore();
  const available = nativePtyAvailable();
  const settings = project.terminalTest;
  const selectedScenario = scenarioForId(settings.scenarioId, project.testScenarios);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [customJson, setCustomJson] = useState(() => JSON.stringify(sampleCustomScenario(), null, 2));
  const [customError, setCustomError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const runningRef = useRef(false);
  const interactiveRef = useRef(settings.interactive);
  const ownsSession = useRef(false);
  const restartTimer = useRef<number | null>(null);
  const launchRevision = useRef(0);

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { interactiveRef.current = settings.interactive; }, [settings.interactive]);

  const projectData = useMemo(
    () => project.exportProjectData(),
    [project]
  );
  const testSpec = useMemo(
    () => buildTerminalTestSpec(root, projectData),
    [root, projectData]
  );
  const specJson = useMemo(() => JSON.stringify(testSpec), [testSpec]);
  const viewport = testSpec.viewport;
  const durationMs = Math.max(100, selectedScenario.durationMs);
  const initialViewportRef = useRef(viewport);

  const setSettings = useCallback((patch: Partial<TerminalTestSettings>) => {
    project.updateTerminalTest(patch);
  }, [project]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) return;
    const terminal = new Terminal({
      cols: initialViewportRef.current.width,
      rows: initialViewportRef.current.height,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'block',
      disableStdin: !interactiveRef.current,
      fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1,
      letterSpacing: 0,
      scrollback: 5000,
      allowTransparency: false,
      theme: {
        background: '#050608',
        foreground: '#d7dce2',
        cursor: '#67e8f9',
        selectionBackground: '#164e63',
        black: '#111318',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e7eb',
        brightBlack: '#6b7280',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
    });
    terminal.open(host);
    terminal.writeln('\x1b[2mPress Run to start the native Ratatui/TachyonFX preview.\x1b[0m');
    const inputDisposable = terminal.onData((data) => {
      if (!runningRef.current || !interactiveRef.current) return;
      void writeNativePty(SESSION_ID, data).catch(() => undefined);
    });
    xtermRef.current = terminal;
    return () => {
      inputDisposable.dispose();
      terminal.dispose();
      if (xtermRef.current === terminal) xtermRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;
    terminal.options.disableStdin = !settings.interactive;
  }, [settings.interactive]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;
    terminal.resize(viewport.width, viewport.height);
    if (running && ownsSession.current) {
      void resizeNativePty(SESSION_ID, viewport.width, viewport.height).catch(() => undefined);
    }
  }, [running, viewport.height, viewport.width]);

  const stop = useCallback(async (nextStatus = 'stopped') => {
    if (restartTimer.current !== null) {
      window.clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    if (ownsSession.current && available) {
      try { await stopNativePty(SESSION_ID); } catch { /* already exited */ }
    }
    ownsSession.current = false;
    runningRef.current = false;
    setRunning(false);
    setStatus(nextStatus);
  }, [available]);

  const launch = useCallback(async (json: string, resetTerminal = true) => {
    if (!available) {
      setError('Terminal Test Mode requires the Tauri desktop app.');
      return;
    }
    const revision = ++launchRevision.current;
    setError(null);
    setStatus('starting');
    const terminal = xtermRef.current;
    if (resetTerminal) terminal?.reset();
    try {
      if (ownsSession.current) {
        try { await stopNativePty(SESSION_ID); } catch { /* replacement is safe */ }
      }
      terminal?.resize(viewport.width, viewport.height);
      await startNativeTerminalTest(SESSION_ID, json, viewport.width, viewport.height);
      if (revision !== launchRevision.current) return;
      ownsSession.current = true;
      runningRef.current = true;
      setRunning(true);
      setStatus('running');
      window.setTimeout(() => terminal?.focus(), 0);
    } catch (cause) {
      if (revision !== launchRevision.current) return;
      ownsSession.current = false;
      runningRef.current = false;
      setRunning(false);
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [available, viewport.height, viewport.width]);

  const replay = useCallback(async () => {
    if (running) {
      try {
        await writeNativePty(SESSION_ID, '\x12');
        setSettings({ startAtMs: 0 });
        return;
      } catch { /* restart below */ }
    }
    setSettings({ startAtMs: 0 });
    await launch(specJson);
  }, [launch, running, setSettings, specJson]);

  useEffect(() => {
    if (!running || !available) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const chunk = await readNativePty(SESSION_ID);
        if (!cancelled && chunk) xtermRef.current?.write(chunk);
        const next = await nativePtyStatus(SESSION_ID);
        if (!cancelled) {
          setStatus(next);
          if (next.startsWith('exited:')) {
            ownsSession.current = false;
            runningRef.current = false;
            setRunning(false);
          }
        }
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : String(cause);
          if (!message.includes('unknown PTY session')) setError(message);
          ownsSession.current = false;
          runningRef.current = false;
          setRunning(false);
        }
      }
    }, 50);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [available, running]);

  useEffect(() => {
    if (!running || !settings.hotReload || !available) return;
    if (restartTimer.current !== null) window.clearTimeout(restartTimer.current);
    restartTimer.current = window.setTimeout(() => {
      restartTimer.current = null;
      void launch(specJson, true);
    }, 250);
    return () => {
      if (restartTimer.current !== null) {
        window.clearTimeout(restartTimer.current);
        restartTimer.current = null;
      }
    };
  }, [available, launch, running, settings.hotReload, specJson]);

  useEffect(() => () => {
    launchRevision.current += 1;
    if (restartTimer.current !== null) window.clearTimeout(restartTimer.current);
    if (ownsSession.current && nativePtyAvailable()) void stopNativePty(SESSION_ID).catch(() => undefined);
  }, []);

  const sendText = async () => {
    if (!running || !textInput) return;
    try {
      await writeNativePty(SESSION_ID, `${textInput}\r`);
      setTextInput('');
      xtermRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const editSelectedCustom = () => {
    setCustomJson(JSON.stringify(
      settings.scenarioId.startsWith('custom:') ? selectedScenario : sampleCustomScenario(),
      null,
      2
    ));
    setCustomError(null);
    setShowCustom(true);
  };

  const saveCustom = () => {
    try {
      const scenario = validateCustomScenario(JSON.parse(customJson));
      project.upsertTestScenario(scenario);
      project.updateTerminalTest({ scenarioId: `custom:${scenario.id}` });
      setCustomError(null);
      setShowCustom(false);
    } catch (cause) {
      setCustomError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deleteCustom = () => {
    if (!settings.scenarioId.startsWith('custom:')) return;
    project.removeTestScenario(settings.scenarioId.slice('custom:'.length));
    setShowCustom(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-label="Terminal Test Mode">
      <div className="relative flex h-[min(860px,92vh)] w-[min(1420px,96vw)] flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4" />
            <div>
              <div className="text-sm font-semibold">Terminal Test Mode</div>
              <div className="text-[10px] text-muted-foreground">Real Ratatui + TachyonFX · native PTY/ConPTY · xterm VT emulator</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 hover:bg-accent" title="Close terminal test">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-r border-border p-3 text-xs">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Viewport</span>
                <select value={settings.viewportId} onChange={(event) => setSettings({ viewportId: event.target.value })} className="w-full rounded border border-border bg-card px-2 py-1.5">
                  {project.viewports.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.width}×{item.height}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Scenario</span>
                <select value={settings.scenarioId} onChange={(event) => setSettings({ scenarioId: event.target.value, startAtMs: 0 })} className="w-full rounded border border-border bg-card px-2 py-1.5">
                  <optgroup label="Built-in">
                    {BUILTIN_TERMINAL_TEST_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
                  </optgroup>
                  {project.testScenarios.length > 0 && <optgroup label="Custom">
                    {project.testScenarios.map((scenario) => <option key={scenario.id} value={`custom:${scenario.id}`}>{scenario.name}</option>)}
                  </optgroup>}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1 block text-[10px] text-muted-foreground">Speed</span>
                  <select value={settings.speed} onChange={(event) => setSettings({ speed: Number(event.target.value) })} className="w-full rounded border border-border bg-card px-2 py-1.5">
                    {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
                  </select>
                </label>
                <div>
                  <span className="mb-1 block text-[10px] text-muted-foreground">Runtime</span>
                  <div className={`rounded border px-2 py-1.5 ${available ? 'border-green-500/30 text-green-400' : 'border-amber-500/30 text-amber-400'}`}>{available ? 'Native ready' : 'Desktop required'}</div>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>Start position</span><span>{settings.startAtMs} ms</span></span>
                <input type="range" min={0} max={durationMs} step={50} value={Math.min(settings.startAtMs, durationMs)} onChange={(event) => setSettings({ startAtMs: Number(event.target.value) })} className="w-full" />
              </label>

              <div className="space-y-1.5 rounded border border-border bg-card/40 p-2">
                {([
                  ['fakeData', 'Use deterministic fake data'],
                  ['reducedMotion', 'Reduced motion'],
                  ['loop', 'Loop scenario'],
                  ['hotReload', 'Hot reload while running'],
                  ['interactive', 'Forward keyboard input'],
                  ['showDebugOverlay', 'Runtime debug overlay'],
                ] as Array<[keyof TerminalTestSettings, string]>).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => setSettings({ [key]: event.target.checked } as Partial<TerminalTestSettings>)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={editSelectedCustom} className="rounded border border-border px-2 py-1.5 hover:bg-accent">{settings.scenarioId.startsWith('custom:') ? 'Edit scenario' : 'New scenario'}</button>
                <button type="button" onClick={() => xtermRef.current?.reset()} className="rounded border border-border px-2 py-1.5 hover:bg-accent">Clear terminal</button>
              </div>

              <div className="rounded border border-border bg-card/40 p-2 text-[10px] text-muted-foreground">
                <div>Scenario: {selectedScenario.name}</div>
                <div>Duration: {selectedScenario.durationMs} ms</div>
                <div>Seed: {selectedScenario.seed}</div>
                <div>Effects: {testSpec.motion.length}</div>
                <div>Nodes: {testSpec.nodes.length}</div>
                <div>Layout warnings: {testSpec.warnings.length}</div>
              </div>

              {testSpec.warnings.length > 0 && <div className="flex gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span>This scenario has {testSpec.warnings.length} layout warning(s). The native terminal still runs so you can inspect them.</span></div>}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col bg-[#050608]">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
              <button type="button" disabled={!available} onClick={() => running ? void stop() : void launch(specJson)} className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-1.5 text-xs disabled:opacity-40">
                {running ? <Square className="h-3.5 w-3.5"/> : <Play className="h-3.5 w-3.5"/>} {running ? 'Stop' : 'Run'}
              </button>
              <button type="button" disabled={!available} onClick={() => void replay()} className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-1.5 text-xs disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5"/> Replay</button>
              <button type="button" disabled={!running} onClick={() => void writeNativePty(SESSION_ID, '\x10')} className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-1.5 text-xs disabled:opacity-40"><Pause className="h-3.5 w-3.5"/> Pause/Play</button>
              <span className="rounded bg-white/5 px-2 py-1 text-[10px] text-white/50">{status}</span>
              <span className="text-[10px] text-white/35">{viewport.width}×{viewport.height} · Ctrl+Q quit · Ctrl+R replay · Ctrl+P pause</span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-black p-2">
              <div ref={terminalHostRef} className="inline-block min-h-full min-w-full" aria-label="Interactive native terminal output" />
            </div>

            <div className="flex gap-2 border-t border-white/10 p-2">
              <input value={textInput} onChange={(event) => setTextInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void sendText(); } }} disabled={!running || !settings.interactive} placeholder="Send text to the native terminal…" className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white disabled:opacity-40" />
              <button type="button" disabled={!running || !settings.interactive || !textInput} onClick={() => void sendText()} className="flex items-center gap-1 rounded border border-white/10 px-3 text-xs disabled:opacity-40"><Send className="h-3 w-3"/> Send</button>
            </div>

            {error && <div className="border-t border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
          </main>
        </div>

        {showCustom && <div className="absolute inset-8 z-10 flex flex-col rounded-xl border border-border bg-background p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div><div className="text-sm font-semibold">Custom Test Scenario</div><div className="text-[10px] text-muted-foreground">Persisted in the .tui v3 project and usable through MCP.</div></div>
            <button type="button" onClick={() => setShowCustom(false)} className="rounded p-2 hover:bg-accent"><X className="h-4 w-4"/></button>
          </div>
          <textarea value={customJson} onChange={(event) => setCustomJson(event.target.value)} spellCheck={false} className="min-h-0 flex-1 resize-none rounded border border-border bg-black/40 p-3 font-mono text-xs" />
          {customError && <div className="mt-2 text-xs text-red-400">{customError}</div>}
          <div className="mt-3 flex justify-end gap-2">
            {settings.scenarioId.startsWith('custom:') && <button type="button" onClick={deleteCustom} className="flex items-center gap-1 rounded border border-red-500/30 px-3 py-1.5 text-xs text-red-400"><Trash2 className="h-3 w-3"/> Delete</button>}
            <button type="button" onClick={() => setShowCustom(false)} className="rounded border border-border px-3 py-1.5 text-xs">Cancel</button>
            <button type="button" onClick={saveCustom} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">Save Scenario</button>
          </div>
        </div>}
      </div>
    </div>
  );
}
