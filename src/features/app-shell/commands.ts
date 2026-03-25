import type { Command } from '../../components/shared/CommandPalette';
import type { TabId } from './types';
import type { QueueView } from '../inbox/queueModel';
import type { RevampFlags } from '../revamp';
import { isTabEnabled } from './tabPolicy';
import {
  WORKSPACE_ANALYZE_INTAKE_EVENT,
  WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT,
  WORKSPACE_COPY_EVIDENCE_EVENT,
  WORKSPACE_COPY_HANDOFF_EVENT,
  WORKSPACE_COPY_KB_DRAFT_EVENT,
  WORKSPACE_REFRESH_SIMILAR_CASES_EVENT,
  dispatchWorkspaceEvent,
} from '../workspace/workspaceEvents';

interface BuildCommandsParams {
  activeTab: TabId;
  revampCommandPaletteV2Enabled: boolean;
  queueFirstInboxEnabled: boolean;
  revampFlags: RevampFlags;
  setActiveTab: (tab: TabId) => void;
  openQueueView: (queueView: QueueView) => void;
  handleGenerate: () => void;
  handleSaveDraft: () => void;
  handleCopyResponse: () => void;
  handleExport: () => void;
  handleCancelGeneration: () => void;
  onOpenShortcuts: () => void;
  clearDraft?: () => void;
}

