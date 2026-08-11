import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Play, Square, TerminalSquare } from 'lucide-react';
import { useComponentStore, useProjectStore } from '../../stores';
import type { ComponentNode } from '../../types';
import { ansiToHtml } from '../../utils/export/textExporter';
import {
  nativePtyAvailable,
  nativePtyStatus,
  readNativePty,
  startNativePty,
  stopNativePty,
  writeNativePty,
} from '../../utils/nativePty';

function isBrowserImageSource(source: string): boolean {
  return /^(https?:|data:|blob:)/i.test(source);
}

function codeLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n');
}

function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded border border-border/50 bg-[#101114] text-[#d7dce2] shadow-inner">
      <div className="border-b border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-wider text-white/45">
        Adapter preview
      </div>
      <div className="min-h-24 max-h-64 overflow-auto p-2 font-mono text-[11px]">{children}</div>
    </div>
  );
}

function NativeTerminalPreview({ component }: { component: ComponentNode }) {
  const terminal = component.prototype?.ecosystem?.terminal;
  const command = terminal?.command || String(component.props.command ?? '') || 'cargo run';
  const cwd = terminal?.cwd || String(component.props.cwd ?? '');
  const readOnly = terminal?.readOnly ?? true;
  const sessionId = useMemo(() => `studio-${component.id}`, [component.id]);
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const ownsSession = useRef(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const available = nativePtyAvailable();

  const stop = async () => {
    if (!ownsSession.current) return;
    try { await stopNativePty(sessionId); } catch { /* session may already be gone */ }
    ownsSession.current = false;
    setRunning(false);
    setStatus('stopped');
  };

  const start = async () => {
    if (!available) {
      setError('Open the Tauri desktop app to run a live PTY preview.');
      return;
    }
    setError(null);
    setOutput('');
    setStatus('starting');
    try {
      await startNativePty(sessionId, command, cwd || undefined, 100, 30);
      ownsSession.current = true;
      setRunning(true);
      setStatus('running');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!running || !available) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const chunk = await readNativePty(sessionId);
        if (!cancelled && chunk) {
          setOutput((current) => {
            const next = current + chunk;
            return next.length > 200_000 ? next.slice(-200_000) : next;
          });
        }
        const nextStatus = await nativePtyStatus(sessionId);
        if (!cancelled) {
          setStatus(nextStatus);
          if (nextStatus.startsWith('exited:')) {
            setRunning(false);
            ownsSession.current = false;
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setRunning(false);
        }
      }
    }, 100);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [available, running, sessionId]);

  useEffect(() => {
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [output]);

  useEffect(() => () => {
    if (ownsSession.current && nativePtyAvailable()) void stopNativePty(sessionId).catch(() => undefined);
  }, [sessionId]);

  const submitInput = async () => {
    if (!input || !running || readOnly) return;
    try {
      await writeNativePty(sessionId, `${input}\r`);
      setInput('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <PreviewShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-white/55">
          <TerminalSquare size={12} />
          <span className="truncate">tui-term / native PTY</span>
          <span className={`rounded px-1 py-0.5 text-[8px] ${running ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-white/35'}`}>{status}</span>
        </div>
        <button
          type="button"
          onClick={() => running ? void stop() : void start()}
          className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] hover:bg-white/[0.08]"
        >
          {running ? <Square size={9} /> : <Play size={9} />}{running ? 'Stop' : 'Run'}
        </button>
      </div>
      <div className="mb-1 truncate text-[9px] text-white/35">{cwd || '~'} $ {command}</div>
      <pre
        ref={outputRef}
        className="h-36 overflow-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-black/60 p-2 text-[10px] leading-4 text-[#d7dce2]"
        dangerouslySetInnerHTML={{ __html: ansiToHtml(output || (available ? 'Press Run to start the PTY preview.' : 'Native desktop runtime required for live PTY playback.')) }}
      />
      {!readOnly && (
        <div className="mt-1 flex gap-1">
          <input
            value={input}
            disabled={!running}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void submitInput(); }}
            className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] outline-none disabled:opacity-40"
            placeholder="Send input…"
          />
          <button type="button" disabled={!running || !input} onClick={() => void submitInput()} className="rounded bg-white/10 px-2 text-[9px] disabled:opacity-40">Send</button>
        </div>
      )}
      {error && <div className="mt-1 rounded bg-red-500/10 px-2 py-1 text-[9px] text-red-300">{error}</div>}
      <div className="mt-1 flex flex-wrap gap-x-3 text-[9px] text-white/35">
        <span>scrollback {terminal?.scrollback ?? 10_000}</span>
        <span>{readOnly ? 'read-only' : 'interactive'}</span>
        <span>{available ? 'Tauri PTY available' : 'browser preview'}</span>
      </div>
    </PreviewShell>
  );
}

