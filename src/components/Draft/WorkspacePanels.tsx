import type { ReactNode } from 'react';

interface WorkspacePanelsProps {
  diagnosisCollapsed: boolean;
  workspaceRailEnabled: boolean;
  inputPanel: ReactNode;
  diagnosisPanel: ReactNode;
  responsePanel: ReactNode;
  workspacePanel?: ReactNode;
}

export function WorkspacePanels({
  diagnosisCollapsed,
  workspaceRailEnabled,
  inputPanel,
  diagnosisPanel,
  responsePanel,
  workspacePanel,
}: WorkspacePanelsProps) {
  return (
    <div className="draft-panels-container">
      <div className="draft-panel input-panel">{inputPanel}</div>
      <div className={`draft-panel diagnosis-panel ${diagnosisCollapsed ? 'collapsed' : ''}`}>
        {diagnosisPanel}
      </div>
      <div className="draft-panel response-panel">{responsePanel}</div>
      {workspaceRailEnabled && workspacePanel ? (
        <div className="draft-panel workspace-panel">{workspacePanel}</div>
      ) : null}
    </div>
  );
}
