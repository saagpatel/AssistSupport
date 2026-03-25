export type TabId =
  | 'draft'
  | 'followups'
  | 'knowledge'
  | 'analytics'
  | 'ops'
  | 'settings';

export const TAB_ORDER: TabId[] = [
  'draft',
  'followups',
  'knowledge',
  'analytics',
  'ops',
  'settings',
];

export interface TabShortcutMap {
  shortcut: string;
  tab: TabId;
  label: string;
}

export const TAB_SHORTCUTS: TabShortcutMap[] = [
  { shortcut: 'Cmd+1', tab: 'draft', label: 'Workspace' },
  { shortcut: 'Cmd+2', tab: 'followups', label: 'Queue' },
  { shortcut: 'Cmd+3', tab: 'knowledge', label: 'Knowledge' },
  { shortcut: 'Cmd+6', tab: 'analytics', label: 'Analytics' },
  { shortcut: 'Cmd+9', tab: 'ops', label: 'Operations' },
  { shortcut: 'Cmd+0', tab: 'settings', label: 'Settings' },
];
