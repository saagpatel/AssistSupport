import type { Tab } from '../../types/app';
import type { RevampFlags } from '../../features/revamp';
import { isTabEnabled } from '../../features/app-shell/tabPolicy';
import './TabBar.css';

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  revampFlags: RevampFlags;
}

const tabs: { id: Tab; label: string; shortcut?: string }[] = [
  { id: 'draft', label: 'Workspace', shortcut: '1' },
  { id: 'followups', label: 'Queue', shortcut: '2' },
  { id: 'knowledge', label: 'Knowledge', shortcut: '3' },
  { id: 'analytics', label: 'Analytics', shortcut: '6' },
  { id: 'ops', label: 'Operations', shortcut: '9' },
  { id: 'settings', label: 'Settings', shortcut: '0' },
];

export function TabBar({ activeTab, onTabChange, revampFlags }: TabBarProps) {
  return (
    <nav className="tab-bar">
      {tabs.filter((tab) => isTabEnabled(tab.id, revampFlags)).map(tab => (
        <button
          key={tab.id}
          className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          title={tab.shortcut ? `${tab.label} (Cmd+${tab.shortcut})` : tab.label}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
