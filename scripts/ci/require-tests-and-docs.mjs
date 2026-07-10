import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const defaultBaseRef = (() => {
  try {
    return execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .replace('refs/remotes/', '');
  } catch {
    return 'origin/master';
  }
})();

const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : defaultBaseRef;
const diff = execSync(`git diff --name-only ${baseRef}...HEAD`, { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const testOnlyRanges = (source) => {
  const lines = source.split('\n');
  const ranges = [];
  let depth = 0;
  let cfgStart = null;
  let itemStart = null;
  let itemDepth = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (itemStart === null && trimmed === '#[cfg(test)]') cfgStart = index + 1;

    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;

    if (
      itemStart === null &&
      cfgStart !== null &&
      trimmed &&
      !trimmed.startsWith('#') &&
      opens > closes
    ) {
      itemStart = cfgStart;
      itemDepth = depth;
    }

    depth += opens - closes;

    if (itemStart !== null && depth === itemDepth) {
      ranges.push([itemStart, index + 1]);
      cfgStart = null;
      itemStart = null;
      itemDepth = null;
    }
  }

  return ranges;
};

const changedLineRanges = (file) => {
  const patch = execSync(`git diff --unified=0 --no-color ${baseRef}...HEAD -- ${file}`, {
    encoding: 'utf8',
  });

  return [...patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map(
    (match) => ({
      oldStart: Number(match[1]),
      oldCount: Number(match[2] ?? 1),
      newStart: Number(match[3]),
      newCount: Number(match[4] ?? 1),
    }),
  );
};

const rangeIsTestOnly = (start, count, ranges) =>
  count === 0 ||
  Array.from({ length: count }, (_, offset) => start + offset).every((line) =>
    ranges.some(([rangeStart, rangeEnd]) => line >= rangeStart && line <= rangeEnd),
  );

const isTestOnlyRustChange = (file) => {
  const currentRanges = testOnlyRanges(readFileSync(file, 'utf8'));
  const baseSource = execSync(`git show ${baseRef}:${file}`, { encoding: 'utf8' });
  const baseRanges = testOnlyRanges(baseSource);

  return changedLineRanges(file).every(
    ({ oldStart, oldCount, newStart, newCount }) =>
      rangeIsTestOnly(oldStart, oldCount, baseRanges) &&
      rangeIsTestOnly(newStart, newCount, currentRanges),
  );
};

const testOnlyRustFiles = new Set(
  diff.filter((file) => /^src-tauri\/src\/.*\.rs$/.test(file) && isTestOnlyRustChange(file)),
);

const isJsTest = (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
const isRustTest = (file) => /^src-tauri\/tests\//.test(file) || testOnlyRustFiles.has(file);
const isPythonTest = (file) => /^search-api\/tests\//.test(file) || /^search-api\/test_.*\.py$/.test(file);

const dependencyManifestFiles = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'search-api/requirements.txt',
  'search-api/requirements-test.txt',
]);

const isDependencyManifest = (file) => dependencyManifestFiles.has(file);

const isProdCode = (file) =>
  ((/^(src|app|server|api)\//.test(file) && !isJsTest(file)) ||
    (/^src-tauri\/src\//.test(file) && !testOnlyRustFiles.has(file)) ||
    (/^search-api\//.test(file) &&
      !/^search-api\/tests\//.test(file) &&
      !/^search-api\/README\.md$/.test(file)));

const isTest = (file) =>
  /^tests\//.test(file) || isJsTest(file) || isRustTest(file) || isPythonTest(file);

const isDoc = (file) =>
  /^docs\//.test(file) ||
  /^openapi\//.test(file) ||
  file === 'README.md' ||
  file === 'search-api/README.md';

const isApiSurface = (file) =>
  /^(src|app|server|api)\/.*(route|controller|handler|webhook|api|command)/.test(file) ||
  /^src-tauri\/src\/commands\//.test(file) ||
  /^search-api\/(search_api|wsgi)\.py$/.test(file);

const isArchChange = (file) =>
  /^src\/(auth|db|infra|queue|events|architecture)\//.test(file) ||
  (/^src-tauri\/src\/(db|kb|commands|backup|migration)\//.test(file) &&
    !testOnlyRustFiles.has(file)) ||
  /^search-api\/(db_config|hybrid_search|search_api|wsgi)\.py$/.test(file) ||
  /^infra\//.test(file);
const isAdr = (file) => /^docs\/adr\/\d{4}-.*\.md$/.test(file);

const prodChanged = diff.some(isProdCode);
const testsChanged = diff.some(isTest);
const apiChanged = diff.some(isApiSurface);
const docsChanged = diff.some(isDoc);
const archChanged = diff.some(isArchChange);
const adrChanged = diff.some(isAdr);
const dependencyManifestOnly = diff.length > 0 && diff.every(isDependencyManifest);

const failures = [];
if (prodChanged && !testsChanged && !dependencyManifestOnly)
  failures.push('Policy failure: production code changed without test updates.');
if (apiChanged && !docsChanged) failures.push('Policy failure: API/command changes without docs/OpenAPI updates.');
if (archChanged && !adrChanged) failures.push('Policy failure: architecture-impacting change without ADR.');

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('Policy checks passed.');
