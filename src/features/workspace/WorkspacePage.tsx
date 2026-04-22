import { forwardRef } from "react";
import { DraftTab, type DraftTabHandle } from "../../components/Draft/DraftTab";
import "./WorkspacePage.css";
import "../../styles/revamp/index.css";

interface WorkspacePageProps {
  onNavigateToSource: (searchQuery: string) => void;
}

export const WorkspacePage = forwardRef<DraftTabHandle, WorkspacePageProps>(
  function WorkspacePage({ onNavigateToSource }, ref) {
    return (
      <div className="workspace-page" data-testid="workspace-page">
        <section className="workspace-page__main">
          <DraftTab
            ref={ref}
            onNavigateToSource={onNavigateToSource}
            revampModeEnabled
          />
        </section>
      </div>
    );
  },
);
