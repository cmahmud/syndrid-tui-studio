// Main canvas for displaying the TUI design

import { useEffect, useState, useRef, memo, type CSSProperties } from 'react';
import {
  useCanvasStore,
  useComponentStore,
  useSelectionStore,
  useThemeStore,
  useUIStore,
  useProjectStore,
} from '../../stores';
import { layoutEngine } from '../../utils/layout';
import { dragStore } from '../../hooks/useDragAndDrop';
import { useCanvasKeyboardNudge } from '../../hooks/useCanvasKeyboard';
import { useComponentSelection } from '../../hooks/useComponentSelection';
import { useComponentDrag } from '../../hooks/useComponentDrag';
import { COMPONENT_LIBRARY } from '../../constants/components';
import {
  SPINNER_PRESETS,
  renderBar,
  renderGauge,
  renderSparkline,
  renderStatusBar,
  renderToast,
  tailLines,
  headLines,
  getSeparatorChar,
} from '../../constants/assets';
import { THEMES } from '../../stores/themeStore';
import { interpolateGradientColor } from '../../utils/rendering/ansi';
import { padToWidth, sliceByWidth, stringWidth } from '../../utils/rendering/width';
import { ComponentToolbar } from './ComponentToolbar';
import { NumericInput } from '../properties/LayoutEditor';
import { resolveTreeForPreview } from '../../utils/projectResolver';
import { ResponsiveMatrix } from './ResponsiveMatrix';

// ── Canvas size control ───────────────────────────────────────────────────────

function CanvasSizeControl() {
  const canvasStore = useCanvasStore();
  const project = useProjectStore();
  const [cols, setCols] = useState(canvasStore.width);
  const [rows, setRows] = useState(canvasStore.height);

  useEffect(() => {
    if (canvasStore.sizeMode !== 'custom') {
      setCols(canvasStore.width);
      setRows(canvasStore.height);
    }
  }, [canvasStore.sizeMode, canvasStore.width, canvasStore.height]);

  const selectViewport = (id: string) => {
    const viewport = project.viewports.find((item) => item.id === id);
    if (!viewport) return;
    project.setActiveViewport(id);
    canvasStore.setSizeMode('custom');
    canvasStore.setCanvasSize(viewport.width, viewport.height);
    setCols(viewport.width);
    setRows(viewport.height);
  };

  return (
    <div className="absolute -bottom-9 left-0 right-0 flex items-center gap-1.5 whitespace-nowrap">
      {project.viewports.map((viewport) => (
        <button
          key={viewport.id}
          onClick={() => selectViewport(viewport.id)}
          className={`px-2 py-1 text-[10px] rounded border transition-colors ${project.activeViewportId === viewport.id ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-card hover:bg-accent'}`}
          title={`${viewport.description ?? viewport.label} (${viewport.width}×${viewport.height})`}
        >
          {viewport.label}
        </button>
      ))}
      <button onClick={() => project.setMatrixOpen(true)} className="px-2 py-1 text-[10px] rounded border border-border/50 bg-card hover:bg-accent">Matrix</button>
      <span className="h-4 w-px bg-border mx-0.5" />
      <select
        value={canvasStore.sizeMode}
        onChange={(e) => canvasStore.setSizeMode(e.target.value as any)}
        className="px-2 py-1 text-[10px] bg-card border border-border/50 rounded focus:border-primary focus:outline-none"
      >
        <option value="default">80×25</option>
        <option value="responsive">Fit editor</option>
        <option value="custom">Custom</option>
      </select>
      {canvasStore.sizeMode === 'custom' && (
        <>
          <NumericInput value={cols} onChange={setCols} min={10} max={240} className="w-12 px-1 py-1 text-[10px] bg-card border border-border/50 rounded text-center" />
          <span className="text-[10px] text-muted-foreground">×</span>
          <NumericInput value={rows} onChange={setRows} min={10} max={120} className="w-12 px-1 py-1 text-[10px] bg-card border border-border/50 rounded text-center" />
          <button onClick={() => canvasStore.setCanvasSize(cols, rows)} className="px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded">Apply</button>
        </>
      )}
      <button onClick={project.replayAnimations} className="px-2 py-1 text-[10px] rounded border border-border/50 bg-card hover:bg-accent">Replay motion</button>
    </div>
  );
}

