import { promises as fs } from "node:fs";
import { join } from "node:path";

const KNOWN_EXTENSIONS = ["png", "jpeg", "jpg", "gif", "webp"];
const REQUEST_TIMEOUT_MS = 20_000;

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
  publicPathPrefix: string;
  fetchImpl?: typeof fetch;
  fileExists?: (path: string) => Promise<boolean>;
  writeFile?: (path: string, data: Buffer) => Promise<void>;
  mkdir?: (path: string) => Promise<void>;
}

export type DownloadImage = (imageUrl: string | null, slug: string) => Promise<string | null>;

async function defaultFileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export function createImageDownloader(deps: ImageDownloaderDeps): DownloadImage {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fileExists = deps.fileExists ?? defaultFileExists;
  const writeFile = deps.writeFile ?? ((path: string, data: Buffer) => fs.writeFile(path, data));
  const mkdir = deps.mkdir ?? ((path: string) => fs.mkdir(path, { recursive: true }).then(() => undefined));

  return async function downloadImage(imageUrl, slug) {
    if (!imageUrl) return null;

    const filename = `${slug}.${extensionFromImageUrl(imageUrl)}`;
    const localPath = join(deps.dir, filename);
    const publicPath = `${deps.publicPathPrefix}/${filename}`;

    if (await fileExists(localPath)) return publicPath;

    try {
      const response = await fetchImpl(imageUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await mkdir(deps.dir);
      await writeFile(localPath, buffer);
      return publicPath;
    } catch (err) {
      console.warn(`Failed to download image for "${slug}": ${(err as Error).message}`);
      return null;
    }
  };
}
