import { forwardRef } from "react";
import { type DraftTabHandle } from "../../components/Draft/DraftTab";
import { WorkspaceRevampPage } from "./WorkspaceRevampPage";

interface WorkspacePageProps {
  onNavigateToSource: (searchQuery: string) => void;
}

export const WorkspacePage = forwardRef<DraftTabHandle, WorkspacePageProps>(
  function WorkspacePage({ onNavigateToSource }, ref) {
    return (
      <WorkspaceRevampPage ref={ref} onNavigateToSource={onNavigateToSource} />
    );
  },
);
