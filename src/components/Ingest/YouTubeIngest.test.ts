import { describe, expect, it } from "vitest";
import { isAllowedYouTubeUrl } from "./YouTubeIngest";

describe("isAllowedYouTubeUrl", () => {
  it("accepts canonical YouTube hosts", () => {
    expect(
      isAllowedYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe(true);
    expect(isAllowedYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      true,
    );
    expect(isAllowedYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("rejects lookalike hosts that only contain YouTube text", () => {
    expect(
      isAllowedYouTubeUrl(
        "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      ),
    ).toBe(false);
    expect(
      isAllowedYouTubeUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe(false);
  });

  it("rejects malformed or unsupported URLs", () => {
    expect(isAllowedYouTubeUrl("youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(
      isAllowedYouTubeUrl("ftp://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe(false);
  });
});
