import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const configArg = process.argv.find((arg) => arg.startsWith("--config="));
const configPath = path.resolve(
  root,
  configArg ? configArg.slice("--config=".length) : ".lighthouserc.json",
);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const collect = config.ci?.collect ?? {};
const assertions = config.ci?.assert?.assertions ?? {};
const urls = Array.isArray(collect.url)
  ? collect.url
  : [collect.url].filter(Boolean);
const numberOfRuns = Number(collect.numberOfRuns ?? 1);
const outputDir = path.join(root, ".perf-results", "lighthouse");
const chromeFlags =
  process.env.LIGHTHOUSE_CHROME_FLAGS ?? "--headless=new --no-sandbox";

if (!urls.length) {
  console.error(`No Lighthouse URLs configured in ${configPath}.`);
  process.exit(1);
}

if (collect.startServerCommand?.includes("preview") && !existsSync("dist")) {
  console.error(
    "dist is missing; run pnpm perf:build or pnpm build:ui before Lighthouse.",
  );
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

function packageManagerArgs(commandArgs) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...commandArgs],
    };
  }

  return { command: "pnpm", args: commandArgs };
}

function waitForServer(command, readyPattern) {
  const timeoutMs = Number(process.env.LIGHTHOUSE_SERVER_TIMEOUT_MS ?? 60_000);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: root,
      detached: process.platform !== "win32",
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = !readyPattern;
    let output = "";

    const cleanupTimer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for Lighthouse server readiness pattern: ${readyPattern}`,
        ),
      );
    }, timeoutMs);

    const observe = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      if (!ready && text.includes(readyPattern)) {
        ready = true;
        clearTimeout(cleanupTimer);
        resolve(child);
      }
    };

    child.stdout.on("data", observe);
    child.stderr.on("data", observe);
    child.on("exit", (code) => {
      clearTimeout(cleanupTimer);
      if (!ready) {
        reject(
          new Error(
            `Lighthouse server exited before it was ready (${code ?? "signal"}):\n${output}`,
          ),
        );
      }
    });

    if (ready) {
      clearTimeout(cleanupTimer);
      resolve(child);
    }
  });
}

function stopServer(child) {
  if (!child || child.killed) {
    return;
  }

  child.stdout?.removeAllListeners("data");
  child.stderr?.removeAllListeners("data");

  try {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, "SIGTERM");
      return;
    }
  } catch {
    // Fall through to killing the direct child process.
  }

  child.kill("SIGTERM");
}

function safeName(url) {
  return url
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function runLighthouse(url, runNumber) {
  const outputPath = path.join(
    outputDir,
    `${safeName(url)}-run-${runNumber}.json`,
  );
  const pm = packageManagerArgs([
    "exec",
    "lighthouse",
    url,
    "--quiet",
    "--output=json",
    `--output-path=${outputPath}`,
    `--chrome-flags=${chromeFlags}`,
  ]);

  const result = spawnSync(pm.command, pm.args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return JSON.parse(readFileSync(outputPath, "utf8"));
}

function normalizeAssertion(assertion) {
  if (Array.isArray(assertion)) {
    return { level: assertion[0], options: assertion[1] ?? {} };
  }

  return { level: "error", options: assertion ?? {} };
}

function getMetric(lhr, key) {
  if (key.startsWith("categories:")) {
    const category = key.slice("categories:".length);
    return {
      label: key,
      value: lhr.categories?.[category]?.score,
    };
  }

  const audit = lhr.audits?.[key];
  return {
    label: key,
    value:
      typeof audit?.numericValue === "number"
        ? audit.numericValue
        : audit?.score,
  };
}

function evaluate(lhr, runLabel) {
  const results = [];

  for (const [key, rawAssertion] of Object.entries(assertions)) {
    const { level, options } = normalizeAssertion(rawAssertion);
    if (level === "off") {
      continue;
    }

    const metric = getMetric(lhr, key);
    if (typeof metric.value !== "number") {
      results.push({
        key,
        level,
        run: runLabel,
        status: level === "warn" ? "warn" : "fail",
        message: `${key} did not produce a numeric Lighthouse metric.`,
      });
      continue;
    }

    if (typeof options.minScore === "number") {
      const pass = metric.value >= options.minScore;
      results.push({
        key,
        level,
        run: runLabel,
        status: pass ? "pass" : level === "warn" ? "warn" : "fail",
        value: metric.value,
        threshold: options.minScore,
        comparator: ">=",
      });
      continue;
    }

    if (typeof options.maxNumericValue === "number") {
      const pass = metric.value <= options.maxNumericValue;
      results.push({
        key,
        level,
        run: runLabel,
        status: pass ? "pass" : level === "warn" ? "warn" : "fail",
        value: metric.value,
        threshold: options.maxNumericValue,
        comparator: "<=",
      });
    }
  }

  return results;
}

let server;
const allResults = [];

try {
  if (collect.startServerCommand) {
    server = await waitForServer(
      collect.startServerCommand,
      collect.startServerReadyPattern,
    );
  }

  for (const url of urls) {
    for (let run = 1; run <= numberOfRuns; run += 1) {
      console.log(`\n== Lighthouse ${url} run ${run}/${numberOfRuns} ==`);
      const lhr = runLighthouse(url, run);
      allResults.push(...evaluate(lhr, `${safeName(url)}-${run}`));
    }
  }
} finally {
  stopServer(server);
}

const failures = allResults.filter((result) => result.status === "fail");
const warnings = allResults.filter((result) => result.status === "warn");
const summary = {
  config: path.relative(root, configPath),
  capturedAt: new Date().toISOString(),
  runs: urls.length * numberOfRuns,
  failures: failures.length,
  warnings: warnings.length,
  results: allResults,
};

writeFileSync(
  path.join(outputDir, "summary.json"),
  JSON.stringify(summary, null, 2),
);

for (const result of allResults) {
  const prefix =
    result.status === "pass"
      ? "PASS"
      : result.status === "warn"
        ? "WARN"
        : "FAIL";
  const detail =
    typeof result.value === "number"
      ? `${result.value.toFixed(3)} ${result.comparator} ${result.threshold}`
      : result.message;
  console.log(`${prefix} ${result.run} ${result.key}: ${detail}`);
}

if (failures.length > 0) {
  process.exit(1);
}
