import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';
import type { SavedDraft, SimilarCase } from '../../types/workspace';

interface WorkspaceDialogsProps {
  showTemplateModal: boolean;
  response: string;
  savedDraftId: string | null;
  templateModalRating?: number;
  onTemplateSave: (
    name: string,
    category: string | null,
    content: string,
    variablesJson: string | null,
  ) => Promise<boolean>;
  onCloseTemplateModal: () => void;
  pendingSimilarCaseOpen: SimilarCase | null;
  onCloseSimilarCaseDialog: () => void;
  onConfirmOpenSimilarCase: (mode: 'replace' | 'save-and-open' | 'compare') => void | Promise<void>;
  hasResponse: boolean;
  pendingDraftOpen: SavedDraft | null;
  onCloseDraftDialog: () => void;
  onConfirmOpenDraft: (mode: 'replace' | 'save-and-open') => void | Promise<void>;
}

export function WorkspaceDialogs({
  showTemplateModal,
  response,
  savedDraftId,
  templateModalRating,
  onTemplateSave,
  onCloseTemplateModal,
  pendingSimilarCaseOpen,
  onCloseSimilarCaseDialog,
  onConfirmOpenSimilarCase,
  hasResponse,
  pendingDraftOpen,
  onCloseDraftDialog,
  onConfirmOpenDraft,
}: WorkspaceDialogsProps) {
  return (
    <>
      {showTemplateModal && response ? (
        <SaveAsTemplateModal
          content={response}
          sourceDraftId={savedDraftId ?? undefined}
          sourceRating={templateModalRating}
          onSave={onTemplateSave}
          onClose={onCloseTemplateModal}
        />
      ) : null}

      <Dialog
        open={pendingSimilarCaseOpen !== null}
        onClose={onCloseSimilarCaseDialog}
        ariaLabel="Open another saved case"
      >
        <div className="draft-tab__confirm-dialog">
          <h3>Open another saved case?</h3>
          <p>
            Your current workspace still has in-progress content. Save it first, compare it to the
            saved case, or replace it intentionally.
          </p>
          {pendingSimilarCaseOpen ? (
            <p className="draft-tab__confirm-dialog-target">
              Next case: <strong>{pendingSimilarCaseOpen.title}</strong>
            </p>
          ) : null}
          <div className="draft-tab__confirm-dialog-actions">
            <Button variant="ghost" onClick={onCloseSimilarCaseDialog}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void onConfirmOpenSimilarCase('compare');
              }}
              disabled={!hasResponse}
            >
              Compare instead
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void onConfirmOpenSimilarCase('save-and-open');
              }}
            >
              Save and open
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void onConfirmOpenSimilarCase('replace');
              }}
            >
              Open anyway
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={pendingDraftOpen !== null}
        onClose={onCloseDraftDialog}
        ariaLabel="Open selected draft"
      >
        <div className="draft-tab__confirm-dialog">
          <h3>Open selected draft?</h3>
          <p>
            Your current workspace has in-progress content. Save it first or replace it intentionally.
          </p>
          {pendingDraftOpen ? (
            <p className="draft-tab__confirm-dialog-target">
              Next draft: <strong>{pendingDraftOpen.ticket_id?.trim() || pendingDraftOpen.summary_text || 'Saved draft'}</strong>
            </p>
          ) : null}
          <div className="draft-tab__confirm-dialog-actions">
            <Button variant="ghost" onClick={onCloseDraftDialog}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void onConfirmOpenDraft('save-and-open');
              }}
            >
              Save and open
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void onConfirmOpenDraft('replace');
              }}
            >
              Open anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