export function Canvas() {
  // Subscribe to ENTIRE store to avoid stale state
  const componentStore = useComponentStore();
  const canvasStore = useCanvasStore();
  const selectionStore = useSelectionStore();
  const themeStore = useThemeStore();
  const projectStore = useProjectStore();

  const { root } = componentStore;
  const previewRoot = resolveTreeForPreview(root, projectStore.activeViewportId, projectStore.previewState);
  const isToolbarDocked = useUIStore((s) => s.toolbarDocked);

  const [isDragOver, setIsDragOver] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Responsive canvas sizing
  useEffect(() => {
    if (canvasStore.sizeMode !== 'responsive') {
      return;
    }

    const updateCanvasSize = () => {
      if (!viewportRef.current) return;

      // Get available space from the viewport container
      // The p-4 class adds 16px padding on each side
      // Also account for the dropdown selector at the bottom (~40px)
      const availableWidth = viewportRef.current.clientWidth - 32; // minus 2*16px padding
      const availableHeight = viewportRef.current.clientHeight - 72; // minus padding + dropdown space

      const cellWidth = 8;
      const cellHeight = 16;

      // Calculate columns and rows that fit
      const cols = Math.floor(availableWidth / (cellWidth * canvasStore.zoom));
      const rows = Math.floor(availableHeight / (cellHeight * canvasStore.zoom));

      // Update canvas size
      canvasStore.setCanvasSize(
        Math.max(10, Math.min(200, cols)),
        Math.max(10, Math.min(100, rows))
      );
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [canvasStore, canvasStore.sizeMode, canvasStore.zoom, root]);

  // Keyboard navigation for selected components
  useCanvasKeyboardNudge();

  const cellWidth = projectStore.settings.terminalCellWidthPx;
  const cellHeight = projectStore.settings.terminalCellHeightPx

  const viewportWidth = canvasStore.width * cellWidth * canvasStore.zoom;
  const viewportHeight = canvasStore.height * cellHeight * canvasStore.zoom;

  // Calculate layout SYNCHRONOUSLY during render so ComponentRenderer has layout data
  // This must happen BEFORE ComponentRenderer tries to access layout
  const activeCommittedViewport = projectStore.viewports.find((viewport) => viewport.id === projectStore.activeViewportId);
  const isCommittedViewport = !!activeCommittedViewport && activeCommittedViewport.width === canvasStore.width && activeCommittedViewport.height === canvasStore.height;
  layoutEngine.calculateLayout(
    previewRoot,
    canvasStore.width,
    canvasStore.height,
    canvasStore.sizeMode === 'responsive' || isCommittedViewport
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const dragData = dragStore.dragData;
    if (!dragData) return;

    // Handle repositioning existing components
    if (dragData.type === 'existing-component' && dragData.componentId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Convert pixel position to character coordinates
      const charX = Math.floor(mouseX / (cellWidth * canvasStore.zoom));
      const charY = Math.floor(mouseY / (cellHeight * canvasStore.zoom));

      // Update component position
      componentStore.updateLayout(dragData.componentId, { x: charX, y: charY });
      dragStore.endDrag();
      return;
    }

    if (dragData.type === 'new-component' && dragData.componentType) {
      // Add new component to canvas
      let parentId = root?.id;

      if (!parentId) {
        // Create root if it doesn't exist
        const newRoot: import('../../types').ComponentNode = {
          id: 'root',
          type: 'Screen',
          name: 'Main Screen',
          props: { width: 80, height: 24, theme: 'dracula' },
          layout: {
            type: 'absolute',
          },
          style: {
            border: false,
          },
          events: {},
          children: [],
          locked: false,
          hidden: false,
          collapsed: false,
        };
        componentStore.setRoot(newRoot);
        parentId = 'root'; // Now we have a parent to add to
      }

      const def = COMPONENT_LIBRARY[dragData.componentType];
      if (def) {
        // Calculate position with offset so components don't stack on top of each other
        const existingChildren = root?.children.length || 0;
        const offsetX = existingChildren * 2;
        const offsetY = existingChildren * 2;

        const newComponent: Omit<import('../../types').ComponentNode, 'id'> = {
          type: def.type,
          name: def.name,
          props: { ...def.defaultProps },
          layout: {
            ...def.defaultLayout,
            x: offsetX,
            y: offsetY,
          },
          style: { ...def.defaultStyle },
          events: { ...def.defaultEvents },
          children: [],
          locked: false,
          hidden: false,
          collapsed: false,
        };

        const id = componentStore.addComponent(parentId, newComponent);
        if (id) {
          selectionStore.select(id);
        }
      }
    }

    dragStore.endDrag();
  };

  return (
    <div
      ref={viewportRef}
      className="flex-1 h-full flex items-center justify-center bg-muted/20 overflow-hidden p-4 relative"
    >
      <ResponsiveMatrix />

      {/* Figma-style Component Toolbar - Only show if not docked */}
      {!isToolbarDocked && <ComponentToolbar />}

      <div className="relative" style={{ width: viewportWidth, height: viewportHeight }}>
        {/* Canvas Background */}
        <div
          className={`absolute inset-0 border-2 rounded transition-colors ${
            isDragOver ? 'border-primary border-dashed' : 'border-border'
          }`}
          style={{
            backgroundColor: (
              THEMES[themeStore.currentTheme as keyof typeof THEMES] || THEMES.dracula
            ).black,
            fontFamily: 'monospace',
            fontSize: `${12 * canvasStore.zoom}px`,
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => selectionStore.clearSelection()}
        >
          {/* Grid */}
          {canvasStore.showGrid && (
            <svg
              className="absolute inset-0 pointer-events-none opacity-20"
              width="100%"
              height="100%"
            >
              <defs>
                <pattern
                  id="grid"
                  width={cellWidth * canvasStore.zoom}
                  height={cellHeight * canvasStore.zoom}
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    width={cellWidth * canvasStore.zoom}
                    height={cellHeight * canvasStore.zoom}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.5"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          )}

          {/* Empty State */}
          {!root && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
              <div className="text-center">
                <p className="mb-2">
                  {isDragOver ? 'Drop to add component' : 'Drag components here'}
                </p>
                <p className="text-xs">or click components in the palette</p>
              </div>
            </div>
          )}

          {/* Component Rendering */}
          {previewRoot && (
            <div className="absolute inset-0" style={{ fontFamily: 'monospace' }}>
              <ComponentRenderer
                node={previewRoot}
                cellWidth={cellWidth}
                cellHeight={cellHeight}
                zoom={canvasStore.zoom}
                canvasWidth={canvasStore.width}
                canvasHeight={canvasStore.height}
              />
            </div>
          )}
        </div>

        {/* Canvas Size Selector */}
        <CanvasSizeControl />
      </div>
    </div>
  );
}

// Component renderer with layout engine
interface ComponentRendererProps {
  node: import('../../types').ComponentNode;
  cellWidth: number;
  cellHeight: number;
  zoom: number;
  /** Canvas dimensions — changing these busts the memo so layout positions stay fresh on resize */
  canvasWidth: number;
  canvasHeight: number;
}

const ComponentRenderer = memo(
  function ComponentRenderer({
    node,
    cellWidth,
    cellHeight,
    zoom,
    canvasWidth,
    canvasHeight,
  }: ComponentRendererProps) {
    const themeStore = useThemeStore();
    const monochrome = useCanvasStore((s) => s.monochrome);
    const animationPreviewEnabled = useProjectStore((s) => s.animationPreviewEnabled);
    const animationRevision = useProjectStore((s) => s.animationRevision);
    const reducedMotion = useProjectStore((s) => s.settings.reducedMotionDefault);
    const previewState = useProjectStore((s) => s.previewState);

    // Live-animate the Spinner preview on canvas, cycling through the preset's
    // real frames at its real interval. This is purely a preview concern —
    // node.props.frame stays untouched and still drives the single static
    // frame that code/text exporters bake in.
    const [spinnerFrame, setSpinnerFrame] = useState(0);
    useEffect(() => {
      if (node.type !== 'Spinner') return;
      const preset =
        SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
      const timer = setInterval(() => {
        setSpinnerFrame((f) => (f + 1) % preset.frames.length);
      }, preset.interval);
      return () => clearInterval(timer);
    }, [node.type, node.props.spinnerStyle]);

    // Use the global toolbar theme for ANSI color resolution
    const activeTheme = THEMES[themeStore.currentTheme as keyof typeof THEMES] || THEMES.dracula;

    // Helper to convert ANSI color name to hex using component's theme
    const getColor = (color?: string): string | undefined => {
      if (!color || monochrome) return undefined;
      // If it's already a hex color, return it
      if (color.startsWith('#')) return color;
      // Otherwise, look it up in the component's theme ANSI colors
      return activeTheme[color as keyof typeof activeTheme] || color;
    };

    const layout = layoutEngine.getLayout(node.id);

    // Build a stepped CSS gradient that matches terminal rendering:
    // one hard-stop band per character column (horizontal) or row (vertical).
    const buildCliGradientCss = (): string | undefined => {
      const g = node.style.backgroundGradient;
      if (!g || g.stops.length < 2 || !layout || monochrome) return undefined;
      const angle = ((g.angle % 360) + 360) % 360;
      const horizontal = (angle >= 45 && angle < 135) || (angle >= 225 && angle < 315);
      const count = horizontal ? layout.width : layout.height;
      if (count < 1) return undefined;
      const cssAngle = horizontal
        ? angle >= 225 && angle < 315
          ? 270
          : 90
        : angle >= 180 && angle < 360
          ? 0
          : 180;
      const hardStops: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        const [r, gv, b] = interpolateGradientColor(g, t);
        const color = `rgb(${r},${gv},${b})`;
        const s = ((i / count) * 100).toFixed(3);
        const e = (((i + 1) / count) * 100).toFixed(3);
        hardStops.push(`${color} ${s}%`, `${color} ${e}%`);
      }
      return `linear-gradient(${cssAngle}deg, ${hardStops.join(', ')})`;
    };

    const { isSelected, isHovered, handleMouseOver, handleMouseOut, handleClick, handleContextMenu } =
      useComponentSelection(node);
    const {
      isDragging,
      insertionIndex,
      handleResizeStart,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragLeave,
      handleDrop,
    } = useComponentDrag(node, layout, cellWidth, cellHeight, zoom);

    if (!layout) return null;

    const hasOverflow = layoutEngine.getDebugInfo(node.id)?.overflow === true;

    // Render component content as JSX
    const renderComponent = (): React.ReactNode => {
      const colorMap: Record<string, string> = {
        black: 'text-black',
        red: 'text-red-500',
        green: 'text-green-500',
        yellow: 'text-yellow-500',
        blue: 'text-blue-500',
        magenta: 'text-pink-500',
        cyan: 'text-cyan-500',
        white: 'text-white',
        brightRed: 'text-red-400',
        brightGreen: 'text-green-400',
        brightYellow: 'text-yellow-400',
        brightBlue: 'text-blue-400',
        brightMagenta: 'text-pink-400',
        brightCyan: 'text-cyan-400',
      };
      const getColorClass = (color: string) => (monochrome ? 'text-foreground' : colorMap[color] || 'text-foreground');

      switch (node.type) {
        case 'Text': {
          const align = (node.props.align as string) || 'left';
          return (
            <span
              className="font-mono whitespace-pre-wrap w-full"
              style={{ textAlign: align as 'left' | 'center' | 'right' }}
            >
              {(node.props.content as string) || 'Text'}
            </span>
          );
        }
        case 'Button': {
          const label = (node.props.label as string) || 'Button';
          const iconLeft =
            node.props.iconLeftEnabled && node.props.iconLeft
              ? (node.props.iconLeft as string)
              : '';
          const iconRight =
            node.props.iconRightEnabled && node.props.iconRight
              ? (node.props.iconRight as string)
              : '';
          const number = node.props.number as number | undefined;
          const separated = node.props.separated as boolean;
          let text: string;
          if (separated && iconLeft) {
            const leftSection = number !== undefined ? `${iconLeft} ${number}` : iconLeft;
            text = `${leftSection} │ ${label}${iconRight ? ` ${iconRight}` : ''}`;
          } else {
            const left = iconLeft ? `${iconLeft} ` : '';
            const right = iconRight ? ` ${iconRight}` : '';
            text = `${left}${label}${right}`;
          }
          return <span className="font-mono font-bold">{text}</span>;
        }
        case 'TextInput':
          return (
            <span className="font-mono">
              [{(node.props.placeholder as string) || '___________'}]
            </span>
          );
        case 'TextArea': {
          const value = (node.props.value as string) || '';
          const placeholder = (node.props.placeholder as string) || '';
          const lines = (value || placeholder).split('\n');
          const visible = headLines(lines, Math.max(1, layout.height));
          return (
            <div
              className={`font-mono text-xs whitespace-pre leading-tight w-full h-full ${
                !value ? 'text-muted-foreground' : ''
              }`}
            >
              {visible.map((l, i) => (
                <div key={i}>{stringWidth(l) > layout.width ? sliceByWidth(l, layout.width) : l}</div>
              ))}
            </div>
          );
        }
        case 'Select': {
          const value = (node.props.value as string) || '';
          const options = (node.props.options as string[]) || [];
          const displayText = value || (options.length > 0 ? options[0] : 'Select');
          return (
            <span className="font-mono">
              {displayText} <span className="text-muted-foreground">▼</span>
            </span>
          );
        }
        case 'ProgressBar': {
          const value = (node.props.value as number) || 0;
          const max = (node.props.max as number) || 100;
          const pct = Math.min(100, Math.max(0, (value / max) * 100));
          const showPercent = (node.props.showPercent as boolean) ?? true;
          const bar = renderBar((node.props.barStyle as string) || 'blocks', 20, pct);
          return (
            <span className="font-mono">
              {bar}
              {showPercent ? ` ${pct.toFixed(0)}%` : ''}
            </span>
          );
        }
        case 'Gauge': {
          const value = (node.props.value as number) || 0;
          const max = (node.props.max as number) || 100;
          const pct = Math.min(100, Math.max(0, (value / max) * 100));
          const showPercent = (node.props.showPercent as boolean) ?? true;
          const label = (node.props.label as string) || 'Gauge';
          const overlayText = showPercent ? `${label} ${pct.toFixed(0)}%` : label;
          const bar = renderGauge((node.props.barStyle as string) || 'blocks', 24, pct, overlayText);
          return <span className="font-mono">{bar}</span>;
        }
        case 'Sparkline': {
          const data = (node.props.data as number[]) || [];
          const width = typeof node.props.width === 'number' ? node.props.width : 20;
          const max = typeof node.props.max === 'number' ? node.props.max : undefined;
          return <span className="font-mono">{renderSparkline(data, width, max)}</span>;
        }
        case 'Log': {
          const lines = (node.props.lines as string[]) || [];
          const visible = tailLines(lines, Math.max(1, layout.height));
          return (
            <div className="font-mono text-xs whitespace-pre leading-tight w-full h-full">
              {visible.map((l, i) => (
                <div key={i}>{stringWidth(l) > layout.width ? sliceByWidth(l, layout.width) : l}</div>
              ))}
            </div>
          );
        }
        case 'Checkbox': {
          const checkedIcon = (node.props.checkedIcon as string) || '✓';
          const uncheckedIcon = (node.props.uncheckedIcon as string) || ' ';
          const showBrackets = node.props.showBrackets !== false;
          const checked = node.props.checked as boolean;
          const label = (node.props.label as string) || 'Checkbox';
          const iconColor = checked
            ? getColorClass((node.style.checkedColor as string) || 'green')
            : getColorClass((node.style.uncheckedColor as string) || 'white');
          const icon = checked ? checkedIcon : uncheckedIcon;
          return (
            <span className="font-mono">
              <span className={iconColor}>{showBrackets ? `[${icon}]` : icon}</span>
              <span className={getColorClass((node.style.labelColor as string) || 'white')}>
                {' '}
                {label}
              </span>
            </span>
          );
        }
        case 'Radio': {
          const selectedIcon = (node.props.selectedIcon as string) || '●';
          const unselectedIcon = (node.props.unselectedIcon as string) || '○';
          const showBrackets = node.props.showBrackets !== false;
          const checked = node.props.checked as boolean;
          const label = (node.props.label as string) || 'Option';
          const iconColor = checked
            ? getColorClass((node.style.selectedColor as string) || 'green')
            : getColorClass((node.style.unselectedColor as string) || 'white');
          const icon = checked ? selectedIcon : unselectedIcon;
          return (
            <span className="font-mono">
              <span className={iconColor}>{showBrackets ? `(${icon})` : icon}</span>
              <span className={getColorClass((node.style.labelColor as string) || 'white')}>
                {' '}
                {label}
              </span>
            </span>
          );
        }
        case 'Table': {
          const columns = (node.props.columns as string[]) || ['Col 1', 'Col 2'];
          const rows = (node.props.rows as string[][]) || [];
          const numCols = columns.length;
          // Distribute width evenly across columns, accounting for separators
          const totalSepWidth = numCols + 1; // | borders
          const availWidth = Math.max(numCols, layout.width - totalSepWidth);
          const colW = Math.max(3, Math.floor(availWidth / numCols));
          const fit = (s: string) => {
            const str = String(s ?? '');
            return stringWidth(str) > colW ? `${sliceByWidth(str, Math.max(0, colW - 1))}…` : padToWidth(str, colW);
          };
          const divider = columns.map(() => '─'.repeat(colW)).join('┼');
          return (
            <div className="font-mono text-xs whitespace-pre leading-none w-full">
              <div className="text-muted-foreground">{columns.map((c) => fit(c)).join(' ')}</div>
              <div className="text-border">{divider}</div>
              {rows.map((row, ri) => (
                <div key={ri}>{columns.map((_, ci) => fit(row[ci] ?? '')).join(' ')}</div>
              ))}
            </div>
          );
        }
        case 'Spinner': {
          const preset =
            SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
          const idx = spinnerFrame % preset.frames.length;
          const label = (node.props.label as string) ?? 'Loading...';
          return (
            <span className="font-mono">
              {preset.frames[idx]}
              {label ? ` ${label}` : ''}
            </span>
          );
        }
        case 'Tabs': {
          const tabs = (node.props.tabs as any[]) || [];
          const activeTab = (node.props.activeTab as number) || 0;
          const tabStrings = tabs.map((tab: any) => {
            const label = typeof tab === 'string' ? tab : tab.label || 'Tab';
            const icon = typeof tab === 'object' && tab.icon ? `${tab.icon} ` : '';
            const status = typeof tab === 'object' && tab.status ? ' ●' : '';
            const hotkey = typeof tab === 'object' && tab.hotkey ? ` ${tab.hotkey}` : '';
            return `${icon}${label}${status}${hotkey}`;
          });
          const justify = (node.layout as any).justify || 'start';
          const flexJustify =
            justify === 'center' ? 'center' : justify === 'end' ? 'flex-end' : 'flex-start';
          const tabBoxes = tabStrings.map((text, i) => {
            const innerWidth = stringWidth(text) + 2;
            return {
              top: `╭${'─'.repeat(innerWidth)}╮`,
              mid: `│ ${text} │`,
              bot: i === activeTab ? `╯${' '.repeat(innerWidth)}╰` : `┴${'─'.repeat(innerWidth)}┴`,
            };
          });
          return (
            <div className="font-mono leading-none text-xs w-full">
              {/* Top + mid rows: CSS-aligned tab boxes */}
              <div className="flex whitespace-pre" style={{ justifyContent: flexJustify }}>
                {tabBoxes.map((box, i) => (
                  <div key={i}>
                    <div>{box.top}</div>
                    <div>{box.mid}</div>
                  </div>
                ))}
              </div>
              {/* Bottom row: border-top only in gap areas, not behind active tab */}
              <div className="flex whitespace-pre items-center" style={{ height: '1em' }}>
                {flexJustify !== 'flex-start' && (
                  <div style={{ flex: 1, height: 0, borderTop: '1px solid currentColor' }} />
                )}
                {tabBoxes.map((box, i) => (
                  <div key={i} style={{ flexShrink: 0 }}>
                    {box.bot}
                  </div>
                ))}
                {flexJustify !== 'flex-end' && (
                  <div style={{ flex: 1, height: 0, borderTop: '1px solid currentColor' }} />
                )}
              </div>
            </div>
          );
        }
        case 'Menu': {
          const items = (node.props.items as any[]) || [];
          const selectedIndex = (node.props.selectedIndex as number) || 0;
          const menuStyle: 'plain' | 'line' | 'filled' = (node.props.menuStyle as any) || 'plain';
          const isHorizontal = node.layout.type === 'flexbox' && node.layout.direction === 'row';
          if (isHorizontal) {
            const gap = typeof node.layout.gap === 'number' ? node.layout.gap : 0;
            const gapStr = '\u00A0'.repeat(gap);
            const justifyMap: Record<string, string> = {
              start: 'flex-start',
              center: 'center',
              end: 'flex-end',
              'space-between': 'space-between',
              between: 'space-between',
              'space-around': 'space-around',
              around: 'space-around',
              'space-evenly': 'space-evenly',
              evenly: 'space-evenly',
            };
            const alignMap: Record<string, string> = {
              start: 'flex-start',
              center: 'center',
              end: 'flex-end',
            };
            const justify = (node.layout as any).justify as string | undefined;
            const align = (node.layout as any).align as string | undefined;
            return (
              <div
                className="font-mono text-xs flex w-full h-full"
                style={{
                  justifyContent: justifyMap[justify || ''] || 'flex-start',
                  alignItems:
                    menuStyle === 'line' ? 'flex-start' : alignMap[align || ''] || 'center',
                }}
              >
                {items.map((item, i) => {
                  const raw = typeof item === 'string' ? { label: item } : item;
                  const itemData = { icon: '', hotkey: '', separator: false, ...raw };
                  const textStr = `${itemData.icon ? `${itemData.icon} ` : ''}${itemData.label}${itemData.hotkey ? ` ${itemData.hotkey}` : ''}`;
                  let content: React.ReactNode;
                  const isSelected = i === selectedIndex;
                  if (menuStyle === 'filled') {
                    const bg =
                      getColor(isSelected ? itemData.selectedFillColor : itemData.fillColor) ||
                      (isSelected ? '#ffffff' : '#ffffff');
                    const fg =
                      getColor(
                        isSelected ? itemData.selectedFillTextColor : itemData.fillTextColor
                      ) || '#000000';
                    content = (
                      <span style={{ background: bg, color: fg, padding: '0 3px' }}>{textStr}</span>
                    );
                  } else if (menuStyle === 'line') {
                    const iw = stringWidth(textStr);
                    const lineColor =
                      getColor(isSelected ? itemData.selectedTextColor : itemData.textColor) ||
                      undefined;
                    content = (
                      <div
                        className="whitespace-pre leading-none"
                        style={lineColor ? { color: lineColor } : undefined}
                      >
                        <div>{`╭${'─'.repeat(iw + 2)}╮`}</div>
                        <div>{`│ ${textStr} │`}</div>
                        <div>{`╰${'─'.repeat(iw + 2)}╯`}</div>
                      </div>
                    );
                  } else {
                    const plainColor =
                      getColor(isSelected ? itemData.selectedTextColor : itemData.textColor) ||
                      undefined;
                    content = (
                      <span
                        className="whitespace-pre"
                        style={plainColor ? { color: plainColor } : undefined}
                      >
                        {itemData.icon ? `${itemData.icon} ` : ''}
                        {itemData.label}
                        {itemData.hotkey && (
                          <span className="text-muted-foreground">{` ${itemData.hotkey}`}</span>
                        )}
                      </span>
                    );
                  }
                  return (
                    <span key={i} className="flex-shrink-0 flex items-start">
                      {content}
                      {i < items.length - 1 &&
                        (itemData.separator ? (
                          <span className="text-muted-foreground whitespace-pre">
                            {gapStr}│{gapStr}
                          </span>
                        ) : (
                          <span className="whitespace-pre">{gapStr}</span>
                        ))}
                    </span>
                  );
                })}
              </div>
            );
          } else {
            return (
              <div className="font-mono text-xs">
                {items.map((item, i) => {
                  const raw2 = typeof item === 'string' ? { label: item } : item;
                  const itemData = { icon: '', hotkey: '', separator: false, ...raw2 };
                  const isSelected = i === selectedIndex;
                  const vertColor =
                    getColor(isSelected ? itemData.selectedTextColor : itemData.textColor) ||
                    undefined;
                  return (
                    <div key={i}>
                      <div
                        className={isSelected ? 'font-bold' : ''}
                        style={vertColor ? { color: vertColor } : undefined}
                      >
                        {isSelected ? '▶ ' : '  '}
                        {itemData.icon && `${itemData.icon} `}
                        {itemData.label}
                        {itemData.hotkey && (
                          <span className="ml-auto float-right text-muted-foreground">
                            {itemData.hotkey}
                          </span>
                        )}
                      </div>
                      {itemData.separator && i < items.length - 1 && (
                        <div className="text-muted-foreground">──────────────────</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
        }
        case 'List': {
          const items = (node.props.items as any[]) || [];
          const selectedIndex = (node.props.selectedIndex as number) || 0;
          const multiSelect = !!node.props.multiSelect;
          const justifyMap: Record<string, string> = {
            start: 'flex-start',
            center: 'center',
            end: 'flex-end',
            'space-between': 'space-between',
            between: 'space-between',
            'space-around': 'space-around',
            around: 'space-around',
            'space-evenly': 'space-evenly',
            evenly: 'space-evenly',
          };
          const alignMap: Record<string, string> = {
            start: 'flex-start',
            center: 'center',
            end: 'flex-end',
          };
          const justify = (node.layout as any).justify as string | undefined;
          const align = (node.layout as any).align as string | undefined;
          return (
            <div
              className="font-mono text-xs flex flex-col w-full h-full"
              style={{
                justifyContent: justifyMap[justify || ''] || 'flex-start',
                alignItems: alignMap[align || ''] || 'flex-start',
              }}
            >
              {items.map((item, i) => {
                const itemData =
                  typeof item === 'string' ? { label: item, icon: '•', hotkey: '' } : item;
                const isSelected = i === selectedIndex;
                return (
                  <div key={i} className={isSelected ? 'bg-accent' : ''}>
                    {multiSelect && `[${itemData.checked ? 'x' : ' '}] `}
                    {itemData.icon && `${itemData.icon} `}
                    {itemData.label}
                    {itemData.hotkey && (
                      <span className="ml-2 text-muted-foreground text-[10px]">
                        {itemData.hotkey}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }
        case 'StatusBar': {
          const items = (node.props.items as { key?: string; label?: string }[]) || [];
          const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
          return <span className="font-mono">{renderStatusBar(items, gap)}</span>;
        }
        case 'Toast': {
          const message = (node.props.message as string) || '';
          const variant = (node.props.variant as string) || 'info';
          return <span className="font-mono">{renderToast(message, variant)}</span>;
        }
        case 'Breadcrumb': {
          const items = (node.props.items as any[]) || [];
          const separator = (node.props.separator as string) || '/';
          const availWidth = layout.width;
          // Build full text to check if it fits
          const parts = items.map((item: any) => {
            const d = typeof item === 'string' ? { label: item, icon: '' } : item;
            return d.icon ? `${d.icon} ${d.label}` : d.label;
          });
          const fullText = parts.join(` ${separator} `);
          const needsTruncation = stringWidth(fullText) > availWidth;
          return (
            <div className="font-mono text-xs flex items-center overflow-hidden whitespace-nowrap">
              {items.map((item: any, i: number) => {
                const d = typeof item === 'string' ? { label: item, icon: '' } : item;
                const isLast = i === items.length - 1;
                // Truncate middle items when space is tight (keep first and last)
                let label = d.label as string;
                if (needsTruncation && !isLast && i > 0) label = '…';
                return (
                  <span key={i} className="flex items-center">
                    {d.icon && <span className="mr-0.5">{d.icon}</span>}
                    <span>{label}</span>
                    {!isLast && <span className="text-muted-foreground mx-0.5">{separator}</span>}
                  </span>
                );
              })}
            </div>
          );
        }
        case 'Tree': {
          const items = (node.props.items as any[]) || [];
          const renderTreeItem = (item: any, prefix: string, isLast: boolean): string => {
            const itemData = typeof item === 'string' ? { label: item, children: [] } : item;
            const connector = isLast ? '╰╼' : '├╼';
            let result = `${prefix}${connector} ${itemData.label}\n`;
            const children = itemData.children || [];
            if (children.length > 0) {
              const childPrefix = prefix + (isLast ? '   ' : '│  ');
              children.forEach((child: any, ci: number) => {
                result += renderTreeItem(child, childPrefix, ci === children.length - 1);
              });
            }
            return result;
          };
          let treeText = '┬\n';
          items.forEach((item: any, i: number) => {
            treeText += renderTreeItem(item, '', i === items.length - 1);
          });
          return (
            <div className="font-mono text-xs whitespace-pre leading-tight">
              {treeText.trimEnd()}
            </div>
          );
        }
        case 'Separator': {
          const orientation = (node.props.orientation as string) || 'horizontal';
          const lineStyle = (node.props.lineStyle as string) || 'single';
          const char = getSeparatorChar(lineStyle, orientation);
          if (orientation === 'vertical') {
            const lines = Array(Math.max(1, layout.height)).fill(char);
            return (
              <div className="font-mono whitespace-pre leading-none">{lines.join('\n')}</div>
            );
          }
          return <span className="font-mono whitespace-pre">{char.repeat(Math.max(1, layout.width))}</span>;
        }
        case 'Box':
        case 'Grid':
        case 'Spacer':
        case 'Screen':
        case 'Modal':
          return null;
        default:
          return <span className="font-mono">{node.type}</span>;
      }
    };

    // Which resize handles to show based on component type
    const getResizeHandles = (): Array<'e' | 's' | 'se'> => {
      if (node.id === 'root') return [];
      // A Separator only ever resizes along its own axis: a horizontal line
      // has a fixed height (just the line's thickness), a vertical one a fixed width.
      if (node.type === 'Separator') {
        return node.props.orientation === 'vertical' ? ['s'] : ['e'];
      }
      // These types have a fixed height — only allow width resize
      const widthOnlyTypes = [
        'Tabs',
        'Button',
        'TextInput',
        'Select',
        'ProgressBar',
        'Gauge',
        'Sparkline',
        'StatusBar',
        'Toast',
        'Spinner',
        'Checkbox',
        'Radio',
        'Toggle',
      ];
      if (widthOnlyTypes.includes(node.type)) return ['e'];
      return ['e', 's', 'se'];
    };

    const hasBorder = node.style.border;
    const borderColor = hasBorder
      ? getColor(node.style.borderColor) || 'hsl(var(--foreground))'
      : null;
    const showBorderTop = node.style.borderTop !== false;
    const showBorderRight = node.style.borderRight !== false;
    const showBorderBottom = node.style.borderBottom !== false;
    const showBorderLeft = node.style.borderLeft !== false;
    const hasCorners = node.style.borderCorners !== false;

    // Map TUI border styles to CSS border width + style
    const cssBorderStyle = (() => {
      switch (node.style.borderStyle) {
        case 'double':
          return { width: '3px', style: 'double' };
        case 'bold':
          return { width: '2px', style: 'solid' };
        case 'rounded':
          return { width: '1px', style: 'solid' };
        default:
          return { width: '1px', style: 'solid' };
      }
    })();
    const borderDecl = `${cssBorderStyle.width} ${cssBorderStyle.style} ${borderColor}`;
    const isRoundedBorder = node.style.borderStyle === 'rounded';

    let borderStyleProps: CSSProperties = { border: 'none' };
    if (hasBorder && borderColor) {
      if (hasCorners) {
        borderStyleProps = {
          borderTop: showBorderTop ? borderDecl : 'none',
          borderRight: showBorderRight ? borderDecl : 'none',
          borderBottom: showBorderBottom ? borderDecl : 'none',
          borderLeft: showBorderLeft ? borderDecl : 'none',
          boxSizing: 'border-box',
          ...(isRoundedBorder ? { borderRadius: `${Math.round(cellHeight * zoom * 0.4)}px` } : {}),
        };
      } else {
        const cw = cellWidth * zoom;
        const ch = cellHeight * zoom;
        const lw = cssBorderStyle.width; // line width for gradient thickness
        const images: string[] = [];
        const sizes: string[] = [];
        const positions: string[] = [];
        if (showBorderTop) {
          images.push(`linear-gradient(${borderColor},${borderColor})`);
          sizes.push(`calc(100% - ${2 * cw}px) ${lw}`);
          positions.push(`${cw}px 0`);
        }
        if (showBorderBottom) {
          images.push(`linear-gradient(${borderColor},${borderColor})`);
          sizes.push(`calc(100% - ${2 * cw}px) ${lw}`);
          positions.push(`${cw}px 100%`);
        }
        if (showBorderLeft) {
          images.push(`linear-gradient(${borderColor},${borderColor})`);
          sizes.push(`${lw} calc(100% - ${2 * ch}px)`);
          positions.push(`0 ${ch}px`);
        }
        if (showBorderRight) {
          images.push(`linear-gradient(${borderColor},${borderColor})`);
          sizes.push(`${lw} calc(100% - ${2 * ch}px)`);
          positions.push(`100% ${ch}px`);
        }
        borderStyleProps = {
          backgroundImage: images.join(', '),
          backgroundSize: sizes.join(', '),
          backgroundPosition: positions.join(', '),
          backgroundRepeat: 'no-repeat',
        };
      }
    }

    const x = layout.x * cellWidth * zoom;
    const y = layout.y * cellHeight * zoom;
    const paddingValue = typeof node.layout.padding === 'number' ? node.layout.padding : undefined;
    const stateTrigger = previewState === 'focused' ? 'on-focus'
      : previewState === 'selected' ? 'on-select'
        : previewState === 'loading' ? 'on-loading'
          : previewState === 'success' ? 'on-success'
            : previewState === 'error' ? 'on-error'
              : previewState === 'warning' ? 'on-change'
                : null;
    const enabledAnimations = (node.prototype?.animations ?? []).filter((item) => item.enabled);
    const authoredAnimation = stateTrigger
      ? enabledAnimations.find((item) => item.trigger === stateTrigger)
      : enabledAnimations.find((item) => item.trigger === 'on-enter' || item.trigger === 'manual');
    const effectiveEffect = reducedMotion
      ? authoredAnimation?.reducedMotionEffect === 'highlight' ? 'highlight' : authoredAnimation?.reducedMotionEffect === 'fade' ? 'fade' : undefined
      : authoredAnimation?.effect;
    const animationName = effectiveEffect ? `syndrid-${effectiveEffect}-${authoredAnimation?.direction ?? 'none'}` : undefined;
    const animationStyle: CSSProperties = animationPreviewEnabled && authoredAnimation && animationName
      ? {
          animationName,
          animationDuration: `${reducedMotion ? Math.min(100, authoredAnimation.durationMs) : authoredAnimation.durationMs}ms`,
          animationDelay: `${reducedMotion ? 0 : authoredAnimation.delayMs}ms`,
          animationTimingFunction: authoredAnimation.easing === 'smoothstep' ? 'cubic-bezier(.4,0,.2,1)' : authoredAnimation.easing === 'spring' ? 'cubic-bezier(.2,1.4,.4,1)' : authoredAnimation.easing,
          animationIterationCount: authoredAnimation.loop && !reducedMotion ? 'infinite' : 1,
          animationFillMode: 'both',
        }
      : {};

    return (
      <>
        <div
          key={`${node.id}-${previewState}-${animationRevision}`}
          draggable={!node.locked && node.id !== 'root'}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
          className={`absolute transition-colors ${
            isDragging ? 'opacity-50 cursor-grabbing' : 'cursor-grab'
          } ${
            isSelected && node.id !== 'root'
              ? 'ring-2 ring-primary ring-offset-2'
              : isHovered && node.id !== 'root'
                ? 'ring-1 ring-primary/50'
                : hasOverflow
                  ? 'ring-1 ring-red-500'
                  : ''
          }`}
          style={{
            left: `${x}px`,
            top: `${y}px`,
            width: `${layout.width * cellWidth * zoom}px`,
            height: `${layout.height * cellHeight * zoom}px`,
            color: getColor(node.style.color) || 'inherit',
            background: buildCliGradientCss() ?? getColor(node.style.backgroundColor),
            fontWeight: node.style.bold ? 'bold' : 'normal',
            fontStyle: node.style.italic ? 'italic' : 'normal',
            textDecoration: node.style.underline ? 'underline' : 'none',
            opacity: isDragging ? 0.5 : (node.style.opacity ?? 1),
            fontSize: `${12 * zoom}px`,
            pointerEvents: node.locked ? 'none' : 'auto',
            ...borderStyleProps,
            ...animationStyle,
            display: node.hidden ? 'none' : 'flex',
            alignItems: ['Tabs', 'Breadcrumb'].includes(node.type) ? 'flex-start' : 'center',
            justifyContent:
              node.type === 'Text'
                ? node.props.align === 'right'
                  ? 'flex-end'
                  : node.props.align === 'center'
                    ? 'center'
                    : 'flex-start'
                : ['Checkbox', 'Radio', 'Menu', 'Tabs', 'Breadcrumb'].includes(node.type)
                  ? 'flex-start'
                  : 'center',
            padding:
              paddingValue !== undefined
                ? `${paddingValue * cellHeight * zoom}px ${paddingValue * cellWidth * zoom}px`
                : undefined,
          }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        >
          {/* Render content - border is handled by CSS */}
          {renderComponent()}

          {/* Resize handles - shown when selected (full) or hovered (dimmed preview) */}
          {(isSelected || isHovered) &&
            node.id !== 'root' &&
            !isDragging &&
            getResizeHandles().map((dir) => {
              const handlePositions: Record<string, React.CSSProperties> = {
                e: {
                  right: '-4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'ew-resize',
                },
                s: {
                  bottom: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  cursor: 'ns-resize',
                },
                se: { right: '-4px', bottom: '-4px', cursor: 'nwse-resize' },
              };
              return (
                <div
                  key={dir}
                  style={{
                    position: 'absolute',
                    width: '8px',
                    height: '8px',
                    backgroundColor: 'hsl(var(--primary))',
                    border: '2px solid white',
                    borderRadius: '2px',
                    zIndex: 50,
                    opacity: isSelected ? 1 : 0.35,
                    pointerEvents: isSelected ? 'auto' : 'none',
                    ...handlePositions[dir],
                  }}
                  onMouseDown={(e) => handleResizeStart(e, dir as 'e' | 's' | 'se')}
                />
              );
            })}
        </div>

        {/* Insertion line indicator */}
        {insertionIndex !== null &&
          node.layout.type === 'flexbox' &&
          (() => {
            const isColumn = node.layout.direction === 'column';
            const padding = typeof node.layout.padding === 'number' ? node.layout.padding : 0;

            let lineX = x;
            let lineY = y;
            let lineWidth = layout.width * cellWidth * zoom;
            let lineHeight = 2;

            if (insertionIndex === 0) {
              // Insert at beginning (after padding)
              lineX = x + (isColumn ? 0 : padding * cellWidth * zoom);
              lineY = y + (isColumn ? padding * cellHeight * zoom : 0);
              if (!isColumn) {
                lineWidth = 2;
                lineHeight = layout.height * cellHeight * zoom;
              }
            } else if (insertionIndex <= node.children.length) {
              // Insert between/after children
              const prevChild = node.children[insertionIndex - 1];
              const prevLayout = layoutEngine.getLayout(prevChild?.id);
              if (prevLayout) {
                const gap = typeof node.layout.gap === 'number' ? node.layout.gap : 0;
                if (isColumn) {
                  lineY = (prevLayout.y + prevLayout.height + gap / 2) * cellHeight * zoom;
                } else {
                  lineX = (prevLayout.x + prevLayout.width + gap / 2) * cellWidth * zoom;
                  lineWidth = 2;
                  lineHeight = layout.height * cellHeight * zoom;
                }
              }
            }

            return (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${lineX}px`,
                  top: `${lineY}px`,
                  width: `${lineWidth}px`,
                  height: `${lineHeight}px`,
                  backgroundColor: '#3b82f6',
                  zIndex: 1000,
                }}
              />
            );
          })()}

        {/* Render children */}
        {node.children.map((child) => (
          <ComponentRenderer
            key={child.id}
            node={child}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            zoom={zoom}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        ))}
      </>
    );
  },
  (prev, next) =>
    prev.node === next.node &&
    prev.cellWidth === next.cellWidth &&
    prev.cellHeight === next.cellHeight &&
    prev.zoom === next.zoom &&
    prev.canvasWidth === next.canvasWidth &&
    prev.canvasHeight === next.canvasHeight
);
