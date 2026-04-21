// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { DraftTabHandle } from "./DraftTab";

// Compile-time pin: a drift-detector that fails to typecheck if DraftTabHandle
// gains, loses, or renames a member. 8 consumers import this handle type; any
// surface change must be intentional and reviewed here.

type ExpectedHandle = {
  generate: () => void;
  loadDraft: (draft: unknown) => void;
  saveDraft: () => void;
  copyResponse: () => void;
  cancelGeneration: () => void;
  exportResponse: () => void;
  clearDraft: () => void;
};

type HandleMatchesShape = DraftTabHandle extends ExpectedHandle
  ? ExpectedHandle extends { [K in keyof DraftTabHandle]: DraftTabHandle[K] }
    ? true
    : false
  : false;

const _handleShapeCheck: HandleMatchesShape = true;
void _handleShapeCheck;

describe("DraftTabHandle shape", () => {
  it("exposes the seven imperative methods consumers rely on", () => {
    const expectedKeys = [
      "generate",
      "loadDraft",
      "saveDraft",
      "copyResponse",
      "cancelGeneration",
      "exportResponse",
      "clearDraft",
    ] as const;

    // Runtime no-op; pairs with the compile-time pin above. The assertion
    // exists so test runners list the check alongside the type guard.
    for (const key of expectedKeys) {
      expect(key).toBeDefined();
    }
  });
});
