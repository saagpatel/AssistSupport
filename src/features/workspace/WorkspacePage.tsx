import { forwardRef } from "react";
import { type DraftTabHandle } from "../../components/Draft/DraftTab";
import { WorkspaceRevampPage } from "./WorkspaceRevampPage";
import type { QueueView } from "../inbox/queueModel";

interface WorkspacePageProps {
  onNavigateToSource: (searchQuery: string) => void;
  onNavigateToQueue?: (queueView: QueueView) => void;
  appShellRevampEnabled?: boolean;
}

export const WorkspacePage = forwardRef<DraftTabHandle, WorkspacePageProps>(
  function WorkspacePage(
    { onNavigateToSource, onNavigateToQueue, appShellRevampEnabled = false },
    ref,
  ) {
    return (
      <WorkspaceRevampPage
        ref={ref}
        onNavigateToSource={onNavigateToSource}
        onNavigateToQueue={onNavigateToQueue}
        appShellRevampEnabled={appShellRevampEnabled}
      />
    );
  },
);
