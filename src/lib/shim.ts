import { readFile, writeFile, chmod } from "fs/promises";
import { delimiter, join, resolve } from "path";
import {
  BIN_DIR,
  IS_WIN,
  REAL_CLAUDE_FILE,
  ROOT_DIR,
  SHIM_PATH,
} from "./paths";
import { ensureDir, fileExists } from "./fs";

const WINDOWS_EXTS = [".cmd", ".exe", ".bat", ".ps1"];
const POSIX_NAMES = ["claude"];

/**
 * Find the real `claude` executable on PATH, skipping any entry inside our
 * own bin dir (which would cause infinite recursion).
 */
export async function findRealClaude(): Promise<string | null> {
  const rawPath = process.env.PATH ?? "";
  const entries = rawPath.split(delimiter).filter(Boolean);
  const ourBin = resolve(BIN_DIR).toLowerCase();

  for (const entry of entries) {
    try {
      if (resolve(entry).toLowerCase() === ourBin) continue;
    } catch {
      continue;
    }

    const candidates = IS_WIN
      ? WINDOWS_EXTS.map((ext) => join(entry, `claude${ext}`))
      : POSIX_NAMES.map((n) => join(entry, n));

    for (const c of candidates) {
      if (await fileExists(c)) return c;
    }
  }
  return null;
}

async function readCachedRealClaude(): Promise<string | null> {
  try {
    const p = (await readFile(REAL_CLAUDE_FILE, "utf-8")).trim();
    if (p && (await fileExists(p))) return p;
  } catch {}
  return null;
}

/**
 * Resolve the real claude binary. Prefers a valid cached path, otherwise
 * detects and caches. Returns null if nothing found.
 */
export async function resolveRealClaude(): Promise<string | null> {
  const cached = await readCachedRealClaude();
  if (cached) return cached;
  const found = await findRealClaude();
  if (found) {
    await ensureDir(ROOT_DIR);
    await writeFile(REAL_CLAUDE_FILE, found);
  }
  return found;
}

const POSIX_SHIM = `#!/bin/sh
# claude-switch shim — reads active profile and execs the real claude.
SWITCH_DIR="$HOME/.claude-switch"
if [ -f "$SWITCH_DIR/active-path" ]; then
  CLAUDE_CONFIG_DIR="$(cat "$SWITCH_DIR/active-path")"
  export CLAUDE_CONFIG_DIR
fi
if [ ! -f "$SWITCH_DIR/real-claude" ]; then
  echo "claude-switch: real claude path not configured. Run: claude-switch doctor" >&2
  exit 1
fi
REAL_CLAUDE="$(cat "$SWITCH_DIR/real-claude")"
exec "$REAL_CLAUDE" "$@"
`;

const WINDOWS_SHIM = `@echo off
setlocal EnableDelayedExpansion
set "SWITCH_DIR=%USERPROFILE%\\.claude-switch"
if exist "%SWITCH_DIR%\\active-path" (
  for /f "usebackq delims=" %%a in ("%SWITCH_DIR%\\active-path") do set "CLAUDE_CONFIG_DIR=%%a"
)
if not exist "%SWITCH_DIR%\\real-claude" (
  echo claude-switch: real claude path not configured. Run: claude-switch doctor 1>&2
  exit /b 1
)
for /f "usebackq delims=" %%a in ("%SWITCH_DIR%\\real-claude") do set "CS_REAL=%%a"
call "%CS_REAL%" %*
`;

export async function installShim(): Promise<void> {
  await ensureDir(BIN_DIR);
  const body = IS_WIN ? WINDOWS_SHIM : POSIX_SHIM;
  await writeFile(SHIM_PATH, body);
  if (!IS_WIN) await chmod(SHIM_PATH, 0o755);
}

export async function shimInstalled(): Promise<boolean> {
  return fileExists(SHIM_PATH);
}

/**
 * Is our shim dir already early enough on PATH that `claude` will resolve
 * to our shim? We don't reorder — just report.
 */
export function binDirOnPath(): boolean {
  const rawPath = process.env.PATH ?? "";
  const ourBin = resolve(BIN_DIR).toLowerCase();
  return rawPath
    .split(delimiter)
    .filter(Boolean)
    .some((p) => {
      try {
        return resolve(p).toLowerCase() === ourBin;
      } catch {
        return false;
      }
    });
}

/**
 * Short, platform-appropriate instructions for adding BIN_DIR to PATH.
 * Returns a multi-line string the caller prints.
 */
export function pathInstructions(): string {
  if (IS_WIN) {
    return [
      `Add this to your user PATH (takes effect in new terminals):`,
      ``,
      `  PowerShell:`,
      `    [Environment]::SetEnvironmentVariable('Path', "${BIN_DIR};" + [Environment]::GetEnvironmentVariable('Path','User'), 'User')`,
      ``,
      `  CMD:`,
      `    setx PATH "${BIN_DIR};%PATH%"`,
    ].join("\n");
  }
  return [
    `Add this to your shell rc (~/.bashrc, ~/.zshrc, etc.):`,
    ``,
    `  export PATH="${BIN_DIR}:$PATH"`,
    ``,
    `Then: source ~/.bashrc  (or open a new terminal)`,
  ].join("\n");
}
