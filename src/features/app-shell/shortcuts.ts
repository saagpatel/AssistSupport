import type { TabId } from './types';

const TAB_SHORTCUT_INDEX: Record<number, TabId> = {
  1: 'draft',
  2: 'followups',
  3: 'knowledge',
  6: 'analytics',
  9: 'ops',
  10: 'settings',
};

export function mapShortcutIndexToTab(index: number): TabId | null {
  return TAB_SHORTCUT_INDEX[index] ?? null;
}
