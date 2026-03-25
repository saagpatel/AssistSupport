import type { ReactNode } from 'react';

interface WorkspaceModeShellProps {
  isConversation: boolean;
  revampModeEnabled: boolean;
  panelDensityMode: 'balanced' | 'focus-intake' | 'focus-response';
  diagnosisCollapsed: boolean;
  workspaceRailEnabled: boolean;
  viewToggle: ReactNode;
  readinessBanner: ReactNode;
  conversationThread?: ReactNode;
  conversationInput?: ReactNode;
  workflowStrip?: ReactNode;
  panels?: ReactNode;
  dialogs?: ReactNode;
}

export function WorkspaceModeShell({
  isConversation,
  revampModeEnabled,
  panelDensityMode,
  diagnosisCollapsed,
  workspaceRailEnabled,
  viewToggle,
  readinessBanner,
  conversationThread,
  conversationInput,
  workflowStrip,
  panels,
  dialogs,
}: WorkspaceModeShellProps) {
  if (isConversation) {
    return (
      <div className={['draft-tab', 'conversation-mode', revampModeEnabled ? 'draft-tab--revamp' : ''].filter(Boolean).join(' ')}>
        {viewToggle}
        {readinessBanner}
        {conversationThread}
        {conversationInput}
      </div>
    );
  }

  return (
    <div
      className={[
        'draft-tab',
        `panel-density-${panelDensityMode}`,
        diagnosisCollapsed ? 'diagnosis-collapsed' : '',
        revampModeEnabled ? 'draft-tab--revamp' : '',
        workspaceRailEnabled ? 'has-workspace-rail' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {viewToggle}
      {readinessBanner}
      {workflowStrip}
      {panels}
      {dialogs}
    </div>
  );
}
