import { homedir } from "os";
import { join } from "path";

export const HOME = homedir();
export const CLAUDE_DIR = join(HOME, ".claude");
export const CLAUDE_JSON = join(HOME, ".claude.json");

export const ROOT_DIR = join(HOME, ".claude-switch");
export const PROFILES_DIR = join(ROOT_DIR, "profiles");
export const ACTIVE_FILE = join(ROOT_DIR, "active");

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
