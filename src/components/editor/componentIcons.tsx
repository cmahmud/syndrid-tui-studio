import {
  Square,
  Columns,
  Space,
  MousePointerClick,
  Type,
  CheckSquare,
  Circle,
  ChevronDown as SelectIcon,
  ToggleLeft,
  FileText,
  Loader2,
  Activity,
  Gauge as GaugeIcon,
  BarChart3,
  ScrollText,
  PanelBottom,
  Table2,
  List,
  GitBranch,
  Menu as MenuIconType,
  FolderTree,
  Navigation,
  PanelTop,
  SeparatorHorizontal,
  AlignLeft,
  BellRing,
} from 'lucide-react';
import type { ComponentType } from '../../types';

// Map component types to their icons
export function getComponentIcon(type: ComponentType) {
  const iconProps = { className: 'w-3.5 h-3.5 flex-shrink-0' };

  switch (type) {
    // Layout
    case 'Screen':
      return <PanelTop {...iconProps} />;
    case 'Box':
      return <Square {...iconProps} />;
    case 'Grid':
      return <Columns {...iconProps} />;
    case 'Spacer':
      return <Space {...iconProps} />;
    case 'Separator':
      return <SeparatorHorizontal {...iconProps} />;

    // Input
    case 'Button':
      return <MousePointerClick {...iconProps} />;
    case 'TextInput':
      return <Type {...iconProps} />;
    case 'TextArea':
      return <AlignLeft {...iconProps} />;
    case 'Checkbox':
      return <CheckSquare {...iconProps} />;
    case 'Radio':
      return <Circle {...iconProps} />;
    case 'Select':
      return <SelectIcon {...iconProps} />;
    case 'Toggle':
      return <ToggleLeft {...iconProps} />;

    // Display
    case 'Text':
      return <FileText {...iconProps} />;
    case 'Spinner':
      return <Loader2 {...iconProps} />;
    case 'ProgressBar':
      return <Activity {...iconProps} />;
    case 'Gauge':
      return <GaugeIcon {...iconProps} />;
    case 'Sparkline':
      return <BarChart3 {...iconProps} />;
    case 'Log':
      return <ScrollText {...iconProps} />;
    case 'Toast':
      return <BellRing {...iconProps} />;

    // Data
    case 'Table':
      return <Table2 {...iconProps} />;
    case 'List':
      return <List {...iconProps} />;
    case 'Tree':
      return <GitBranch {...iconProps} />;

    // Navigation
    case 'Menu':
      return <MenuIconType {...iconProps} />;
    case 'Tabs':
      return <FolderTree {...iconProps} />;
    case 'Breadcrumb':
      return <Navigation {...iconProps} />;
    case 'StatusBar':
      return <PanelBottom {...iconProps} />;

    // Overlay
    case 'Modal':
      return <PanelTop {...iconProps} />;

    default:
      return <Square {...iconProps} />;
  }
}
