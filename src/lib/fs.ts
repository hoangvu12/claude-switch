import { readFile, writeFile, access, lstat, rename, mkdir, cp } from "fs/promises";

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

export type PathKind = "none" | "link" | "dir" | "file";

export async function classifyPath(path: string): Promise<PathKind> {
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

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function renameDir(from: string, to: string): Promise<void> {
  await rename(from, to);
}

export async function copyDir(from: string, to: string): Promise<void> {
  await cp(from, to, { recursive: true, force: false, errorOnExist: false });
}
