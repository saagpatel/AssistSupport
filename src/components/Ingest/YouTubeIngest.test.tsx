// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isAllowedYouTubeUrl, YouTubeIngest } from "./YouTubeIngest";

const mocks = vi.hoisted(() => ({
  ingestYoutube: vi.fn(),
  ingesting: false,
}));

vi.mock("../../hooks/useIngest", () => ({
  useIngest: () => ({
    ingestYoutube: mocks.ingestYoutube,
    ingesting: mocks.ingesting,
  }),
}));

vi.mock("../shared/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  mocks.ingestYoutube.mockReset();
  mocks.ingesting = false;
});

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

describe("YouTubeIngest", () => {
  it("shows the install warning when yt-dlp is unavailable", () => {
    render(
      <YouTubeIngest
        namespaceId="default"
        ytdlpAvailable={false}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByText("yt-dlp Not Installed")).toBeTruthy();
    expect(screen.getByText("brew install yt-dlp")).toBeTruthy();
    expect(screen.queryByLabelText("YouTube URL")).toBeNull();
  });

  it("rejects invalid YouTube lookalike hosts before ingesting", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(
      <YouTubeIngest
        namespaceId="default"
        ytdlpAvailable={true}
        onSuccess={vi.fn()}
        onError={onError}
      />,
    );

    await user.type(
      screen.getByLabelText("YouTube URL"),
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    );
    await user.click(screen.getByRole("button", { name: "Ingest Transcript" }));

    expect(onError).toHaveBeenCalledWith("Please enter a valid YouTube URL");
    expect(mocks.ingestYoutube).not.toHaveBeenCalled();
  });

  it("ingests valid trimmed YouTube URLs and clears the field", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mocks.ingestYoutube.mockResolvedValue({
      title: "Demo video",
      chunk_count: 2,
      word_count: 120,
    });
    render(
      <YouTubeIngest
        namespaceId="default"
        ytdlpAvailable={true}
        onSuccess={onSuccess}
        onError={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("YouTube URL") as HTMLInputElement;
    await user.type(input, " https://youtu.be/dQw4w9WgXcQ ");
    await user.click(screen.getByRole("button", { name: "Ingest Transcript" }));

    await waitFor(() => {
      expect(mocks.ingestYoutube).toHaveBeenCalledWith(
        "https://youtu.be/dQw4w9WgXcQ",
        "default",
      );
    });
    expect(onSuccess).toHaveBeenCalledWith(
      'Ingested "Demo video" (2 chunks, 120 words)',
    );
    expect(input.value).toBe("");
  });

  it("submits with Enter and shows the ingesting label", async () => {
    const user = userEvent.setup();
    mocks.ingesting = true;
    render(
      <YouTubeIngest
        namespaceId="default"
        ytdlpAvailable={true}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Ingesting..." })).toBeTruthy();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);

    await user.keyboard("{Enter}");
    expect(mocks.ingestYoutube).not.toHaveBeenCalled();
  });
});