export function EcosystemPreview({ component }: { component: ComponentNode }) {
  const project = useProjectStore();
  const componentStore = useComponentStore();
  const ecosystem = component.prototype?.ecosystem;
  const adapter = ecosystem?.adapter ?? 'native';
  const imageAsset = useMemo(
    () => project.imageAssets.find((asset) => asset.id === ecosystem?.image?.assetId),
    [ecosystem?.image?.assetId, project.imageAssets]
  );

  if (adapter === 'native') return null;

  if (adapter === 'textarea') {
    const value = String(component.props.value ?? component.props.content ?? '');
    const placeholder = String(component.props.placeholder ?? 'Edit text…');
    return (
      <PreviewShell>
        <textarea className="min-h-24 w-full resize-y rounded border border-white/10 bg-black/30 p-2 font-mono text-[11px] text-inherit outline-none focus:border-primary/70" value={value} placeholder={placeholder} spellCheck={false} wrap={ecosystem?.textarea?.softWrap === false ? 'off' : 'soft'} onChange={(event) => {
          const key = 'value' in component.props ? 'value' : 'content';
          componentStore.updateProps(component.id, { [key]: event.target.value });
        }} />
        <div className="mt-1 flex flex-wrap gap-x-3 text-[9px] text-white/40"><span>ratatui-textarea</span><span>search {ecosystem?.textarea?.search ? 'on' : 'off'}</span><span>tab {ecosystem?.textarea?.tabWidth ?? 4}</span><span>{ecosystem?.textarea?.editorMode ?? 'standard'}</span></div>
      </PreviewShell>
    );
  }

  if (adapter === 'image') {
    const fit = ecosystem?.image?.fit ?? imageAsset?.fit ?? 'contain';
    const objectFit = fit === 'original' ? 'none' : fit === 'stretch' ? 'fill' : fit;
    const align = ecosystem?.image?.alignment ?? imageAsset?.alignment ?? 'center';
    const justifyContent = align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center';
    const src = imageAsset?.source ?? '';
    const alt = imageAsset?.alt ?? String(component.props.alt ?? imageAsset?.name ?? 'Image');
    return (
      <PreviewShell>
        <div className="flex min-h-28 w-full items-center rounded bg-black/25 p-2" style={{ justifyContent }}>
          {src && isBrowserImageSource(src) ? <img src={src} alt={alt} className="max-h-44 max-w-full" style={{ objectFit: objectFit as React.CSSProperties['objectFit'] }} /> : (
            <div className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-white/15 text-center text-white/40"><ImageIcon size={20} /><span className="text-[10px] text-white/60">{imageAsset?.name ?? 'No image asset bound'}</span>{src && <span className="max-w-full truncate px-3 text-[9px]">{src}</span>}<span className="text-[9px]">Local files render through ratatui-image in the production terminal.</span></div>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[9px] text-white/40"><span>protocol {ecosystem?.image?.protocol ?? imageAsset?.protocol ?? 'auto'}</span><span>fit {fit}</span><span>fallback {ecosystem?.image?.fallback ?? imageAsset?.fallback ?? 'alt-text'}</span></div>
      </PreviewShell>
    );
  }

  if (adapter === 'syntax-highlight') {
    const content = String(component.props.content ?? component.props.value ?? '');
    const lines = codeLines(content);
    const lineNumbers = ecosystem?.syntax?.lineNumbers ?? false;
    return <PreviewShell><pre className="overflow-auto whitespace-pre text-[10px] leading-4">{lines.map((line, index) => <div key={index} className="flex">{lineNumbers && <span className="mr-3 w-6 select-none text-right text-white/25">{index + 1}</span>}<code className="min-w-0 flex-1 text-[#cdd6f4]">{line || ' '}</code></div>)}</pre><div className="mt-1 text-[9px] text-white/40">tui-syntax-highlight · {ecosystem?.syntax?.language ?? 'rust'} · {ecosystem?.syntax?.theme ?? 'terminal profile'}</div></PreviewShell>;
  }

  if (adapter === 'ansi-text') {
    const content = String(component.props.content ?? component.props.value ?? '');
    return <PreviewShell><pre className="whitespace-pre-wrap break-words text-[10px] leading-4" dangerouslySetInnerHTML={{ __html: ansiToHtml(content) }} /><div className="mt-1 text-[9px] text-white/40">ansi-to-tui production projection · parsed preview</div></PreviewShell>;
  }

  if (adapter === 'terminal') return <NativeTerminalPreview component={component} />;

  if (adapter === 'node-graph') {
    const rawNodes = Array.isArray(component.props.nodes) ? component.props.nodes : [];
    const nodes = rawNodes.slice(0, 6) as Array<{ id?: string; label?: string }>;
    return <PreviewShell><div className={`flex min-h-24 items-center gap-2 ${ecosystem?.nodeGraph?.orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap'}`}>{(nodes.length ? nodes : [{ id: 'input', label: 'Input' }, { id: 'output', label: 'Output' }]).map((node, index, all) => <div key={node.id ?? index} className="flex items-center gap-2"><div className="rounded border border-primary/40 bg-primary/10 px-2 py-1.5 text-[10px] text-primary-foreground">{ecosystem?.nodeGraph?.showPorts && <span className="mr-1 text-white/35">●</span>}{ecosystem?.nodeGraph?.showLabels === false ? node.id ?? index : node.label ?? node.id ?? `Node ${index + 1}`}</div>{index < all.length - 1 && <span className="text-white/30">→</span>}</div>)}</div><div className="mt-1 text-[9px] text-white/40">tui-nodes · {ecosystem?.nodeGraph?.orientation ?? 'horizontal'}</div></PreviewShell>;
  }

  if (adapter === 'scrollview') {
    const content = String(component.props.content ?? (Array.isArray(component.props.lines) ? component.props.lines.join('\n') : component.name));
    return <PreviewShell><div className="max-h-28 overflow-auto rounded border border-white/10 bg-black/25 p-2 whitespace-pre-wrap">{content || 'Scrollable content\n'.repeat(12)}</div><div className="mt-1 text-[9px] text-white/40">tui-scrollview · {ecosystem?.scroll?.axis ?? 'vertical'} · step {ecosystem?.scroll?.step ?? 1}</div></PreviewShell>;
  }

  if (['big-text', 'card', 'popup', 'prompt', 'tree-widget', 'widget-list', 'interactive'].includes(adapter)) {
    return <PreviewShell><div className="rounded border border-white/10 bg-white/[0.03] p-3"><div className={adapter === 'big-text' ? 'text-2xl font-black tracking-widest' : 'font-semibold'}>{component.name}</div><div className="mt-1 text-[10px] text-white/45">{adapter} adapter · production state and input semantics are exported from the .tui spec.</div></div></PreviewShell>;
  }

  return null;
}
