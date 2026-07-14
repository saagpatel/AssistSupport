import importlib.util
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parents[2]
    / ".github"
    / "scripts"
    / "dependency_watch_completion.py"
)
WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "dependency-watch.yml"


def load_module():
    spec = importlib.util.spec_from_file_location("dependency_watch_completion", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DependencyWatchCompletionContractTests(unittest.TestCase):
    observed_at = "2026-07-14T06:30:00Z"

    def payload(self, **overrides):
        env = {
            "JOB_STATUS": "success",
            "ISSUE_OUTCOME": "skipped",
            "ISSUE_ACTION": "",
            "ISSUE_NUMBER": "",
            "ISSUE_READBACK": "",
        }
        env.update(overrides)
        return load_module().build_payload(env, self.observed_at)

    def assert_contract(self, payload):
        self.assertEqual(payload["schema"], "AutomationTerminalStateV1")
        self.assertEqual(payload["automation_id"], "github:AssistSupport/dependency-watch")
        self.assertEqual((payload["state"] == "partial"), payload["partial"])
        self.assertEqual((payload["state"] == "skipped"), payload["skipped"])
        self.assertTrue(payload["destination_readback"]["evidence"])
        if payload["destination_readback"]["required"]:
            self.assertTrue(payload["destination_readback"]["destination_id"])
        if payload["can_auto_archive"]:
            self.assertIn(payload["state"], {"succeeded", "skipped"})
            self.assertTrue(payload["completed"])
            self.assertFalse(payload["operator_action_required"])

    def test_clean_run_is_success_not_skipped(self):
        payload = self.payload()
        self.assert_contract(payload)
        self.assertEqual(payload["state"], "succeeded")
        self.assertTrue(payload["completed"])
        self.assertFalse(payload["skipped"])
        self.assertEqual(payload["mutation_count"], 0)
        self.assertEqual(
            payload["destination_readback"],
            {
                "required": False,
                "verified": False,
                "destination_id": None,
                "observed_at": None,
                "evidence": {"issue_action": "not_required", "issue_step_outcome": "skipped"},
            },
        )

    def test_issue_mutation_with_readback_is_success(self):
        payload = self.payload(
            ISSUE_OUTCOME="success",
            ISSUE_ACTION="updated",
            ISSUE_NUMBER="42",
            ISSUE_READBACK="true",
        )
        self.assert_contract(payload)
        self.assertEqual(payload["state"], "succeeded")
        self.assertEqual(payload["mutation_count"], 1)
        self.assertEqual(payload["destination_readback"]["destination_id"], "issue:42")
        self.assertEqual(payload["destination_readback"]["observed_at"], self.observed_at)

    def test_actionable_failure_with_verified_issue_is_failed_not_partial(self):
        payload = self.payload(
            JOB_STATUS="failure",
            ISSUE_OUTCOME="success",
            ISSUE_ACTION="created",
            ISSUE_NUMBER="43",
            ISSUE_READBACK="true",
        )
        self.assert_contract(payload)
        self.assertEqual(payload["state"], "failed")
        self.assertFalse(payload["completed"])
        self.assertFalse(payload["partial"])
        self.assertTrue(payload["operator_action_required"])
        self.assertFalse(payload["can_auto_archive"])

    def test_unverified_attempt_is_partial(self):
        payload = self.payload(JOB_STATUS="failure", ISSUE_OUTCOME="failure")
        self.assert_contract(payload)
        self.assertEqual(payload["state"], "partial")
        self.assertFalse(payload["completed"])
        self.assertTrue(payload["partial"])
        self.assertTrue(payload["destination_readback"]["required"])
        self.assertFalse(payload["destination_readback"]["verified"])
        self.assertEqual(
            payload["destination_readback"]["destination_id"],
            "repo:saagpatel/AssistSupport/issues#Dependency Watch Alerts",
        )
        self.assertEqual(payload["destination_readback"]["observed_at"], self.observed_at)
        self.assertTrue(payload["operator_action_required"])
        self.assertFalse(payload["can_auto_archive"])

    def test_failure_before_issue_attempt_is_failed(self):
        payload = self.payload(JOB_STATUS="failure")
        self.assert_contract(payload)
        self.assertEqual(payload["state"], "failed")
        self.assertFalse(payload["destination_readback"]["required"])

    def test_workflow_always_invokes_tested_completion_emitter(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("- name: Emit machine-readable completion state\n        if: always()", workflow)
        self.assertIn("run: python3 .github/scripts/dependency_watch_completion.py", workflow)

    def test_cli_emits_one_standalone_completion_line_and_exits_zero(self):
        env = {
            **os.environ,
            "JOB_STATUS": "success",
            "ISSUE_OUTCOME": "skipped",
            "ISSUE_ACTION": "",
            "ISSUE_NUMBER": "",
            "ISSUE_READBACK": "",
        }
        env.pop("GITHUB_STEP_SUMMARY", None)
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.splitlines()
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith("automation_completion: "))
        payload = json.loads(lines[0].removeprefix("automation_completion: "))
        self.assertEqual(payload["state"], "succeeded")

    def test_cli_exits_nonzero_when_required_readback_is_unverified(self):
        env = {
            **os.environ,
            "JOB_STATUS": "failure",
            "ISSUE_OUTCOME": "failure",
            "ISSUE_ACTION": "",
            "ISSUE_NUMBER": "",
            "ISSUE_READBACK": "",
        }
        env.pop("GITHUB_STEP_SUMMARY", None)
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("destination readback was not verified", result.stderr)
        payload = json.loads(result.stdout.removeprefix("automation_completion: "))
        self.assertEqual(payload["state"], "partial")


if __name__ == "__main__":
    unittest.main()
