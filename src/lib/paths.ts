import { homedir, platform } from "os";
import { join } from "path";

export const HOME = homedir();
export const IS_WIN = platform() === "win32";

export const CLAUDE_DIR = join(HOME, ".claude");
export const CLAUDE_JSON = join(HOME, ".claude.json");

export const ROOT_DIR = join(HOME, ".claude-switch");
export const PROFILES_DIR = join(ROOT_DIR, "profiles");
export const BIN_DIR = join(ROOT_DIR, "bin");

// Name of the currently active profile (human-readable).
export const ACTIVE_FILE = join(ROOT_DIR, "active");
// Absolute path to the active profile's dir (what shim + discord-rc read).
export const ACTIVE_PATH_FILE = join(ROOT_DIR, "active-path");
// Cached path to the real `claude` binary (what the shim execs).
export const REAL_CLAUDE_FILE = join(ROOT_DIR, "real-claude");

export function profileDir(name: string): string {
  return join(PROFILES_DIR, name);
}

export function profileCredentials(name: string): string {
  return join(profileDir(name), ".credentials.json");
}

export function profileSettings(name: string): string {
  return join(profileDir(name), "settings.json");
}

export function profileMeta(name: string): string {
  return join(profileDir(name), ".cs-meta.json");
}

export function profileAccountSnapshot(name: string): string {
  return join(profileDir(name), ".cs-account.json");
}

export const SHIM_NAME = IS_WIN ? "claude.cmd" : "claude";
export const SHIM_PATH = join(BIN_DIR, SHIM_NAME);
