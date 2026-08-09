// AI integration Phase 5 — conflict surfacing (see todo.md). The agent
// bridge has no live push feed and no locking: a human editing at the same
// moment as an agent's turn can have their change silently overwritten
// (last-write-wins). This doesn't prevent that; it makes an agent-driven
// commit visible the instant it happens, so a human working alongside an
// agent isn't surprised by an edit they didn't make.

import { useEffect } from 'react';
import { Bot } from 'lucide-react';
import { useUIStore } from '../../stores';

const AUTO_DISMISS_MS = 4000;

export function AgentActivityToast() {
  const agentActivity = useUIStore((s) => s.agentActivity);
  const clearAgentActivity = useUIStore((s) => s.clearAgentActivity);

  useEffect(() => {
    if (!agentActivity) return;
    const timer = setTimeout(clearAgentActivity, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [agentActivity, clearAgentActivity]);

  if (!agentActivity) return null;

  return (
    <div
      key={agentActivity.at}
      className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 bg-popover border border-primary/40 rounded-full shadow-2xl text-xs"
    >
      <Bot className="w-3.5 h-3.5 text-primary flex-shrink-0" />
      <span>{agentActivity.message}</span>
    </div>
  );
}
