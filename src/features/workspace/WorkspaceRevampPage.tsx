import { forwardRef } from "react";
import { DraftTab, type DraftTabHandle } from "../../components/Draft/DraftTab";
import "./WorkspaceRevampPage.css";
import "../../styles/revamp/index.css";

interface WorkspaceRevampPageProps {
  onNavigateToSource: (searchQuery: string) => void;
}

export const WorkspaceRevampPage = forwardRef<
  DraftTabHandle,
  WorkspaceRevampPageProps
>(function WorkspaceRevampPage({ onNavigateToSource }, ref) {
  return (
    <div
      className="workspace-revamp workspace-revamp--solo"
      data-testid="workspace-revamp-shell"
    >
      <section className="workspace-revamp__main">
        <DraftTab
          ref={ref}
          onNavigateToSource={onNavigateToSource}
          revampModeEnabled
        />
      </section>
    </div>
  );
});
