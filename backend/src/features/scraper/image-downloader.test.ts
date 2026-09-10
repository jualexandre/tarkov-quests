import { describe, it, expect, vi } from "vitest";
import { createImageDownloader, extensionFromImageUrl } from "./image-downloader";

const WIKI_IMAGE_URL =
  "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/6/6b/Prapor_Portrait.png/revision/latest/scale-to-width-down/105?cb=20180425012550";

function buildFakeResponse(ok: boolean, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(4),
  } as unknown as Response;
}

describe("extensionFromImageUrl", () => {
  it("extracts the extension embedded before the wiki revision path segment", () => {
    expect(extensionFromImageUrl(WIKI_IMAGE_URL)).toBe("png");
  });

  it("extracts jpg extensions case-insensitively", () => {
    expect(extensionFromImageUrl("https://example.com/images/Fence_Portrait.JPG")).toBe("jpg");
  });

  it("defaults to png when no known extension is found", () => {
    expect(extensionFromImageUrl("https://example.com/images/no-extension-here")).toBe("png");
  });
});

describe("createImageDownloader", () => {
  it("returns null without fetching when imageUrl is null", async () => {
    const fetchImpl = vi.fn();
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(false),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    });

    const result = await downloadTraderImage(null, "prapor");

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips downloading and returns the existing local path when the file is already cached", async () => {
    const fetchImpl = vi.fn();
    const writeFile = vi.fn();
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(true),
      writeFile,
      mkdir: vi.fn().mockResolvedValue(undefined),
    });

    const result = await downloadTraderImage(WIKI_IMAGE_URL, "prapor");

    expect(result).toBe("/api/trader-images/prapor.png");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("downloads and writes the image, returning its local path, when not cached", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(buildFakeResponse(true));
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(false),
      writeFile,
      mkdir,
    });

    const result = await downloadTraderImage(WIKI_IMAGE_URL, "prapor");

    expect(result).toBe("/api/trader-images/prapor.png");
    expect(fetchImpl).toHaveBeenCalledWith(WIKI_IMAGE_URL);
    expect(mkdir).toHaveBeenCalledWith("/data/trader-images");
    expect(writeFile).toHaveBeenCalledWith("/data/trader-images/prapor.png", expect.any(Buffer));
  });

  it("returns null without throwing when the download fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(buildFakeResponse(false, 404));
    const writeFile = vi.fn();
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(false),
      writeFile,
      mkdir: vi.fn().mockResolvedValue(undefined),
    });

    const result = await downloadTraderImage(WIKI_IMAGE_URL, "prapor");

    expect(result).toBeNull();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