export function buildAppShellCommands({
  activeTab,
  revampCommandPaletteV2Enabled,
  queueFirstInboxEnabled,
  revampFlags,
  setActiveTab,
  openQueueView,
  handleGenerate,
  handleSaveDraft,
  handleCopyResponse,
  handleExport,
  handleCancelGeneration,
  onOpenShortcuts,
  clearDraft,
}: BuildCommandsParams): Command[] {
  const draftTabEnabled = isTabEnabled('draft', revampFlags);
  const workspaceCommandPaletteEnabled =
    draftTabEnabled &&
    revampFlags.ASSISTSUPPORT_REVAMP_WORKSPACE &&
    revampFlags.ASSISTSUPPORT_TICKET_WORKSPACE_V2 &&
    revampFlags.ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE;

  const makeNavCommand = (
    tab: TabId,
    payload: Omit<Command, 'action' | 'disabled'> & { action?: Command['action'] },
  ): Command | null => {
    if (!isTabEnabled(tab, revampFlags)) {
      return null;
    }
    return {
      ...payload,
      action: () => setActiveTab(tab),
    };
  };

  const makeWorkspaceEventCommand = (
    eventName: string,
    featureEnabled: boolean,
    payload: Omit<Command, 'action' | 'disabled'>,
  ): Command | null => {
    if (!workspaceCommandPaletteEnabled || !featureEnabled) {
      return null;
    }

    return {
      ...payload,
      action: () => dispatchWorkspaceEvent(eventName),
      disabled: activeTab !== 'draft',
    };
  };

  const commands: Array<Command | null> = [
    {
      id: 'nav-draft',
      label: 'Go to Workspace',
      description: 'Open the main support workspace',
      icon: 'draft',
      shortcut: 'Cmd+1',
      category: 'navigation',
      action: () => setActiveTab('draft'),
    },
    {
      id: 'nav-followups',
      label: 'Go to Queue',
      description: 'Open queue triage and follow-up work',
      icon: 'followups',
      shortcut: 'Cmd+2',
      category: 'navigation',
      action: () => setActiveTab('followups'),
    },
    {
      id: 'nav-knowledge',
      label: 'Go to Knowledge',
      description: 'Open the unified knowledge workspace',
      icon: 'sources',
      shortcut: 'Cmd+3',
      category: 'navigation',
      action: () => setActiveTab('knowledge'),
    },
    makeNavCommand('analytics', {
      id: 'nav-analytics',
      label: 'Go to Analytics',
      description: 'View admin analytics and insights',
      icon: 'sparkles',
      shortcut: 'Cmd+6',
      category: 'navigation',
    }),
    makeNavCommand('ops', {
      id: 'nav-ops',
      label: 'Go to Operations',
      description: 'Open admin operations tooling',
      icon: 'terminal',
      shortcut: 'Cmd+9',
      category: 'navigation',
    }),
    {
      id: 'nav-settings',
      label: 'Go to Settings',
      description: 'Configure app preferences',
      icon: 'settings',
      shortcut: 'Cmd+0',
      category: 'navigation',
      action: () => setActiveTab('settings'),
    },
    {
      id: 'action-new-draft',
      label: 'New Draft',
      description: 'Clear current draft and start fresh',
      icon: 'plus',
      shortcut: 'Cmd+N',
      category: 'action',
      action: () => {
        setActiveTab('draft');
        clearDraft?.();
      },
    },
    {
      id: 'action-focus-search',
      label: 'Focus Knowledge Search',
      description: 'Jump to the knowledge workspace',
      icon: 'search',
      shortcut: 'Cmd+/',
      category: 'action',
      action: () => setActiveTab('knowledge'),
    },
    makeWorkspaceEventCommand(
      WORKSPACE_ANALYZE_INTAKE_EVENT,
      revampFlags.ASSISTSUPPORT_STRUCTURED_INTAKE,
      {
        id: 'workspace-analyze-intake',
        label: 'Workspace: Analyze Intake',
        description: 'Analyze the current ticket intake in the workspace rail',
        icon: 'sparkles',
        category: 'draft',
      },
    ),
    makeWorkspaceEventCommand(
      WORKSPACE_REFRESH_SIMILAR_CASES_EVENT,
      revampFlags.ASSISTSUPPORT_SIMILAR_CASES,
      {
        id: 'workspace-refresh-similar-cases',
        label: 'Workspace: Refresh Similar Cases',
        description: 'Refresh similar solved cases for the current draft',
        icon: 'refresh',
        category: 'draft',
      },
    ),
    makeWorkspaceEventCommand(
      WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT,
      revampFlags.ASSISTSUPPORT_SIMILAR_CASES,
      {
        id: 'workspace-compare-last-resolution',
        label: 'Workspace: Compare Last Resolution',
        description: 'Compare the current draft to the best similar solved case',
        icon: 'sparkles',
        category: 'draft',
      },
    ),
    makeWorkspaceEventCommand(
      WORKSPACE_COPY_HANDOFF_EVENT,
      true,
      {
        id: 'workspace-copy-handoff-pack',
        label: 'Workspace: Copy Handoff Pack',
        description: 'Copy the ticket workspace handoff pack',
        icon: 'copy',
        category: 'draft',
      },
    ),
    makeWorkspaceEventCommand(
      WORKSPACE_COPY_EVIDENCE_EVENT,
      true,
      {
        id: 'workspace-copy-evidence-pack',
        label: 'Workspace: Copy Evidence Pack',
        description: 'Copy the evidence pack from the ticket workspace',
        icon: 'copy',
        category: 'draft',
      },
    ),
    makeWorkspaceEventCommand(
      WORKSPACE_COPY_KB_DRAFT_EVENT,
      true,
      {
        id: 'workspace-copy-kb-draft',
        label: 'Workspace: Copy KB Draft',
        description: 'Copy the knowledge-base draft from the workspace',
        icon: 'book',
        category: 'draft',
      },
    ),
    {
      id: 'action-generate',
      label: 'Generate Response',
      description: 'Generate AI response for current draft',
      icon: 'sparkles',
      shortcut: 'Cmd+Enter',
      category: 'draft',
      action: handleGenerate,
      disabled: activeTab !== 'draft',
    },
    {
      id: 'action-save',
      label: 'Save Draft',
      description: 'Save current draft to history',
      icon: 'save',
      shortcut: 'Cmd+S',
      category: 'draft',
      action: handleSaveDraft,
      disabled: activeTab !== 'draft',
    },
    {
      id: 'action-copy',
      label: 'Copy Response',
      description: 'Copy generated response to clipboard',
      icon: 'copy',
      shortcut: 'Cmd+Shift+C',
      category: 'draft',
      action: handleCopyResponse,
      disabled: activeTab !== 'draft',
    },
    {
      id: 'action-export',
      label: 'Export Response',
      description: 'Export response as file',
      icon: 'download',
      shortcut: 'Cmd+E',
      category: 'draft',
      action: handleExport,
      disabled: activeTab !== 'draft',
    },
    {
      id: 'action-cancel',
      label: 'Cancel Generation',
      description: 'Stop current AI generation',
      icon: 'x',
      shortcut: 'Escape',
      category: 'draft',
      action: handleCancelGeneration,
      disabled: activeTab !== 'draft',
    },
    {
      id: 'settings-shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      icon: 'command',
      shortcut: 'Cmd+Shift+/',
      category: 'settings',
      action: onOpenShortcuts,
    },
  ];

  // Filter out nulls from conditional nav commands.
  const filtered: Command[] = commands.filter((cmd): cmd is Command => Boolean(cmd));

  if (revampCommandPaletteV2Enabled) {
    filtered.push(
      {
        id: 'queue-open-unassigned',
        label: 'Queue: Unassigned',
        description: 'Jump to unassigned follow-ups queue',
        icon: 'followups',
        category: 'action',
        action: () => openQueueView('unassigned'),
        disabled: !queueFirstInboxEnabled,
      },
      {
        id: 'queue-open-at-risk',
        label: 'Queue: At Risk',
        description: 'Jump to SLA-at-risk follow-ups queue',
        icon: 'alert-triangle',
        category: 'action',
        action: () => openQueueView('at_risk'),
        disabled: !queueFirstInboxEnabled,
      },
      {
        id: 'queue-open-in-progress',
        label: 'Queue: In Progress',
        description: 'Jump to in-progress queue items',
        icon: 'play',
        category: 'action',
        action: () => openQueueView('in_progress'),
        disabled: !queueFirstInboxEnabled,
      },
      {
        id: 'queue-open-resolved',
        label: 'Queue: Resolved',
        description: 'Review resolved queue items',
        icon: 'check',
        category: 'action',
        action: () => openQueueView('resolved'),
        disabled: !queueFirstInboxEnabled,
      },
    );
  }

  return filtered;
}
