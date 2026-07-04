# AGENTS.md - AssistSupport UI Tests

## Review guidelines

Treat UI tests as workflow evidence, not screenshots for their own sake. Review
whether changed support flows have coverage for the state that changed:
keyboard/focus behavior, responsive layout, loading, empty, error, offline, and
permission-denied states.

Do not accept a visual or smoke update that only refreshes snapshots while
removing assertions about privacy posture, source grounding, local-model
availability, or backend error handling.
