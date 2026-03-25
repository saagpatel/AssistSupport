// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderActiveTab } from './renderActiveTab';
import type { DraftTabHandle } from '../../components/Draft/DraftTab';
import type { RevampFlags } from '../revamp';

vi.mock('../workspace', () => ({
  WorkspacePage: ({ appShellRevampEnabled }: { appShellRevampEnabled?: boolean }) => (
    <div data-testid="workspace-page">{appShellRevampEnabled ? 'revamp-shell' : 'legacy-shell'}</div>
  ),
}));

vi.mock('../inbox', () => ({
  InboxPage: ({ initialQueueView }: { initialQueueView?: string | null }) => (
    <div data-testid="queue-page">{initialQueueView ?? 'no-queue-view'}</div>
  ),
}));

vi.mock('../knowledge', () => ({
  KnowledgePage: ({ initialSearchQuery }: { initialSearchQuery?: string | null }) => (
    <div data-testid="knowledge-page">{initialSearchQuery ?? 'no-search-query'}</div>
  ),
}));

vi.mock('../analytics', () => ({
  AnalyticsPage: ({ initialSection }: { initialSection?: string }) => (
    <div data-testid="analytics-page">{initialSection ?? 'overview'}</div>
  ),
}));

vi.mock('../settings', () => ({
  SettingsPage: () => <div data-testid="settings-page">settings</div>,
}));

vi.mock('../ops', () => ({
  OpsPage: () => <div data-testid="ops-page">ops</div>,
}));

function makeFlags(partial: Partial<RevampFlags> = {}): RevampFlags {
  return {
    ASSISTSUPPORT_REVAMP_APP_SHELL: true,
    ASSISTSUPPORT_REVAMP_INBOX: true,
    ASSISTSUPPORT_REVAMP_WORKSPACE: true,
    ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2: true,
    ASSISTSUPPORT_TICKET_WORKSPACE_V2: true,
    ASSISTSUPPORT_STRUCTURED_INTAKE: true,
    ASSISTSUPPORT_SIMILAR_CASES: true,
    ASSISTSUPPORT_NEXT_BEST_ACTION: true,
    ASSISTSUPPORT_GUIDED_RUNBOOKS_V2: true,
    ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT: true,
    ASSISTSUPPORT_BATCH_TRIAGE: true,
    ASSISTSUPPORT_COLLABORATION_DISPATCH: false,
    ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE: true,
    ASSISTSUPPORT_LLM_ROUTER_V2: false,
    ASSISTSUPPORT_ENABLE_ADMIN_TABS: false,
    ASSISTSUPPORT_ENABLE_NETWORK_INGEST: false,
    ...partial,
  };
}

function renderTab(activeTab: Parameters<typeof renderActiveTab>[0]['activeTab']) {
  const draftRef = createRef<DraftTabHandle>();
  render(renderActiveTab({
    activeTab,
    draftRef,
    sourceSearchQuery: 'vpn policy',
    pendingQueueView: 'at_risk',
    onSearchQueryConsumed: vi.fn(),
    onQueueViewConsumed: vi.fn(),
    onNavigateToSource: vi.fn(),
    onNavigateToQueue: vi.fn(),
    onLoadDraft: vi.fn(),
    revampFlags: makeFlags(),
  }));
}

describe('renderActiveTab', () => {
  it('routes the surviving workspace tab to the revamp workspace page with prop forwarding intact', () => {
    renderTab('draft');

    expect(screen.getByTestId('workspace-page').textContent).toBe('revamp-shell');
  });

  it('routes knowledge to the unified knowledge destination', () => {
    renderTab('knowledge');

    expect(screen.getByTestId('knowledge-page').textContent).toBe('vpn policy');
  });

  it('routes analytics directly to the insights overview', () => {
    renderTab('analytics');

    expect(screen.getByTestId('analytics-page').textContent).toBe('overview');
  });
});
