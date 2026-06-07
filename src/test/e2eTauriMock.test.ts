import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mockSource = readFileSync(
  new URL("./e2eTauriMock.ts", import.meta.url),
  "utf8",
);

describe("e2e Tauri sanitized demo mock", () => {
  it("keeps the live mock flow aligned to the removable-media demo script", () => {
    expect(mockSource).toContain("Removable Media Policy");
    expect(mockSource).toContain("File Sharing Guide");
    expect(mockSource).toContain(
      "Removable media is not allowed for Northstar company data",
    );
    expect(mockSource).toContain(
      "SharePoint, OneDrive, ShareFile, encrypted email",
    );
    expect(mockSource).toContain('source_chunk_ids: ["chunk-1", "chunk-2"]');
    expect(mockSource.match(/support_level: "supported"/g)).toHaveLength(2);
  });

  it("does not regress to the stale VPN demo answer", () => {
    expect(mockSource).not.toContain("Per Remote Work Policy");
    expect(mockSource).not.toContain("Use approved VPN and complete MFA");
    expect(mockSource).not.toContain("/mock/kb/remote-work-policy.md");
    expect(mockSource).not.toContain("/mock/kb/security-baseline.md");
  });
});
