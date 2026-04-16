import { readFile, writeFile, access, lstat, symlink, unlink, rename } from "fs/promises";
import { platform } from "os";

const IS_WIN = platform() === "win32";

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2));
}

export type LinkKind = "none" | "link" | "dir" | "file";

export async function classifyPath(path: string): Promise<LinkKind> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) return "link";
    if (stat.isDirectory()) return "dir";
    if (stat.isFile()) return "file";
    return "none";
  } catch {
    return "none";
  }
}

/** Create a symlink (junction on Windows) from `linkPath` → `target`. */
export async function linkDir(target: string, linkPath: string): Promise<void> {
  await symlink(target, linkPath, IS_WIN ? "junction" : "dir");
}

/** Remove a symlink/junction. Does NOT recurse into the target. */
export async function unlinkLink(linkPath: string): Promise<void> {
  try {
    await unlink(linkPath);
  } catch {
    // On some Windows setups junctions need rmdir
    try {
      const { rm } = await import("fs/promises");
      await rm(linkPath, { recursive: false, force: true });
    } catch {}
  }
}

export async function renameDir(from: string, to: string): Promise<void> {
  await rename(from, to);
}
