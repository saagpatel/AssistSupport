# Sanitized Demo Rehearsal Snapshot

Last rehearsed: June 7, 2026

## Boundary

This rehearsal used only the mock-mode Northstar Labs demo path. Do not source
`.env` files, import real workspaces, read private ticket exports, attach real
integration credentials, or run production-like sidecars for this demo.

Safe sources for this run:

- `knowledge_base/`
- `src/test/e2eTauriMock.ts`
- `docs/screenshots/`, `docs/one-pager/`, and `docs/deck/`

## Launch Command

```bash
VITE_E2E_MOCK_TAURI=1 \
VITE_DEV_PORT=1424 \
VITE_ASSISTSUPPORT_REVAMP_WORKSPACE_HERO=1 \
VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS=1 \
pnpm dev -- --host 127.0.0.1 --port 1424
```

Open `http://localhost:1424/`.

## Operator Script

1. Open `Workspace`.
2. Paste this fictional ticket:

   ```text
   Jordan Lee from Finance is traveling Thursday and asks whether they can copy
   board-review slides to a USB drive for the offsite. They are on a
   Northstar-managed MacBook Pro 14, macOS 14.5.
   ```

3. Keep the default `Medium` response length.
4. Select or call out the `Policy / removable_media` route.
5. Click `Generate`.
6. Confirm the grounded response denies removable-media use for company data.
7. Call out approved alternatives in the generated response:
   `SharePoint`, `OneDrive`, `ShareFile`, encrypted email for small files, and a
   VPN-connected file share.
8. Show the two mock KB sources:
   - `Removable Media Policy` at `/mock/kb/removable-media-policy.md`
   - `File Sharing Guide` at `/mock/kb/file-sharing-guide.md`
9. Rate the draft with thumbs-up to demonstrate the feedback loop.
10. Open `Analytics`.
11. Scroll to `Knowledge Gaps` and show the current fictional clusters:
    - `VPN won't connect at HQ but works on hotspot`
    - `Outlook keeps crashing on macOS 14.5`
12. Close by restating the privacy posture: local mock IPC, no real tenant data,
    no cloud AI call, and deterministic fallback when MemoryKernel is offline.

## Rehearsal Result

- Page identity: `AssistSupport | Local AI Support Workspace`.
- Workspace renderer: workspace hero enabled.
- Console health: no browser warnings or errors in desktop or mobile rehearsal.
- Response behavior: generated the removable-media denial with all five approved
  alternatives.
- Source behavior: showed two mock KB sources with `/mock/kb/` paths.
- Analytics behavior: opened the Analytics tab and showed the exact fictional
  Knowledge Gaps labels listed above.
- Desktop viewport: `1280x720`, no document-level horizontal overflow.
- Mobile viewport: `390x844`, no document-level horizontal overflow.
- Mobile nuance: the compact `No ticket loaded` summary label remains clipped by
  design; it did not create page-level horizontal scroll or block the demo flow.

## Screenshot Evidence

Current rehearsal screenshots were written outside the repo:

- `/tmp/assistsupport-demo-rehearsal-desktop.png`
- `/tmp/assistsupport-demo-rehearsal-desktop-full.png`
- `/tmp/assistsupport-demo-rehearsal-mobile.png`
- `/tmp/assistsupport-demo-rehearsal-mobile-full.png`
- `/tmp/assistsupport-demo-rehearsal-analytics.png`
- `/tmp/assistsupport-demo-rehearsal-analytics-gaps.png`

Do not commit generated screenshots unless a future portfolio-collateral task
explicitly asks for repo-owned assets.

## Cleanup List

- Stop the Vite dev server.
- Reset any browser viewport override.
- Remove generated dependency/build/test folders before closeout:
  `node_modules`, `.lighthouseci`, `coverage`, `dist`, `playwright-report`, and
  `test-results`.
- Keep `dump.rdb` ignored and out of the demo path.
- Keep all demo domains under `.example`.
- Keep the USB/removable-media answer consistent: deny USB use and offer approved
  alternatives.

## Pre-Demo Verification

Run these checks before presenting:

```bash
rg -n "company\\.com|it\\.company|vpn\\.company|passwordreset\\.company|Priya Anand|Aisera" knowledge_base docs src search-api -g '!docs/demo/sanitized-demo-plan.md' -g '!docs/demo/rehearsal-snapshot.md' -g '!docs/demo/portfolio-handoff-bundle.md'
rg -n "IronKey|Apricorn|approved encrypted drive|whitelist-usb|PagerDuty rule 12" docs src -g '!docs/demo/sanitized-demo-plan.md' -g '!docs/demo/rehearsal-snapshot.md' -g '!docs/demo/portfolio-handoff-bundle.md'
rg -n "USB|flash drive|removable media" knowledge_base docs src search-api
git status --short --ignored=matching node_modules dump.rdb
node scripts/ci/check-workstation-preflight.mjs
node scripts/ci/check-workflow-command-drift.mjs
node scripts/ci/check-version-parity.mjs
```

Expected results:

- The first two `rg` commands return no matches.
- The USB/removable-media scan returns only expected checked-in policy, demo, and
  test references.
- `node_modules` may appear only while the local rehearsal server is active.
- Workstation preflight, workflow drift, and version parity all pass.
