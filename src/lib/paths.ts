import { homedir } from "os";
import { join } from "path";

export const HOME = homedir();
export const CLAUDE_DIR = join(HOME, ".claude");
export const CLAUDE_JSON = join(HOME, ".claude.json");

export const ROOT_DIR = join(HOME, ".claude-switch");
export const PROFILES_DIR = join(ROOT_DIR, "profiles");
export const ACTIVE_FILE = join(ROOT_DIR, "active");
export const SHARED_DIR = join(ROOT_DIR, "shared");

/**
 * Subdirs of ~/.claude that belong to the *user* (conversation history,
 * skills, plugins, etc.) rather than to a specific account, and therefore
 * get redirected via a per-profile junction into SHARED_DIR so they survive
 * profile switches.
 */
export const SHARED_SUBDIRS = [
  "projects",
  "todos",
  "plans",
  "skills",
  "plugins",
  "agents",
  "commands",
] as const;

export function sharedSubdir(name: string): string {
  return join(SHARED_DIR, name);
}

export function profileDir(name: string): string {
  return join(PROFILES_DIR, name);
}

export function profileSubdir(profile: string, sub: string): string {
  return join(profileDir(profile), sub);
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
