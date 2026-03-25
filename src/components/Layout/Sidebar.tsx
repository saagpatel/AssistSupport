/**
 * Sidebar - Primary navigation component
 * Persistent sidebar with icons and labels
 */

import { Icon, IconName } from '../shared/Icon';
import type { Tab } from '../../types/app';
import type { RevampFlags } from '../../features/revamp';
import { isTabEnabled } from '../../features/app-shell/tabPolicy';
import './Sidebar.css';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  revampFlags: RevampFlags;
}

interface NavItem {
  id: Tab;
  label: string;
  icon: IconName;
  shortcut?: string;
  description: string;
}

const navItems: NavItem[] = [
  {
    id: 'draft',
    label: 'Workspace',
    icon: 'draft',
    shortcut: '1',
    description: 'Open the main support workspace'
  },
  {
    id: 'followups',
    label: 'Queue',
    icon: 'followups',
    shortcut: '2',
    description: 'Triage the queue and manage follow-up work'
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: 'knowledge',
    shortcut: '3',
    description: 'Browse documents and search diagnostics'
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'sparkles',
    shortcut: '6',
    description: 'View admin analytics and pilot diagnostics'
  },
  {
    id: 'ops',
    label: 'Operations',
    icon: 'terminal',
    shortcut: '9',
    description: 'Open deployment and integration diagnostics',
  },
];

const settingsItem: NavItem = {
  id: 'settings',
  label: 'Settings',
  icon: 'settings',
  shortcut: '0',
  description: 'Configure app preferences'
};

export function Sidebar({ activeTab, onTabChange, collapsed, onToggleCollapse, revampFlags }: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand">
            <span className="brand-icon">A</span>
            <span className="brand-text">AssistSupport</span>
          </div>
        )}
        <button
          className="sidebar-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
        </button>
      </div>

      <nav className="sidebar-nav" role="navigation" aria-label="Main navigation">
        <ul className="nav-list">
          {navItems.filter((item) => isTabEnabled(item.id, revampFlags)).map(item => (
            <li key={item.id}>
              <button
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => onTabChange(item.id)}
                title={collapsed ? `${item.label}${item.shortcut ? ` (Cmd+${item.shortcut})` : ''}` : item.description}
                aria-current={activeTab === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={20} className="nav-icon" />
                {!collapsed && (
                  <>
                    <span className="nav-label">{item.label}</span>
                    {item.shortcut && (
                      <span className="nav-shortcut">
                        <kbd>&#8984;</kbd>
                        <kbd>{item.shortcut}</kbd>
                      </span>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
          title={collapsed ? `Settings (Cmd+${settingsItem.shortcut})` : settingsItem.description}
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          <Icon name={settingsItem.icon} size={20} className="nav-icon" />
          {!collapsed && (
            <>
              <span className="nav-label">{settingsItem.label}</span>
              <span className="nav-shortcut">
                <kbd>&#8984;</kbd>
                <kbd>{settingsItem.shortcut}</kbd>
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
