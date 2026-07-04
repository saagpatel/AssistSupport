# AGENTS.md - AssistSupport Frontend

## Review guidelines

Treat React UI changes as support-operator workflow changes. Review for
keyboard access, focus management, screen-reader labels, responsive behavior,
loading/empty/error states, and whether the UI clearly distinguishes local
processing from any future cloud-backed path.

For knowledge search, draft, source review, ingest, settings, workspace, and
local-model surfaces, stale or ambiguous status is merge-relevant. The UI must
not imply that a draft is grounded, encrypted, synced, indexed, or locally
generated unless the state is actually true.

Visual review should cover the changed breakpoint and the changed state. If a
component changes layout, navigation, forms, modals, tables, or result cards,
look for clipping, overlapping controls, lost focus, non-obvious disabled
states, and inaccessible icon-only controls.
