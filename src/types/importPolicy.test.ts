import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function walkSourceFiles(dir: string): string[] {
  const output: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      output.push(...walkSourceFiles(fullPath));
      continue;
    }
    if (
      !fullPath.match(/\.(ts|tsx)$/) ||
      fullPath.endsWith(".test.ts") ||
      fullPath.endsWith(".test.tsx")
    ) {
      continue;
    }
    output.push(fullPath);
  }

  return output;
}

describe("type import policy", () => {
  it("retires the broad types barrel", () => {
    expect(existsSync(path.join(SRC_ROOT, "types", "index.ts"))).toBe(false);
  });

  it("keeps production source off the broad types barrel", () => {
    const violations: string[] = [];

    for (const filePath of walkSourceFiles(SRC_ROOT)) {
      const content = readFileSync(filePath, "utf8");
      if (content.match(/from ['"](?:\.\.\/)+types(?:\/index)?['"]/)) {
        violations.push(path.relative(SRC_ROOT, filePath));
      }
    }

    expect(violations).toEqual([]);
  });
});
