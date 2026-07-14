#!/usr/bin/env node

import fs from "node:fs";

const workflow = fs.readFileSync(
  new URL("../../.github/workflows/dependency-watch.yml", import.meta.url),
  "utf8",
);
const completionHelper = fs.readFileSync(
  new URL(
    "../../.github/scripts/dependency_watch_completion.py",
    import.meta.url,
  ),
  "utf8",
);
const requirements = [
  ["workflow concurrency", workflow, /^concurrency:\n {2}group:/m],
  ["job timeout", workflow, /^ {4}timeout-minutes: \d+/m],
  ["mutation action output", workflow, /core\.setOutput\('issue_action'/],
  ["destination id output", workflow, /core\.setOutput\('issue_number'/],
  ["destination readback", workflow, /github\.rest\.issues\.get\(/],
  [
    "readback mismatch failure",
    workflow,
    /throw new Error\(`Dependency alert issue readback mismatch/,
  ],
  [
    "completion helper invocation",
    workflow,
    /run: python3 \.github\/scripts\/dependency_watch_completion\.py/,
  ],
  [
    "machine completion state",
    completionHelper,
    /"schema": "AutomationTerminalStateV1"/,
  ],
  [
    "partial mutation accounting",
    completionHelper,
    /partial = readback_required and not readback_verified/,
  ],
];

const missing = requirements
  .filter(([, source, pattern]) => !pattern.test(source))
  .map(([name]) => name);
if (missing.length) {
  console.error(`dependency-watch contract missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(
  JSON.stringify({
    schema: "DependencyWatchContractTestV1",
    ok: true,
    tests: requirements.length,
  }),
);
