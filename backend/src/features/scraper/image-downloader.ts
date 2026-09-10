import { promises as fs } from "node:fs";
import { join } from "node:path";

const KNOWN_EXTENSIONS = ["png", "jpeg", "jpg", "gif", "webp"];

export function extensionFromImageUrl(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Not an absolute URL; fall back to matching against the raw string.
  }
  const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\/|$)/);
  const candidate = match?.[1].toLowerCase();
  return candidate && KNOWN_EXTENSIONS.includes(candidate) ? candidate : "png";
}

export interface ImageDownloaderDeps {
  dir: string;
  fetchImpl?: typeof fetch;
  fileExists?: (path: string) => Promise<boolean>;
  writeFile?: (path: string, data: Buffer) => Promise<void>;
  mkdir?: (path: string) => Promise<void>;
}

export type DownloadTraderImage = (imageUrl: string | null, slug: string) => Promise<string | null>;

async function defaultFileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export function createImageDownloader(deps: ImageDownloaderDeps): DownloadTraderImage {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fileExists = deps.fileExists ?? defaultFileExists;
  const writeFile = deps.writeFile ?? ((path: string, data: Buffer) => fs.writeFile(path, data));
  const mkdir = deps.mkdir ?? ((path: string) => fs.mkdir(path, { recursive: true }).then(() => undefined));

  return async function downloadTraderImage(imageUrl, slug) {
    if (!imageUrl) return null;

    const filename = `${slug}.${extensionFromImageUrl(imageUrl)}`;
    const localPath = join(deps.dir, filename);
    const publicPath = `/api/trader-images/${filename}`;

    if (await fileExists(localPath)) return publicPath;

    try {
      const response = await fetchImpl(imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await mkdir(deps.dir);
      await writeFile(localPath, buffer);
      return publicPath;
    } catch (err) {
      console.warn(`Failed to download trader image for "${slug}": ${(err as Error).message}`);
      return null;
    }
  };
}
