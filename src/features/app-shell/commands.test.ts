import { describe, expect, it, vi } from 'vitest';
import { buildAppShellCommands } from './commands';
import type { RevampFlags } from '../revamp';

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

function buildCommands(flags: Partial<RevampFlags> = {}, activeTab: 'draft' | 'knowledge' = 'draft') {
  return buildAppShellCommands({
    activeTab,
    revampCommandPaletteV2Enabled: true,
    queueFirstInboxEnabled: true,
    revampFlags: makeFlags(flags),
    setActiveTab: vi.fn(),
    openQueueView: vi.fn(),
    handleGenerate: vi.fn(),
    handleSaveDraft: vi.fn(),
    handleCopyResponse: vi.fn(),
    handleExport: vi.fn(),
    handleCancelGeneration: vi.fn(),
    onOpenShortcuts: vi.fn(),
    clearDraft: vi.fn(),
  });
}

describe('buildAppShellCommands', () => {
  it('keeps only the surviving navigation surfaces in the command palette by default', () => {
    const commands = buildCommands();
    const ids = commands.map((command) => command.id);

    expect(ids).toContain('nav-draft');
    expect(ids).toContain('nav-followups');
    expect(ids).toContain('nav-knowledge');
    expect(ids).toContain('nav-settings');
    expect(ids).not.toContain('nav-analytics');
    expect(ids).not.toContain('nav-ops');
  });

  it('exposes admin navigation commands only when admin mode is enabled', () => {
    const commands = buildCommands({ ASSISTSUPPORT_ENABLE_ADMIN_TABS: true });
    const ids = commands.map((command) => command.id);

    expect(ids).toContain('nav-analytics');
    expect(ids).toContain('nav-ops');
  });

  it('adds workspace commands for the draft tab when the workspace palette is enabled', () => {
    const commands = buildCommands();
    const ids = commands.map((command) => command.id);

    expect(ids).toContain('workspace-analyze-intake');
    expect(ids).toContain('workspace-refresh-similar-cases');
    expect(ids).toContain('workspace-compare-last-resolution');
    expect(ids).toContain('workspace-copy-handoff-pack');
    expect(ids).toContain('workspace-copy-evidence-pack');
    expect(ids).toContain('workspace-copy-kb-draft');
  });

  it('disables workspace commands outside the draft tab and removes them when the feature is disabled', () => {
    const outsideDraft = buildCommands({}, 'knowledge');
    const disabled = buildCommands({ ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE: false });
    const expectedWorkspaceIds = [
      'workspace-analyze-intake',
      'workspace-refresh-similar-cases',
      'workspace-compare-last-resolution',
      'workspace-copy-handoff-pack',
      'workspace-copy-evidence-pack',
      'workspace-copy-kb-draft',
    ];

    for (const id of expectedWorkspaceIds) {
      expect(outsideDraft.find((command) => command.id === id)?.disabled).toBe(true);
      expect(disabled.map((command) => command.id)).not.toContain(id);
    }
  });

  it('removes the legacy sidebar toggle command from the revamp shell palette', () => {
    const commands = buildCommands();

    expect(commands.map((command) => command.id)).not.toContain('settings-toggle-sidebar');
  });

  it('dispatches workspace events for the command palette actions', () => {
    const commands = buildCommands();
    const dispatchSpy = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: dispatchSpy });

    commands.find((command) => command.id === 'workspace-analyze-intake')?.action();
    commands.find((command) => command.id === 'workspace-refresh-similar-cases')?.action();
    commands.find((command) => command.id === 'workspace-compare-last-resolution')?.action();
    commands.find((command) => command.id === 'workspace-copy-handoff-pack')?.action();

    expect(dispatchSpy).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  });
});
