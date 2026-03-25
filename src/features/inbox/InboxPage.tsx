import type { SavedDraft } from '../../types/workspace';
import type { QueueView } from './queueModel';
import { QueueCommandCenterPage } from '../revamp';

interface InboxPageProps {
  onLoadDraft: (draft: SavedDraft) => void;
  initialQueueView?: QueueView | null;
  onQueueViewConsumed?: () => void;
}

export function InboxPage({
  onLoadDraft,
  initialQueueView = null,
  onQueueViewConsumed,
}: InboxPageProps) {
  return (
    <QueueCommandCenterPage
      onLoadDraft={onLoadDraft}
      initialQueueView={initialQueueView}
      onQueueViewConsumed={onQueueViewConsumed}
    />
  );
}
