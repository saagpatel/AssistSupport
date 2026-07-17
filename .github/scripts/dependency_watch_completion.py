#!/usr/bin/env python3
"""Emit the dependency-watch AutomationTerminalStateV1 completion line."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping


AUTOMATION_ID = "github:AssistSupport/dependency-watch"


def build_payload(env: Mapping[str, str], observed_at: str) -> dict:
    job_ok = env.get("JOB_STATUS") == "success"
    action = env.get("ISSUE_ACTION", "")
    issue_number = env.get("ISSUE_NUMBER", "")
    issue_outcome = env.get("ISSUE_OUTCOME", "")
    issue_attempted = issue_outcome not in ("", "skipped")
    readback_required = issue_attempted
    readback_verified = readback_required and env.get("ISSUE_READBACK") == "true"
    partial = readback_required and not readback_verified
    destination_id = None
    if readback_required:
        destination_id = (
            f"issue:{issue_number}"
            if issue_number
            else "repo:saagpatel/AssistSupport/issues#Dependency Watch Alerts"
        )

    if partial:
        state = "partial"
    elif job_ok:
        state = "succeeded"
    else:
        state = "failed"

    succeeded = state == "succeeded"
    if not issue_attempted:
        write_result = "not_attempted"
        readback_result = "not_required"
        observed_result = {"kind": "state", "value": "no_issue_mutation"}
    elif action:
        write_result = "succeeded"
        readback_result = "verified" if readback_verified else "failed"
        observed_result = {"kind": "destination_id", "value": destination_id}
    else:
        write_result = "failed"
        readback_result = "failed"
        observed_result = {"kind": "state", "value": "issue_unverified"}
    return {
        "schema": "AutomationTerminalStateV1",
        "automation_id": AUTOMATION_ID,
        "state": state,
        "completed": succeeded,
        "partial": partial,
        "skipped": False,
        "mutation_count": 1 if action else 0,
        "destination_readback": {
            "required": readback_required,
            "verified": readback_verified,
            "destination_id": destination_id,
            "observed_at": observed_at if readback_required else None,
            "evidence": {
                "issue_action": action or ("unknown" if issue_attempted else "not_required"),
                "issue_step_outcome": issue_outcome or "unknown",
                "write_result": write_result,
                "readback_result": readback_result,
                "observed_result": observed_result,
            },
        },
        "operator_action_required": not succeeded,
        "can_auto_archive": succeeded,
        "observed_at": observed_at,
    }


def main() -> int:
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = build_payload(os.environ, observed_at)
    line = "automation_completion: " + json.dumps(payload, separators=(",", ":"))
    print(line)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with Path(summary_path).open("a", encoding="utf-8") as summary:
            summary.write("\n" + line + "\n")

    readback = payload["destination_readback"]
    if readback["required"] and not readback["verified"]:
        print("dependency issue destination readback was not verified", file=os.sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
