#!/usr/bin/env node

import fs from "node:fs";

const workflow = fs.readFileSync(new URL("../../.github/workflows/dependency-watch.yml", import.meta.url), "utf8");
const requirements = [
  ["workflow concurrency", /^concurrency:\n  group:/m],
  ["job timeout", /^    timeout-minutes: \d+/m],
  ["mutation action output", /core\.setOutput\('issue_action'/],
  ["destination id output", /core\.setOutput\('issue_number'/],
  ["destination readback", /github\.rest\.issues\.get\(/],
  ["readback mismatch failure", /throw new Error\(`Dependency alert issue readback mismatch/],
  ["machine completion state", /AutomationTerminalStateV1/],
  ["partial mutation accounting", /partial = issue_attempted and not readback_verified/],
];

const missing = requirements.filter(([, pattern]) => !pattern.test(workflow)).map(([name]) => name);
if (missing.length) {
  console.error(`dependency-watch contract missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(JSON.stringify({ schema: "DependencyWatchContractTestV1", ok: true, tests: requirements.length }));
