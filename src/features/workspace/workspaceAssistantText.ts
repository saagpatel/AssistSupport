export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function compactLines(lines: Array<string | null | undefined>): string {
  return lines
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join("\n");
}

export function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function extractSection(
  inputText: string,
  labels: string[],
): string | null {
  const lines = inputText.split("\n");
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const normalizedLine = line.replace(/^[-*]\s+/, "");
    const lower = normalizedLine.toLowerCase();
    const matchingLabel = normalizedLabels.find((label) =>
      lower.startsWith(`${label}:`),
    );
    if (!matchingLabel) {
      continue;
    }

    const inlineValue = normalizedLine.slice(matchingLabel.length + 1).trim();
    if (inlineValue) {
      return inlineValue;
    }

    const block: string[] = [];
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex].trim();
      if (!nextLine) {
        if (block.length > 0) {
          break;
        }
        continue;
      }
      if (nextLine.startsWith("- ") || nextLine.startsWith("* ")) {
        block.push(nextLine.slice(2).trim());
        continue;
      }
      if (/^[A-Za-z][A-Za-z\s/()'-]+:$/.test(nextLine)) {
        break;
      }
      block.push(nextLine);
    }

    if (block.length > 0) {
      return block.join(" ");
    }
  }

  return null;
}

export function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2),
    ),
  );
}
