// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacePage } from './WorkspacePage';

vi.mock('./WorkspaceRevampPage', () => ({
  WorkspaceRevampPage: ({ appShellRevampEnabled }: { appShellRevampEnabled?: boolean }) => (
    <div data-testid="workspace-revamp-page">
      Workspace revamp:{appShellRevampEnabled ? 'solo' : 'standard'}
    </div>
  ),
}));

describe('WorkspacePage', () => {
  it('always renders the workspace revamp wrapper', () => {
    render(
      <WorkspacePage
        onNavigateToSource={vi.fn()}
        onNavigateToQueue={vi.fn()}
        appShellRevampEnabled
      />,
    );

    expect(screen.getByTestId('workspace-revamp-page').textContent).toContain('Workspace revamp:solo');
  });
});
