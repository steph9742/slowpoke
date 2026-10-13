import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function archiveDirectory(dir: string, compress = false): Promise<Bun.Archive> {
  const files: Record<string, Blob> = {};

  async function walk(currentDir: string, prefix: string = "") {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(fullPath, archivePath);
      } else {
        files[archivePath] = new Blob([await Bun.file(fullPath).bytes()]);
      }
    }
  }

  await walk(dir);
  return new Bun.Archive(files, compress ? { compress: "gzip" } : undefined);
}