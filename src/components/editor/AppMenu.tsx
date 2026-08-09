import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useUIStore } from '../../stores';
import type { DialogName } from '../../stores/uiStore';
import { openTuiFile } from '../../utils/fileOps';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

export function AppMenu() {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openDialog = useUIStore((s) => s.openDialog);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHovered(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const close = () => {
    setOpen(false);
    setHovered(null);
  };

  const openDialogAndClose = (name: DialogName) => {
    close();
    openDialog(name);
  };

  // TODO(task_7b18da74): Copy/Paste still dispatch to no listener — dead
  // no-ops, pre-existing, flagged for a separate fix rather than bundled here.
  const dispatch = (event: string) => {
    close();
    window.dispatchEvent(new Event(event));
  };

  const groups: Array<
    Array<{
      label: string;
      shortcut?: string;
      action?: () => void;
      submenu?: Array<{ label: string; shortcut?: string; action: () => void }>;
    }>
  > = [
    [
      {
        label: 'Command Palette',
        shortcut: `${mod}P`,
        action: () => {
          close();
          setCommandPaletteOpen(true);
        },
      },
    ],
    [
      {
        label: 'File',
        submenu: [
          {
            label: 'New from Template',
            action: () => openDialogAndClose('templates'),
          },
          {
            label: 'Open',
            shortcut: `${mod}O`,
            action: () => {
              close();
              openTuiFile();
            },
          },
          {
            label: 'Save',
            shortcut: `${mod}S`,
            action: () => openDialogAndClose('save'),
          },
          { label: 'Export', shortcut: `${mod}E`, action: () => openDialogAndClose('export') },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Copy', shortcut: `${mod}C`, action: () => dispatch('command-copy') },
          { label: 'Paste', shortcut: `${mod}V`, action: () => dispatch('command-paste') },
        ],
      },
    ],
    [{ label: 'Settings', shortcut: `${mod}K`, action: () => openDialogAndClose('settings') }],
    [
      {
        label: 'Help',
        submenu: [
          {
            label: 'Keyboard Shortcuts',
            shortcut: `${mod}?`,
            action: () => openDialogAndClose('help'),
          },
          { label: 'Changelog', action: () => openDialogAndClose('changelog') },
          { label: 'About', action: () => openDialogAndClose('about') },
        ],
      },
    ],
  ];

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger */}
      <button
        onClick={() => {
          setOpen((o) => !o);
          setHovered(null);
        }}
        className={`flex items-center p-1 rounded transition-colors ${open ? 'bg-accent' : 'hover:bg-accent'}`}
        title="Menu"
      >
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-2xl py-1 z-50 text-sm">
          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="my-1 border-t border-border/40" />}
              {group.map((item) =>
                item.submenu ? (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={() => setHovered(item.label)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <div
                      className={`flex items-center justify-between px-3 py-1.5 cursor-default transition-colors ${hovered === item.label ? 'bg-accent' : 'hover:bg-accent'}`}
                    >
                      <span>{item.label}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    {hovered === item.label && (
                      <div className="absolute left-full top-0 w-48 bg-popover border border-border rounded-lg shadow-2xl py-1 z-50">
                        {item.submenu.map((sub) => (
                          <button
                            key={sub.label}
                            onClick={sub.action}
                            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-accent transition-colors text-left"
                          >
                            <span>{sub.label}</span>
                            {sub.shortcut && (
                              <span className="text-xs text-muted-foreground">{sub.shortcut}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-accent transition-colors text-left"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-xs text-muted-foreground">{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
