import { create } from 'zustand';

interface EffectPreviewState {
  playing: boolean;
  elapsedMs: number;
  speed: number;
  mode: 'normal' | 'reduced';
  loop: boolean;
  revision: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  replay: () => void;
  scrub: (elapsedMs: number) => void;
  setSpeed: (speed: number) => void;
  setMode: (mode: 'normal' | 'reduced') => void;
  setLoop: (loop: boolean) => void;
  advance: (deltaMs: number, durationMs: number) => void;
}

export const useEffectPreviewStore = create<EffectPreviewState>((set) => ({
  playing: false,
  elapsedMs: 0,
  speed: 1,
  mode: 'normal',
  loop: false,
  revision: 0,
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  toggle: () => set((state) => ({ playing: !state.playing })),
  reset: () => set({ playing: false, elapsedMs: 0, revision: Date.now() }),
  replay: () => set({ playing: true, elapsedMs: 0, revision: Date.now() }),
  scrub: (elapsedMs) => set({ elapsedMs: Math.max(0, elapsedMs), playing: false }),
  setSpeed: (speed) => set({ speed: Math.max(0.1, Math.min(4, speed)) }),
  setMode: (mode) => set({ mode, elapsedMs: 0, revision: Date.now() }),
  setLoop: (loop) => set({ loop }),
  advance: (deltaMs, durationMs) => set((state) => {
    if (!state.playing) return {};
    const duration = Math.max(0, durationMs);
    if (duration === 0) return { playing: false, elapsedMs: 0 };
    const next = state.elapsedMs + Math.max(0, deltaMs) * state.speed;
    if (next < duration) return { elapsedMs: next };
    if (state.loop) return { elapsedMs: next % duration, revision: Date.now() };
    return { elapsedMs: duration, playing: false };
  }),
}));
