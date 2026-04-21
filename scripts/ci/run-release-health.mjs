import { execSync } from "node:child_process";

function run(label, command, env = {}) {
  console.log(`\n== ${label} ==`);
  execSync(command, {
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });
}

function skip(label, reason, skippedChecks) {
  console.log(`\n== ${label} ==`);
  console.log(`Skipping: ${reason}`);
  skippedChecks.push({ label, reason });
}

const skippedChecks = [];

run("Core repo health", "pnpm health:repo");
run("Frontend diff-coverage baseline", "pnpm test:coverage");
run("Build-time budget", "pnpm perf:build");
run("Bundle budget", "pnpm perf:bundle");
run("Asset-size budget", "pnpm perf:assets");
run("Memory budget", "pnpm perf:memory");
run("Lighthouse budget", "pnpm perf:lhci");

if (process.env.BASE_URL) {
  run("API latency budget", "pnpm perf:api");
} else {
  skip(
    "API latency budget",
    "Set BASE_URL to enable release-only API performance checks.",
    skippedChecks,
  );
}

if (process.env.DATABASE_URL) {
  run("DB query health", "pnpm perf:db:enforce", {
    DB_MAX_MEAN_MS: process.env.DB_MAX_MEAN_MS ?? "100",
    DB_MIN_CALLS: process.env.DB_MIN_CALLS ?? "50",
  });
} else {
  skip(
    "DB query health",
    "Set DATABASE_URL to enable release-only database performance checks.",
    skippedChecks,
  );
}

console.log("\nRelease health completed.");
if (skippedChecks.length > 0) {
  console.log("Skipped release prerequisites:");
  for (const { label, reason } of skippedChecks) {
    console.log(`- ${label}: ${reason}`);
  }
}
