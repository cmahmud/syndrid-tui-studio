import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Play, Square, TerminalSquare } from 'lucide-react';
import { useComponentStore, useProjectStore } from '../../stores';
import type { ComponentNode, ImageAssetDefinition } from '../../types';
import { ansiToHtml } from '../../utils/export/textExporter';
import {
  loadNativeImageDataUri,
  nativePtyAvailable,
  nativePtyStatus,
  readNativePty,
  startNativePty,
  stopNativePty,
  writeNativePty,
} from '../../utils/nativePty';

const browserImageSource = (source: string) => /^(https?:|data:|blob:)/i.test(source);
const lines = (value: string) => value.replace(/\r\n/g, '\n').split('\n');

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded border border-border/50 bg-[#101114] text-[#d7dce2] shadow-inner"><div className="border-b border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-wider text-white/45">Adapter preview</div><div className="min-h-24 max-h-64 overflow-auto p-2 font-mono text-[11px]">{children}</div></div>;
}

function NativeImage({ asset, fit, alignment, alt }: { asset?: ImageAssetDefinition; fit: string; alignment: string; alt: string }) {
  const [nativeSrc, setNativeSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const source = asset?.source ?? '';
  const direct = source && browserImageSource(source) ? source : null;

  useEffect(() => {
    let cancelled = false;
    setNativeSrc(null); setError(null);
    if (!source || direct || !nativePtyAvailable()) return;
    void loadNativeImageDataUri(source).then((uri) => { if (!cancelled) setNativeSrc(uri); }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [direct, source]);

  const src = direct ?? nativeSrc;
  const objectFit = fit === 'original' ? 'none' : fit === 'stretch' ? 'fill' : fit;
  const justifyContent = alignment === 'start' ? 'flex-start' : alignment === 'end' ? 'flex-end' : 'center';
  return <div className="flex min-h-28 w-full items-center rounded bg-black/25 p-2" style={{ justifyContent }}>
    {src ? <img src={src} alt={alt} className="max-h-44 max-w-full" style={{ objectFit: objectFit as React.CSSProperties['objectFit'] }} /> : <div className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-white/15 px-3 text-center text-white/40"><ImageIcon size={20}/><span className="text-[10px] text-white/60">{asset?.name ?? 'No image asset bound'}</span>{source && <span className="max-w-full truncate text-[9px]">{source}</span>}<span className="text-[9px]">{nativePtyAvailable() ? (error ?? 'Loading local image…') : 'Open the desktop app to preview local files.'}</span></div>}
  </div>;
}

function TerminalPreview({ component }: { component: ComponentNode }) {
  const spec = component.prototype?.ecosystem?.terminal;
  const command = spec?.command || String(component.props.command ?? '') || 'cargo run';
  const cwd = spec?.cwd || String(component.props.cwd ?? '');
  const readOnly = spec?.readOnly ?? true;
  const sessionId = useMemo(() => `studio-${component.id}`, [component.id]);
  const [output, setOutput] = useState(''); const [input, setInput] = useState('');
  const [running, setRunning] = useState(false); const [status, setStatus] = useState('idle'); const [error, setError] = useState<string | null>(null);
  const owns = useRef(false); const outputRef = useRef<HTMLPreElement>(null); const available = nativePtyAvailable();

  const stop = async () => { if (!owns.current) return; try { await stopNativePty(sessionId); } catch { /* already gone */ } owns.current = false; setRunning(false); setStatus('stopped'); };
  const start = async () => { if (!available) { setError('Open the Tauri desktop app to run a live PTY.'); return; } setError(null); setOutput(''); setStatus('starting'); try { await startNativePty(sessionId, command, cwd || undefined); owns.current = true; setRunning(true); setStatus('running'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setStatus('error'); } };

  useEffect(() => {
    if (!running || !available) return;
    let cancelled = false;
    const timer = window.setInterval(async () => { try { const chunk = await readNativePty(sessionId); if (!cancelled && chunk) setOutput((current) => (current + chunk).slice(-200_000)); const next = await nativePtyStatus(sessionId); if (!cancelled) { setStatus(next); if (next.startsWith('exited:')) { setRunning(false); owns.current = false; } } } catch (cause) { if (!cancelled) { setError(cause instanceof Error ? cause.message : String(cause)); setRunning(false); } } }, 100);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [available, running, sessionId]);
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [output]);
  useEffect(() => () => { if (owns.current && nativePtyAvailable()) void stopNativePty(sessionId).catch(() => undefined); }, [sessionId]);
  const send = async () => { if (!input || !running || readOnly) return; try { await writeNativePty(sessionId, `${input}\r`); setInput(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };

  return <Shell><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-1.5 text-white/55"><TerminalSquare size={12}/> tui-term / native PTY <span className="rounded bg-white/5 px-1 py-0.5 text-[8px]">{status}</span></div><button type="button" onClick={() => running ? void stop() : void start()} className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[9px]">{running ? <Square size={9}/> : <Play size={9}/>} {running ? 'Stop' : 'Run'}</button></div><div className="mb-1 truncate text-[9px] text-white/35">{cwd || '~'} $ {command}</div><pre ref={outputRef} className="h-36 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/60 p-2 text-[10px]" dangerouslySetInnerHTML={{ __html: ansiToHtml(output || (available ? 'Press Run to start the PTY preview.' : 'Native desktop runtime required.')) }}/>{!readOnly && <div className="mt-1 flex gap-1"><input value={input} disabled={!running} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px]"/><button disabled={!running || !input} onClick={() => void send()} className="rounded bg-white/10 px-2 text-[9px]">Send</button></div>}{error && <div className="mt-1 text-[9px] text-red-300">{error}</div>}<div className="mt-1 text-[9px] text-white/35">scrollback {spec?.scrollback ?? 10_000} · {readOnly ? 'read-only' : 'interactive'}</div></Shell>;
}

export function EcosystemPreview({ component }: { component: ComponentNode }) {
  const project = useProjectStore(); const componentStore = useComponentStore(); const ecosystem = component.prototype?.ecosystem; const adapter = ecosystem?.adapter ?? 'native';
  const imageAsset = useMemo(() => project.imageAssets.find((asset) => asset.id === ecosystem?.image?.assetId || asset.id === component.props.assetId), [component.props.assetId, ecosystem?.image?.assetId, project.imageAssets]);
  if (adapter === 'native') return null;

  if (adapter === 'textarea') {
    const value = String(component.props.value ?? component.props.content ?? '');
    return <Shell><textarea className="min-h-24 w-full resize-y rounded border border-white/10 bg-black/30 p-2 text-[11px]" value={value} placeholder={String(component.props.placeholder ?? 'Edit text…')} spellCheck={false} wrap={ecosystem?.textarea?.softWrap === false ? 'off' : 'soft'} onChange={(event) => componentStore.updateProps(component.id, { ['value' in component.props ? 'value' : 'content']: event.target.value })}/><div className="mt-1 text-[9px] text-white/40">ratatui-textarea · search {ecosystem?.textarea?.search ? 'on' : 'off'} · tab {ecosystem?.textarea?.tabWidth ?? 4} · {ecosystem?.textarea?.editorMode ?? 'standard'}</div></Shell>;
  }
  if (adapter === 'image') {
    const fit = ecosystem?.image?.fit ?? imageAsset?.fit ?? 'contain'; const alignment = ecosystem?.image?.alignment ?? imageAsset?.alignment ?? 'center';
    return <Shell><NativeImage asset={imageAsset} fit={fit} alignment={alignment} alt={imageAsset?.alt ?? String(component.props.alt ?? 'Image')}/><div className="mt-1 text-[9px] text-white/40">ratatui-image · protocol {ecosystem?.image?.protocol ?? imageAsset?.protocol ?? 'auto'} · fit {fit} · fallback {ecosystem?.image?.fallback ?? imageAsset?.fallback ?? 'alt-text'}</div></Shell>;
  }
  if (adapter === 'terminal') return <TerminalPreview component={component}/>;
  if (adapter === 'ansi-text') return <Shell><pre className="whitespace-pre-wrap text-[10px]" dangerouslySetInnerHTML={{ __html: ansiToHtml(String(component.props.content ?? component.props.value ?? '')) }}/><div className="mt-1 text-[9px] text-white/40">ansi-to-tui</div></Shell>;
  if (adapter === 'syntax-highlight') { const content = String(component.props.content ?? component.props.value ?? ''); return <Shell><pre className="text-[10px]">{lines(content).map((line, index) => <div key={index} className="flex">{ecosystem?.syntax?.lineNumbers && <span className="mr-3 w-6 text-right text-white/25">{index + 1}</span>}<code>{line || ' '}</code></div>)}</pre><div className="mt-1 text-[9px] text-white/40">tui-syntax-highlight · {ecosystem?.syntax?.language ?? 'rust'} · {ecosystem?.syntax?.theme ?? 'terminal profile'}</div></Shell>; }
  if (adapter === 'node-graph') { const nodes = (Array.isArray(component.props.nodes) ? component.props.nodes : []).slice(0, 8) as Array<{id?: string; label?: string}>; return <Shell><div className={`flex min-h-24 items-center gap-2 ${ecosystem?.nodeGraph?.orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap'}`}>{(nodes.length ? nodes : [{id:'input',label:'Input'},{id:'output',label:'Output'}]).map((node,index,all) => <div key={node.id ?? index} className="flex items-center gap-2"><div className="rounded border border-primary/40 bg-primary/10 px-2 py-1.5">{ecosystem?.nodeGraph?.showPorts && '● '}{ecosystem?.nodeGraph?.showLabels === false ? node.id : node.label ?? node.id}</div>{index < all.length - 1 && <span className="text-white/30">→</span>}</div>)}</div><div className="mt-1 text-[9px] text-white/40">tui-nodes</div></Shell>; }
  if (adapter === 'scrollview') { const content = String(component.props.content ?? (Array.isArray(component.props.lines) ? component.props.lines.join('\n') : component.name)); return <Shell><div className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-white/10 p-2">{content}</div><div className="mt-1 text-[9px] text-white/40">tui-scrollview · {ecosystem?.scroll?.axis ?? 'vertical'} · step {ecosystem?.scroll?.step ?? 1}</div></Shell>; }
  return <Shell><div className={`rounded border border-white/10 p-3 ${adapter === 'big-text' ? 'text-2xl font-black tracking-widest' : ''}`}><div>{component.name}</div><div className="mt-1 text-[9px] text-white/40">{adapter} · production adapter is persisted in the .tui spec.</div></div></Shell>;
}
