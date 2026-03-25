import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { type DraftTabHandle } from '../../components/Draft/DraftTab';
import { WorkspacePage } from '../workspace';
import { InboxPage } from '../inbox';
import { KnowledgePage } from '../knowledge';
import { AnalyticsPage } from '../analytics';
import { SettingsPage } from '../settings';
import { OpsPage } from '../ops';
import type { SavedDraft } from '../../types/workspace';
import type { TabId } from './types';
import type { RefObject } from 'react';
import type { RevampFlags } from '../revamp';
import type { QueueView } from '../inbox/queueModel';

export interface RenderActiveTabProps {
  activeTab: TabId;
  draftRef: RefObject<DraftTabHandle | null>;
  sourceSearchQuery: string | null;
  pendingQueueView: QueueView | null;
  onSearchQueryConsumed: () => void;
  onQueueViewConsumed: () => void;
  onNavigateToSource: (searchQuery: string) => void;
  onNavigateToQueue: (queueView: QueueView) => void;
  onLoadDraft: (draft: SavedDraft) => void;
  revampFlags: RevampFlags;
}

export function renderActiveTab({
  activeTab,
  draftRef,
  sourceSearchQuery,
  pendingQueueView,
  onSearchQueryConsumed,
  onQueueViewConsumed,
  onNavigateToSource,
  onNavigateToQueue,
  onLoadDraft,
  revampFlags,
}: RenderActiveTabProps) {
  switch (activeTab) {
    case 'draft':
      return (
        <ErrorBoundary fallbackTitle="Workspace tab encountered an error">
          <WorkspacePage
            ref={draftRef}
            onNavigateToSource={onNavigateToSource}
            onNavigateToQueue={onNavigateToQueue}
            appShellRevampEnabled={revampFlags.ASSISTSUPPORT_REVAMP_APP_SHELL}
          />
        </ErrorBoundary>
      );
    case 'followups':
      return (
        <ErrorBoundary fallbackTitle="Queue tab encountered an error">
          <InboxPage
            onLoadDraft={onLoadDraft}
            initialQueueView={pendingQueueView}
            onQueueViewConsumed={onQueueViewConsumed}
          />
        </ErrorBoundary>
      );
    case 'knowledge':
      return (
        <ErrorBoundary fallbackTitle="Knowledge tab encountered an error">
          <KnowledgePage
            initialSearchQuery={sourceSearchQuery}
            onSearchQueryConsumed={onSearchQueryConsumed}
          />
        </ErrorBoundary>
      );
    case 'analytics':
      return (
        <ErrorBoundary fallbackTitle="Analytics tab encountered an error">
          <AnalyticsPage initialSection="overview" />
        </ErrorBoundary>
      );
    case 'settings':
      return (
        <ErrorBoundary fallbackTitle="Settings tab encountered an error">
          <SettingsPage />
        </ErrorBoundary>
      );
    case 'ops':
      return (
        <ErrorBoundary fallbackTitle="Operations tab encountered an error">
          <OpsPage />
        </ErrorBoundary>
      );
  }
}
