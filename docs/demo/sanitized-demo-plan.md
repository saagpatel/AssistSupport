# Sanitized Demo Plan

Latest rehearsal: [rehearsal-snapshot.md](./rehearsal-snapshot.md)
Portfolio handoff: [portfolio-handoff-bundle.md](./portfolio-handoff-bundle.md)

## Demo Boundary

This demo uses only fictional `Northstar Labs` support data. Do not connect a real
workspace, import private KB folders, source `.env` files, read Redis dumps, or
run production-like sidecars while preparing the demo.

Safe sources:

- Checked-in markdown under `knowledge_base/`
- Mock Tauri IPC data under `src/test/e2eTauriMock.ts`
- Portfolio collateral under `docs/screenshots/`, `docs/one-pager/`, and
  `docs/deck/`

Unsafe sources:

- `.env*` files
- SQLite, Redis, Postgres, or app workspace data
- Private customer, company, or ticket exports
- Real Jira, Slack, ServiceNow, or knowledge-base credentials

## Fictional Tenant

- Tenant: `Northstar Labs`
- Support portal: `https://it.northstar.example/support`
- VPN portal: `vpn.northstar.example`
- Helpdesk: `helpdesk@northstar.example`
- Ticket IDs: use `NSD-*`
- Demo persona: `Jordan Lee`, Finance, Northstar-managed MacBook Pro 14, macOS 14.5

## Fake-KB Script

1. Launch in mock mode with the workspace hero enabled.
2. Paste this ticket:

   ```text
   Jordan Lee from Finance is traveling Thursday and asks whether they can copy
   board-review slides to a USB drive for the offsite. They are on a
   Northstar-managed MacBook Pro 14, macOS 14.5.
   ```

3. Show the `Policy / removable_media` intent route.
4. Generate a grounded response that denies USB/removable-media use for company
   data and offers approved alternatives: SharePoint, OneDrive, ShareFile,
   encrypted email for small files, or VPN-connected file shares.
5. Hover a citation and show that it maps to the checked-in policy KB.
6. Rate the draft, then open Analytics to show fictional gap clusters:
   `VPN won't connect at HQ but works on hotspot` and
   `Outlook keeps crashing on macOS 14.5`.
7. Call out the privacy posture: local mock IPC, no real tenant data, no cloud AI
   call, encrypted core workspace in real use.

## Cleanup List

- Keep `dump.rdb` ignored and outside every demo path.
- Remove generated dependency folders before capture.
- Keep all demo domains under `.example`.
- Keep USB/removable-media behavior consistent: the demo denies USB use and
  points to approved alternatives.
- Label mock or aspirational views as mock collateral when presenting.
- Re-run screenshots, one-pager, and deck outputs after text changes.

## Verification Checklist

```bash
rg -n "company\\.com|it\\.company|vpn\\.company|passwordreset\\.company|Priya Anand|Aisera" knowledge_base docs src search-api -g '!docs/demo/sanitized-demo-plan.md' -g '!docs/demo/rehearsal-snapshot.md' -g '!docs/demo/portfolio-handoff-bundle.md'
rg -n "IronKey|Apricorn|approved encrypted drive|whitelist-usb|PagerDuty rule 12" docs src -g '!docs/demo/sanitized-demo-plan.md' -g '!docs/demo/rehearsal-snapshot.md' -g '!docs/demo/portfolio-handoff-bundle.md'
rg -n "USB|flash drive|removable media" knowledge_base docs src search-api
git status --short --ignored=matching node_modules dump.rdb
node scripts/ci/check-workstation-preflight.mjs
node scripts/ci/check-workflow-command-drift.mjs
node scripts/ci/check-version-parity.mjs
```

Optional when the workstation has `gitleaks` installed:

```bash
pnpm git:guard:secrets
```
